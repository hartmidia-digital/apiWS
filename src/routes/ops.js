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

    const pkg = require('../../package.json');

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
            baileysVersion: pkg.dependencies['@whiskeysockets/baileys'],
            browserIdentity: 'Mac OS, Desktop',
            paths: pathsStatus
        }
    });
});

/**
 * Helper para extrair identidade humana (telefone e nome) da sessão de forma segura.
 */
function getSessionIdentity(liveSess, dbSess) {
    const identity = {
        phoneNumber: null,
        displayPhone: null,
        pushName: null,
        rawJid: null,
        available: false
    };

    if (liveSess && liveSess.user) {
        identity.available = true;
        identity.rawJid = liveSess.user.id;
        identity.pushName = liveSess.user.name || null;

        const rawPhone = identity.rawJid.split(':')[0].split('@')[0];
        identity.phoneNumber = rawPhone;

        if (rawPhone.length > 4) {
            identity.displayPhone = rawPhone.substring(0, 4) + '****' + rawPhone.substring(rawPhone.length - 4);
        } else {
            identity.displayPhone = rawPhone;
        }
    } else if (dbSess && dbSess.detail && dbSess.detail.includes('@s.whatsapp.net')) {
        identity.available = true;
        identity.rawJid = dbSess.detail;

        const rawPhone = dbSess.detail.split('@')[0].split(':')[0];
        identity.phoneNumber = rawPhone;

        if (rawPhone.length > 4) {
            identity.displayPhone = rawPhone.substring(0, 4) + '****' + rawPhone.substring(rawPhone.length - 4);
        } else {
            identity.displayPhone = rawPhone;
        }
    }

    return identity;
}

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
        const identity = getSessionIdentity(liveSess, dbSess);

        // DB is the source of truth for status since we update it real time
        return {
            id: dbSess.id,
            status: dbSess.status || 'DISCONNECTED',
            detail: dbSess.detail,
            identity: identity,
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

const currentQrBySession = new Map();

function connectSessionWithCoreCallbacks(sessionId) {
    whatsappService.connect(sessionId, (id, status, detail, qr) => {
        if (qr) {
            currentQrBySession.set(id, { qr, createdAt: Date.now() });

            // Clean up old QRs (TTL > 60s)
            for (const [key, value] of currentQrBySession.entries()) {
                if (Date.now() - value.createdAt > 60000) {
                    currentQrBySession.delete(key);
                }
            }
        }

        Session.updateStatus(id, status, detail);
        sendWebhook('session.status', id, { status, detail, state: status });
        const wss = engineLogger.wssInstance;
        if (wss) {
            const msg = JSON.stringify({ type: 'session-update', data: { sessionId: id, status, detail, qr }});
            wss.clients.forEach(c => {
                if (c.readyState === 1 && !c.isOpsClient) c.send(msg);
            });
        }
    }, (id, msg) => {
        sendWebhook('message.received', id, msg);
    }, (id, eventType, payload) => {
        sendWebhook(eventType, id, payload);
    });
}

/**
 * GET /api/v1/ops/sessions/:id/qr-current
 * Fetch current valid QR code if WebSocket failed to deliver
 */
router.get('/sessions/:id/qr-current', (req, res) => {
    const { id } = req.params;
    const session = Session.findById(id);
    if (!session) return res.status(404).json({ status: 'error', message: 'Sessão não encontrada' });

    // We can assume session is stopped if it's not connected and status is not connecting
    if (session.status === 'DISCONNECTED' && whatsappService.isSessionStopped && whatsappService.isSessionStopped(id)) {
         return res.status(404).json({ status: 'error', message: 'Sessão deletada ou parada' });
    }

    const qrData = currentQrBySession.get(id);
    if (qrData && Date.now() - qrData.createdAt < 60000) {
        return res.json({ status: 'success', data: { qr: qrData.qr } });
    }

    return res.status(404).json({ status: 'error', message: 'QR Code expirado ou não gerado' });
});

/**
 * POST /api/v1/ops/sessions/:id/connect
 */
router.post('/sessions/:id/connect', async (req, res) => {
    const { id } = req.params;
    const session = Session.findById(id);
    if (!session) return res.status(404).json({ status: 'error', message: 'Sessão não encontrada' });

    if (session.status === 'CONNECTING' || session.status === 'GENERATING_QR' || whatsappService.isConnected(id)) {
        return res.status(409).json({ status: 'error', message: 'Sessão já está em processo de conexão' });
    }

    // Allow manual connection after a reset by removing from stoppedSessions
    if (whatsappService.clearStoppedSession) {
        whatsappService.clearStoppedSession(id);
    }

    engineLogger.info('session', 'session.connecting', id, 'Comando de conexão iniciado via Ops');
    connectSessionWithCoreCallbacks(id);

    res.json({ status: 'success', message: 'Comando de conexão enviado' });
});

/**
 * POST /api/v1/ops/sessions/:id/disconnect
 */
router.post('/sessions/:id/disconnect', async (req, res) => {
    const { id } = req.params;
    engineLogger.info('session', 'session.disconnected', id, 'Comando de desconexão iniciado via Ops');
    await whatsappService.disconnect(id, true);

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
        connectSessionWithCoreCallbacks(id);
    }, 2000);

    res.json({ status: 'success', message: 'Reiniciando sessão' });
});

/**
 * POST /api/v1/ops/sessions/:id/reset-auth
 */
router.post('/sessions/:id/reset-auth', async (req, res) => {
    const { id } = req.params;
    engineLogger.warn('session', 'session.auth_reset', id, 'Reset de autenticação (exclusão de arquivos) solicitado via Ops');

    // Disconnect and remove folder but keep db record
    whatsappService.resetSessionAuth(id);

    Session.updateStatus(id, 'DISCONNECTED', '');

    res.json({ status: 'success', message: 'Autenticação resetada com sucesso' });
});

/**
 * DELETE /api/v1/ops/sessions/:id
 */
router.delete('/sessions/:id', async (req, res) => {
    const { id } = req.params;
    engineLogger.warn('session', 'session.deleted', id, 'Exclusão de sessão solicitada via Ops');

    whatsappService.deleteSessionData(id);

    res.json({ status: 'success', message: 'Sessão excluída' });
});

/**
 * Sanitiza objetos de detalhes técnicos (payloads), mascarando informações sensíveis no backend.
 */
function sanitizePayload(detailsObj) {
    if (!detailsObj) return detailsObj;
    let obj = typeof detailsObj === 'string' ? JSON.parse(detailsObj) : JSON.parse(JSON.stringify(detailsObj));

    function maskNode(node) {
        if (!node || typeof node !== 'object') return;
        for (const key in node) {
            if (['text', 'message', 'conversation', 'body', 'caption', 'captionMessage', 'vcard'].includes(key)) {
                node[key] = '[CONTEÚDO TEXTUAL OMITIDO]';
            } else if (['secret', 'token', 'authorization', 'cookie', 'password'].includes(key)) {
                node[key] = '[OMITIDO]';
            } else if (['headers', 'requestHeaders'].includes(key)) {
                node[key] = '[CABEÇALHOS OMITIDOS]';
            } else if (typeof node[key] === 'string') {
                const phoneRegex = /\b(\d{4})(\d{4,5})(\d{4})\b/g;
                node[key] = node[key].replace(phoneRegex, '$1****$3');
            } else if (typeof node[key] === 'object') {
                maskNode(node[key]);
            }
        }
    }
    maskNode(obj);
    return obj;
}

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
    const sanitizedLogs = logs.map(l => ({ ...l, details: sanitizePayload(l.details) }));
    res.json({ status: 'success', data: sanitizedLogs });
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
    const errorLogs = EngineLog.getLogs({ category: 'webhook', event: 'webhook.dispatch_failed' }, 100);

    const errorsToday = errorLogs.filter(l => l.created_at >= startStr);

    let lastSuccessStr = null;
    if (successLogs.length > 0) {
        const log = successLogs[0];
        const status = log.details && log.details.statusCode ? `HTTP ${log.details.statusCode}` : 'HTTP 200';
        lastSuccessStr = `${new Date(log.created_at).toLocaleString()} · ${log.details?.eventType || log.event} · ${status}`;
    }

    let lastErrorStr = null;
    if (errorsToday.length > 0) {
        const log = errorsToday[0];
        lastErrorStr = `${new Date(log.created_at).toLocaleString()} · ${log.details?.eventType || log.event} · Erro`;
    }

    const recentFailures = errorLogs.slice(0, 10).map(l => ({
        createdAt: l.created_at,
        sessionId: l.session_id,
        eventType: l.details?.eventType || l.event,
        error: l.details?.error || l.message,
        details: sanitizePayload(l.details)
    }));

    res.json({
        status: 'success',
        data: {
            webhookUrl: process.env.WEBHOOK_URL,
            hasSecret: !!process.env.WEBHOOK_SECRET,
            engineId: process.env.APIWS_ENGINE_ID,
            publicUrl: process.env.APIWS_PUBLIC_URL,
            stats: {
                successToday: successLogs.length,
                errorsToday: errorsToday.length,
                lastSuccess: lastSuccessStr,
                lastError: lastErrorStr,
                recentFailures: recentFailures
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
