/**
 * WhatsApp API Server - Main Entry Point
 * Version 3.2.0
 *
 * This is the refactored entry point using the new modular architecture.
 * All business logic has been moved to src/ directory.
 */

// Memory optimization for production environments
if (process.env.NODE_ENV === 'production') {
    if (!process.env.NODE_OPTIONS) {
        process.env.NODE_OPTIONS = '--max-old-space-size=1024';
    }
    if (global.gc) {
        setInterval(() => global.gc(), 60000);
    }
}

require('dotenv').config();

const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');
const session = require('express-session');
const FileStore = require('session-file-store')(session);
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

// Import new modules
const { db } = require('./src/config/database');
const { User, Session, ActivityLog } = require('./src/models');
const { encrypt, decrypt, isValidKey } = require('./src/utils/crypto');
const response = require('./src/utils/response');
const whatsappService = require('./src/services/whatsapp');
const authRoutes = require('./src/routes/auth');
const userRoutes = require('./src/routes/users');
const { errorHandler, notFoundHandler } = require('./src/middleware/errorHandler');

// API v1 (includes legacy endpoints)
const { initializeApi } = require('./src/routes/api');
const { sendWebhook } = require('./src/utils/webhookHaxis');
const opsRoutes = require('./src/routes/ops');
const engineLogger = require('./src/utils/engineLogger');

// Validate encryption key
const ENCRYPTION_KEY = process.env.TOKEN_ENCRYPTION_KEY;
if (!ENCRYPTION_KEY || !isValidKey(ENCRYPTION_KEY)) {
    console.error('FATAL: TOKEN_ENCRYPTION_KEY must be at least 64 hexadecimal characters!');
    console.error('Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
    process.exit(1);
}

// Validação de variáveis obrigatórias para multi-sessões (HAXIS APIH)
const isProduction = process.env.NODE_ENV === 'production';
if (isProduction && !process.env.APIWS_ENGINE_ID) {
    console.error('FATAL: APIWS_ENGINE_ID é obrigatório em ambiente de produção!');
    console.error('A apiWS não pode iniciar sem saber a sua própria identidade (engine_id) para informar ao APIH.');
    console.error('Configure APIWS_ENGINE_ID no arquivo .env (ex: APIWS_ENGINE_ID=apiws.hartmidia.com).');
    process.exit(1);
}

if (isProduction && !process.env.APIWS_PUBLIC_URL) {
    console.warn('AVISO: APIWS_PUBLIC_URL não está configurada. É altamente recomendado definir a URL base pública (ex: https://apiws.hartmidia.com) em produção.');
}

// Validação de limite de sessões (MAX_SESSIONS)
if (process.env.MAX_SESSIONS) {
    const parsedMaxSessions = parseInt(process.env.MAX_SESSIONS, 10);
    if (isNaN(parsedMaxSessions) || parsedMaxSessions <= 0) {
        console.warn('AVISO: MAX_SESSIONS configurado com valor inválido no .env. Deve ser um número inteiro positivo.');
        console.warn('Aplicando fallback de segurança: MAX_SESSIONS=5.');
        process.env.MAX_SESSIONS = '5';
    }
} else {
    process.env.MAX_SESSIONS = '5';
}

// Initialize Express
const app = express();
app.set('trust proxy', 'loopback');
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Set WebSocket instance to EngineLogger for broadcasting logs
engineLogger.setWss(wss);

// WebSocket clients map
const wsClients = new Map();

// Session configuration
const sessionSecret = process.env.SESSION_SECRET || 'dev-secret-change-me';

if (isProduction && !process.env.SESSION_SECRET) {
    console.error('FATAL: SESSION_SECRET environment variable is required in production mode!');
    process.exit(1);
}

const sessionStore = new FileStore({
    path: './sessions',
    ttl: 86400,
    retries: 0,
    secret: sessionSecret,
    logFn: () => { }
});

// Middleware
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Segurança: Não servir todo o diretório raiz. Limitar ao necessário.
const haxisPaths = require('./src/config/paths');
app.use('/admin', express.static(path.join(__dirname, 'admin')));
app.use('/media', express.static(haxisPaths.media));

app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
}));

app.use(rateLimit({
    windowMs: 60 * 1000,
    max: 100,
    message: { status: 'error', message: 'Too many requests' },
    standardHeaders: true,
    legacyHeaders: false,
    validate: { trustProxy: false }
}));

app.use(session({
    store: sessionStore,
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        secure: process.env.COOKIE_SECURE === 'true', // Only use secure cookies if explicitly enabled or on HTTPS
        sameSite: 'lax',
        maxAge: 24 * 60 * 60 * 1000
    }
}));

// Ops dashboard static files - secure access (Must be after session middleware)
app.use('/ops', (req, res, next) => {
    // Allow static assets
    if (req.path.startsWith('/css/') || req.path.startsWith('/js/')) {
        return next();
    }
    // Protect HTML pages
    if (!req.session?.adminAuthed || req.session?.userRole !== 'admin') {
        return res.redirect('/admin/login.html');
    }
    next();
}, express.static(path.join(__dirname, 'ops')));

// WebSocket handler
wss.on('connection', (ws, req) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const wsToken = url.searchParams.get('token');

    // Check if client is connecting to /ops/ws
    if (url.pathname === '/ops/ws') {
        ws.isOpsClient = true;
    } else {
        ws.isOpsClient = false;
    }

    let userInfo = null;

    // Validate wsToken if the client is Ops
    if (ws.isOpsClient) {
        if (!wsToken) {
            console.warn('Ops WebSocket connection rejected: No token provided');
            ws.close();
            return;
        }

        // As a simple validation, we don't have direct session access here without parsing cookies.
        // We will just let the frontend know that it needs to be authenticated by checking if it provided *a* token
        // that was likely given to it by the /ws-token endpoint.
        // A true robust implementation requires parsing the express session cookie here,
        // but since this is isolated per ops client, and we verified they are logged in to GET the token:

        // This TODO was flagged by the reviewer. Let's do a basic session lookup!
        // We need the session ID from the cookie.
        const cookie = req.headers.cookie;
        if (!cookie || !cookie.includes('connect.sid=')) {
            ws.close();
            return;
        }

        const sidStr = cookie.split('connect.sid=s%3A')[1]?.split('.')[0];
        if (sidStr) {
            sessionStore.get(sidStr, (err, sessionData) => {
                if (err || !sessionData || sessionData.wsToken !== wsToken || sessionData.userRole !== 'admin') {
                    console.warn('Ops WebSocket connection rejected: Invalid token or role');
                    ws.close();
                    return;
                }

                // Connection authorized!
                wsClients.set(ws, userInfo);
                ws.on('close', () => wsClients.delete(ws));
            });
            return;
        } else {
            ws.close();
            return;
        }
    }

    wsClients.set(ws, userInfo);

    ws.on('close', () => {
        wsClients.delete(ws);
    });
});

// Broadcast to all WebSocket clients
function broadcastToClients(data) {
    const message = JSON.stringify(data);
    for (const [client] of wsClients) {
        if (client.readyState === 1) {
            client.send(message);
        }
    }
}

// Mount new routes
app.use('/api/v1/ops', opsRoutes);
app.use('/admin', authRoutes);
app.use('/admin/users', userRoutes);

// Endpoint seguro de verificação de saúde (Healthcheck)
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        app: 'apiws',
        environment: process.env.NODE_ENV || 'development'
    });
});

// Static pages
app.get('/api-documentation', (req, res) => {
    res.sendFile(path.join(__dirname, 'api_documentation.html'));
});

app.get('/admin/login.html', (req, res) => {
    if (req.session?.adminAuthed) {
        return res.redirect('/admin/dashboard.html');
    }
    res.sendFile(path.join(__dirname, 'admin', 'login.html'));
});

app.get('/admin/dashboard.html', (req, res) => {
    if (!req.session?.adminAuthed) {
        return res.redirect('/admin/login.html');
    }
    res.sendFile(path.join(__dirname, 'admin', 'dashboard.html'));
});

// Initialize wrappers for API
const sessionTokens = new Map();

const log = (message, context, details, level) => {
    // Determine level if not provided (heuristic)
    if (!level) {
        const lowerMsg = message.toLowerCase();
        if (lowerMsg.includes('error') || lowerMsg.includes('fail')) level = 'ERROR';
        else if (lowerMsg.includes('warn')) level = 'WARN';
        else level = 'INFO';
    }

    const logObject = {
        type: 'log',
        timestamp: new Date().toISOString(),
        sessionId: context || 'SYSTEM',
        message: message,
        level: level,
        details: details || null
    };

    // Print to console
    console.log(`[${logObject.timestamp}] [${logObject.level}] [${logObject.sessionId}] ${message}`, details || '');

    // Broadcast to all connected dashboard clients
    broadcastToClients(logObject);
};

const userManager = {
    getSessionOwner: (sessionId) => {
        const s = Session.findById(sessionId);
        return s ? { email: s.owner_email } : null;
    }
};

// Dummy functions for overlap routes (handled by index.js primarily)
const createSessionWrapper = async (sessionId, email) => { /* handled by index.js route */ };
const deleteSessionWrapper = async (sessionId) => { /* handled by index.js route */ };
const getSessionsDetailsWrapper = () => [];

// Session Proxy to adapt whatsappService sockets (Map<string, Socket>) to api.js expectation ({ sock, status })
const sessionsProxy = {
    get: (sessionId) => {
        const sock = whatsappService.getSocket(sessionId);
        if (sock) {
            return {
                sock: sock,
                status: 'CONNECTED' // whatsappService only keeps active sockets
            };
        }
        return null;
    },
    has: (sessionId) => {
        return whatsappService.getActiveSessions().has(sessionId);
    },
    keys: () => {
        return Array.from(whatsappService.getActiveSessions().keys());
    },
    forEach: (callback) => {
        whatsappService.getActiveSessions().forEach((sock, sessionId) => {
            callback({
                sock: sock,
                status: 'CONNECTED',
                owner: 'unknown', // not available in socket
                detail: 'Connected via proxy'
            }, sessionId);
        });
    }
};

const apiRouter = initializeApi(
    sessionsProxy,
    sessionTokens,
    createSessionWrapper,
    getSessionsDetailsWrapper,
    deleteSessionWrapper,
    log,
    userManager,
    ActivityLog
);


// WhatsApp session management endpoints
app.get('/api/v1/sessions', (req, res) => {
    if (!req.session?.adminAuthed) {
        return response.unauthorized(res);
    }

    const sessions = Session.getAll(req.session.userEmail, req.session.userRole === 'admin');
    const activeSockets = whatsappService.getActiveSessions();

    // Enrich with live status and map id -> sessionId
    const enriched = sessions.map(s => ({
        ...s,
        sessionId: s.id, // Frontend expects sessionId
        isConnected: activeSockets.has(s.id)
    }));

    return response.success(res, enriched);
});

app.post('/api/v1/sessions', async (req, res) => {
    if (!req.session?.adminAuthed) {
        return response.unauthorized(res);
    }

    const { sessionId } = req.body;
    if (!sessionId) {
        return response.validationError(res, ['sessionId is required']);
    }

    try {
        // Verifica o limite seguro configurado em MAX_SESSIONS (com fallback nativo de segurança)
        const maxSessionsStr = process.env.MAX_SESSIONS || '5';
        let maxSessions = parseInt(maxSessionsStr, 10);

        if (isNaN(maxSessions) || maxSessions <= 0) {
            maxSessions = 5;
        }

        const existingSessionsCount = Session.getAll().length;

        if (existingSessionsCount >= maxSessions) {
            return response.error(res, 'Limite máximo de sessões atingido. Ajuste MAX_SESSIONS no ambiente se precisar ampliar a capacidade.', 403);
        }

        // Create session in database
        const session = Session.create(sessionId, req.session.userEmail);

        // Add sessionId alias for frontend compatibility
        const responseSession = { ...session, sessionId: session.id };

        // Connect to WhatsApp
        whatsappService.connect(sessionId, (id, status, detail, qr) => {
            Session.updateStatus(id, status, detail);
            sendWebhook('session.status', id, { status, detail, state: status });
            broadcastToClients({
                type: 'session-update',
                data: { sessionId: id, status, detail, qr }
            });
        }, (id, msg) => {
            sendWebhook('message.received', id, msg);
        }, (id, eventType, payload) => {
            sendWebhook(eventType, id, payload);
        });

        // Update sessionTokens map
        if (session.token) {
            sessionTokens.set(sessionId, session.token);
        }

        ActivityLog.logSessionCreate(req.session.userEmail, sessionId, req.ip, req.headers['user-agent']);

        return response.success(res, responseSession, 201);
    } catch (err) {
        if (err.message === 'Session already exists') {
            return response.error(res, 'Session already exists', 409);
        }
        throw err;
    }
});

app.delete('/api/v1/sessions/:sessionId', (req, res) => {
    if (!req.session?.adminAuthed) {
        return response.unauthorized(res);
    }

    const { sessionId } = req.params;

    whatsappService.deleteSessionData(sessionId);
    sessionTokens.delete(sessionId);
    ActivityLog.logSessionDelete(req.session.userEmail, sessionId, req.ip, req.headers['user-agent']);

    broadcastToClients({
        type: 'session-deleted',
        data: { sessionId }
    });

    return response.success(res, { message: 'Session deleted' });
});

// QR Code endpoint - triggers reconnection to generate new QR
app.get('/api/v1/sessions/:sessionId/qr', (req, res) => {
    if (!req.session?.adminAuthed) {
        return response.unauthorized(res);
    }

    const { sessionId } = req.params;

    // Check if session exists in database
    const session = Session.findById(sessionId);
    if (!session) {
        return response.error(res, 'Session not found', 404);
    }

    // Check if already connected
    if (whatsappService.isConnected(sessionId)) {
        return response.error(res, 'Session is already connected', 400);
    }

    // Disconnect if currently connecting/reconnecting
    whatsappService.disconnect(sessionId);

    // Reconnect to trigger QR generation
    whatsappService.connect(sessionId, (id, status, detail, qr) => {
        Session.updateStatus(id, status, detail);
        sendWebhook('session.status', id, { status, detail, state: status });
            broadcastToClients({
            type: 'session-update',
            data: { sessionId: id, status, detail, qr }
        });
        }, (id, msg) => {
            sendWebhook('message.received', id, msg);
        }, (id, eventType, payload) => {
            sendWebhook(eventType, id, payload);
        });

    return response.success(res, { message: 'QR code generation started' });
});

// Mount API router (Last, so it doesn't shadow explicit index.js routes)
app.use('/api/v1', apiRouter);

// Error handlers
app.use(notFoundHandler);
app.use(errorHandler);

// Ensure default admin exists
User.ensureAdmin(process.env.ADMIN_DASHBOARD_PASSWORD);

// Initialize existing sessions on startup
(async () => {
    // Sync sessions from disk to DB
    Session.syncWithFilesystem();

    const existingSessions = Session.getAll();
    console.log(`[SYSTEM] Found ${existingSessions.length} existing session(s)`);

    for (const session of existingSessions) {
        // Populate sessionTokens
        if (session.token) {
            sessionTokens.set(session.id, session.token);
        }

        // Re-initialize any session that was previously connected, disconnected, or stuck in connecting
        const statusesToReinit = ['CONNECTED', 'DISCONNECTED', 'CONNECTING', 'INITIALIZING'];
        if (statusesToReinit.includes(session.status)) {
            console.log(`[SYSTEM] Re-initializing session: ${session.id} (last status: ${session.status})`);

            // Reset status to DISCONNECTED briefly to ensure a clean slate for Baileys
            Session.updateStatus(session.id, 'DISCONNECTED', 'Restarting...');

            whatsappService.connect(session.id, (id, status, detail, qr) => {
                Session.updateStatus(id, status, detail);
                sendWebhook('session.status', id, { status, detail, state: status });
                broadcastToClients({
                    type: 'session-update',
                    data: { sessionId: id, status, detail, qr }
                });
            }, (id, msg) => {
                sendWebhook('message.received', id, msg);
            }, (id, eventType, payload) => {
                sendWebhook(eventType, id, payload);
            });
        }
    }
})();

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`[SYSTEM] Server is running on port ${PORT}`);
    console.log(`[SYSTEM] Admin dashboard: http://localhost:${PORT}/admin/dashboard.html`);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n[SYSTEM] Shutting down...');

    // Disconnect all WhatsApp sessions
    for (const [sessionId] of whatsappService.getActiveSessions()) {
        whatsappService.disconnect(sessionId);
    }

    server.close(() => {
        console.log('[SYSTEM] Server closed');
        process.exit(0);
    });
});

module.exports = { app, server, wss };
