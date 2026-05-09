const express = require('express');
const router = express.Router();
const os = require('os');
const fs = require('fs');
const path = require('path');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const EngineLog = require('../models/EngineLog');
const haxisPaths = require('../config/paths');
const whatsappService = require('../services/whatsapp');
const { Session } = require('../models');
const engineLogger = require('../utils/engineLogger');
const { sendWebhook } = require('../utils/webhookHaxis');

// All ops routes require admin access
router.use(requireAuth);
router.use(requireAdmin);

/**
 * GET /api/v1/ops/overview
 * Overview stats for the dashboard
 */
router.get('/overview', (req, res) => {
    const memory = process.memoryUsage();

    // Total db sessions
    const dbSessions = Session.getAll('admin@localhost', true);

    // Active connections in memory
    const activeSessionsMap = whatsappService.getActiveSessions();
    let connectedCount = 0;
    // Iterate DB sessions to see which are actually CONNECTED
    dbSessions.forEach(s => {
        if (s.status === 'CONNECTED') connectedCount++;
    });

    // Get last webhook log
    const lastWebhookLogs = EngineLog.getLogs({ category: 'webhook', event: 'webhook.dispatch_success' }, 1);
    let lastWebhookTime = null;
    if (lastWebhookLogs && lastWebhookLogs.length > 0) {
        lastWebhookTime = new Date(lastWebhookLogs[0].created_at).toLocaleString();
    }

    res.json({
        status: 'success',
        data: {
            motorStatus: 'Online',
            sessionsTotal: dbSessions.length,
            sessionsConnected: connectedCount,
            engineId: process.env.APIWS_ENGINE_ID || 'N/A',
            nodeEnv: process.env.NODE_ENV || 'development',
            uptimeFormatted: formatUptime(process.uptime()),
            memoryUsage: formatBytes(memory.rss),
            lastWebhook: lastWebhookTime
        }
    });
});

/**
 * GET /api/v1/ops/health
 * Detailed health diagnostics
 */
router.get('/health', (req, res) => {
    const memory = process.memoryUsage();

    const dbSessions = Session.getAll('admin@localhost', true);
    const activeSessions = whatsappService.getActiveSessions();

    const pathsStatus = {};
    for (const [key, p] of Object.entries(haxisPaths)) {
        pathsStatus[key] = {
            path: p,
            writable: canWriteToPath(p)
        };
    }

    res.json({
        status: 'success',
        data: {
            nodeVersion: process.version,
            uptimeFormatted: formatUptime(process.uptime()),
            memoryUsage: formatBytes(memory.rss),
            nodeEnv: process.env.NODE_ENV || 'development',
            port: process.env.PORT || 3000,
            engineId: process.env.APIWS_ENGINE_ID,
            publicUrl: process.env.APIWS_PUBLIC_URL,
            maxSessions: process.env.MAX_SESSIONS || 5,
            sessionsInDb: dbSessions.length,
            sessionsInMemory: activeSessions.size,
            paths: pathsStatus
        }
    });
});

/**
 * GET /api/v1/ops/sessions
 * List all sessions with current actual status
 */
router.get('/sessions', (req, res) => {
    // Get from DB
    const dbSessions = Session.getAll('admin@localhost', true);

    // Augment with live memory status
    const result = dbSessions.map(dbSess => {
        const liveSess = whatsappService.getActiveSessions().get(dbSess.id);
        // DB is the source of truth for status since we update it real time
        return {
            id: dbSess.id,
            status: dbSess.status || 'DISCONNECTED',
            detail: dbSess.detail,
            createdAt: dbSess.created_at,
            updatedAt: dbSess.updated_at
        };
    });

    res.json({ status: 'success', data: result });
});

/**
 * POST /api/v1/ops/sessions
 * Create a new session
 */
router.post('/sessions', async (req, res) => {
    const { sessionId } = req.body;
    if (!sessionId || !/^[a-z0-9-]+$/.test(sessionId)) {
        return res.status(400).json({ status: 'error', message: 'ID de sessão inválido (apenas letras minúsculas, números e hífens)' });
    }

    // Check Max sessions
    const max = parseInt(process.env.MAX_SESSIONS || '5', 10);
    const current = Session.getAll('admin@localhost', true).length;
    if (current >= max) {
        return res.status(403).json({ status: 'error', message: `Limite de sessões (${max}) atingido.` });
    }

    try {
        const ownerEmail = req.session?.userEmail || 'admin@localhost';
        const session = Session.create(sessionId, ownerEmail);

        engineLogger.info('session', 'session.created', sessionId, 'Sessão criada via painel Ops');
        res.json({ status: 'success', data: session });
    } catch (e) {
        engineLogger.error('session', 'session.error', sessionId, 'Erro ao criar sessão', { error: e.message });
        res.status(500).json({ status: 'error', message: e.message });
    }
});

/**
 * POST /api/v1/ops/sessions/:id/connect
 */
router.post('/sessions/:id/connect', async (req, res) => {
    const { id } = req.params;
    const session = Session.findById(id);
    if (!session) return res.status(404).json({ status: 'error', message: 'Sessão não encontrada' });

    engineLogger.info('session', 'session.connecting', id, 'Comando de conexão iniciado via Ops');

    whatsappService.connect(id, (sid, status, detail, qr) => {
        Session.updateStatus(sid, status, detail);
        sendWebhook('session.status', sid, { status, detail, state: status });

        // Broadcast temporário extra além do DB se necessário,
        // mas o index.js já tem loops de reconnect e o painel Ops ouve os logs do engineLogger e webhook.
        // Se quisermos repassar o evento específico do WS legado:
        const wss = engineLogger.wssInstance;
        if (wss) {
            const msg = JSON.stringify({ type: 'session-update', data: { sessionId: sid, status, detail, qr }});
            wss.clients.forEach(c => {
                if (c.readyState === 1 && !c.isOpsClient) c.send(msg); // envia pro painel legado
            });
        }
    }, (sid, msg) => {
        sendWebhook('message.received', sid, msg);
    }, (sid, eventType, payload) => {
        sendWebhook(eventType, sid, payload);
    });

    res.json({ status: 'success', message: 'Comando de conexão enviado' });
});

/**
 * POST /api/v1/ops/sessions/:id/disconnect
 */
router.post('/sessions/:id/disconnect', async (req, res) => {
    const { id } = req.params;
    engineLogger.info('session', 'session.disconnected', id, 'Comando de desconexão iniciado via Ops');
    await whatsappService.disconnect(id);

    // Update DB status to disconnected
    Session.updateStatus(id, 'DISCONNECTED', '');

    res.json({ status: 'success', message: 'Sessão desconectada' });
});

/**
 * POST /api/v1/ops/sessions/:id/restart
 */
router.post('/sessions/:id/restart', async (req, res) => {
    const { id } = req.params;
    engineLogger.info('session', 'session.reconnecting', id, 'Reinício de conexão solicitado via Ops');
    await whatsappService.disconnect(id);

    setTimeout(() => {
        whatsappService.connect(id, (sid, status, detail, qr) => {
            Session.updateStatus(sid, status, detail);
            sendWebhook('session.status', sid, { status, detail, state: status });

            const wss = engineLogger.wssInstance;
            if (wss) {
                const msg = JSON.stringify({ type: 'session-update', data: { sessionId: sid, status, detail, qr }});
                wss.clients.forEach(c => {
                    if (c.readyState === 1 && !c.isOpsClient) c.send(msg);
                });
            }
        }, (sid, msg) => {
            sendWebhook('message.received', sid, msg);
        }, (sid, eventType, payload) => {
            sendWebhook(eventType, sid, payload);
        });
    }, 2000);

    res.json({ status: 'success', message: 'Reiniciando sessão' });
});

/**
 * POST /api/v1/ops/sessions/:id/reset-auth
 */
router.post('/sessions/:id/reset-auth', async (req, res) => {
    const { id } = req.params;
    engineLogger.warn('session', 'session.auth_reset', id, 'Reset de autenticação (exclusão de arquivos) solicitado via Ops');

    await whatsappService.disconnect(id);

    // Delete folder
    const authPath = path.join(haxisPaths.authInfo, `session-${id}`);
    if (fs.existsSync(authPath)) {
        fs.rmSync(authPath, { recursive: true, force: true });
    }

    Session.updateStatus(id, { status: 'DISCONNECTED', detail: '' });

    res.json({ status: 'success', message: 'Autenticação resetada com sucesso' });
});

/**
 * DELETE /api/v1/ops/sessions/:id
 */
router.delete('/sessions/:id', async (req, res) => {
    const { id } = req.params;
    engineLogger.warn('session', 'session.deleted', id, 'Exclusão de sessão solicitada via Ops');

    await whatsappService.disconnect(id);

    const authPath = path.join(haxisPaths.authInfo, `session-${id}`);
    if (fs.existsSync(authPath)) {
        fs.rmSync(authPath, { recursive: true, force: true });
    }

    Session.delete(id);

    res.json({ status: 'success', message: 'Sessão excluída' });
});

/**
 * GET /api/v1/ops/logs
 */
router.get('/logs', (req, res) => {
    const filters = {
        sessionId: req.query.sessionId,
        level: req.query.level,
        category: req.query.category,
        event: req.query.event
    };

    const logs = EngineLog.getLogs(filters, 100);
    res.json({ status: 'success', data: logs });
});

/**
 * GET /api/v1/ops/integration
 */
router.get('/integration', (req, res) => {
    // Stats from engine logs today
    const startOfDay = new Date();
    startOfDay.setHours(0,0,0,0);
    const startStr = startOfDay.toISOString();

    const successLogs = EngineLog.getLogs({ category: 'webhook', event: 'webhook.dispatch_success' }, 1000)
        .filter(l => l.created_at >= startStr);
    const errorLogs = EngineLog.getLogs({ category: 'webhook', event: 'webhook.dispatch_failed' }, 1000)
        .filter(l => l.created_at >= startStr);

    res.json({
        status: 'success',
        data: {
            webhookUrl: process.env.WEBHOOK_URL,
            hasSecret: !!process.env.WEBHOOK_SECRET,
            engineId: process.env.APIWS_ENGINE_ID,
            publicUrl: process.env.APIWS_PUBLIC_URL,
            stats: {
                successToday: successLogs.length,
                errorsToday: errorLogs.length,
                lastSuccess: successLogs.length > 0 ? successLogs[0].created_at : null,
                lastError: errorLogs.length > 0 ? errorLogs[0].created_at : null
            }
        }
    });
});

/**
 * POST /api/v1/ops/webhooks/test
 */
router.post('/webhooks/test', async (req, res) => {
    const payload = {
        event: 'webhook.test',
        source: 'apiws',
        engineId: process.env.APIWS_ENGINE_ID || 'N/A',
        publicUrl: process.env.APIWS_PUBLIC_URL || 'N/A',
        timestamp: new Date().toISOString(),
        message: 'Teste de conectividade do Console Operacional ApiWS'
    };

    engineLogger.info('webhook', 'webhook.test_started', null, 'Iniciando teste de conectividade Webhook');

    const start = Date.now();
    try {
        const axios = require('axios');
        const timeoutMs = parseInt(process.env.WEBHOOK_TIMEOUT_MS || '5000', 10);

        const payloadString = JSON.stringify(payload);
        const headers = {
            'Content-Type': 'application/json',
            'X-Haxis-Event-Id': 'test-uuid',
            'X-Haxis-Event-Type': payload.event,
            'X-Haxis-Timestamp': payload.timestamp
        };

        if (process.env.WEBHOOK_SECRET) {
            const crypto = require('crypto');
            headers['X-Haxis-Signature'] = crypto.createHmac('sha256', process.env.WEBHOOK_SECRET)
                .update(payloadString)
                .digest('hex');
        }

        const axiosRes = await axios.post(process.env.WEBHOOK_URL, payloadString, { headers, timeout: timeoutMs });
        const duration = Date.now() - start;

        engineLogger.info('webhook', 'webhook.dispatch_success', null, 'Teste de webhook enviado com sucesso', { statusCode: axiosRes.status, durationMs: duration });

        res.json({ status: 'success', data: { statusCode: axiosRes.status, durationMs: duration } });
    } catch (error) {
        const duration = Date.now() - start;
        engineLogger.error('webhook', 'webhook.dispatch_failed', null, 'Falha no teste de webhook', { error: error.message, durationMs: duration });
        res.status(500).json({ status: 'error', message: error.message });
    }
});


// Utility functions
function formatUptime(seconds) {
    const days = Math.floor(seconds / (3600*24));
    seconds -= days * 3600 * 24;
    const hrs = Math.floor(seconds / 3600);
    seconds -= hrs * 3600;
    const mnts = Math.floor(seconds / 60);
    return `${days}d ${hrs}h ${mnts}m`;
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024, sizes = ['Bytes', 'KB', 'MB', 'GB'], i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function canWriteToPath(p) {
    try {
        if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
        const testFile = path.join(p, '.write-test');
        fs.writeFileSync(testFile, 'test');
        fs.unlinkSync(testFile);
        return true;
    } catch (e) {
        return false;
    }
}

module.exports = router;
