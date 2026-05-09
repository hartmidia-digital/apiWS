/**
 * WhatsApp Service
 * Handles Baileys WhatsApp connection logic
 */

const {
    default: makeWASocket,
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    fetchLatestWaWebVersion,
    makeCacheableSignalKeyStore,
    isJidBroadcast,
    Browsers,
    DisconnectReason,
    downloadMediaMessage
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const FormData = require('form-data');
const Session = require('../models/Session');
const ActivityLog = require('../models/ActivityLog');
const haxisPaths = require('../config/paths');
const engineLogger = require('../utils/engineLogger');

// Logger configuration
const defaultLogLevel = "info";
const logger = pino({ level: process.env.LOG_LEVEL || defaultLogLevel });

// Active socket connections (in-memory)
const activeSockets = new Map();
const retryCounters = new Map();

// Auth directory
const AUTH_DIR = haxisPaths.authInfo;

const MEDIA_TYPE_MAP = {
    imageMessage: { type: 'image', extension: 'jpg' },
    videoMessage: { type: 'video', extension: 'mp4' },
    audioMessage: { type: 'audio', extension: 'ogg' },
    documentMessage: { type: 'document', extension: 'bin' },
    stickerMessage: { type: 'image', extension: 'webp' }
};

/**
 * Ensure auth directory exists
 */
function ensureAuthDir() {
    if (!fs.existsSync(AUTH_DIR)) {
        fs.mkdirSync(AUTH_DIR, { recursive: true });
    }
}

/**
 * Connect to WhatsApp
 * @param {string} sessionId - Session ID
 * @param {function} onUpdate - Callback for status updates
 * @param {function} onMessage - Callback for incoming messages
 * @param {function} onEvent - Callback for non-message WhatsApp events
 * @returns {object} Socket connection
 */
async function connect(sessionId, onUpdate, onMessage, onEvent) {
    if (!require('../utils/validation').isValidId(sessionId)) {
        throw new Error('Invalid session ID');
    }

    ensureAuthDir();

    const sessionDir = path.join(AUTH_DIR, sessionId);
    if (!fs.existsSync(sessionDir)) {
        fs.mkdirSync(sessionDir, { recursive: true });
    }

    // Update session status
    Session.updateStatus(sessionId, 'CONNECTING', 'Initializing...');
    if (onUpdate) onUpdate(sessionId, 'CONNECTING', 'Initializing...', null);

    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

    // Get latest WA version (with fallback)
    let version;
    try {
        const waVersion = await fetchLatestWaWebVersion({});
        version = waVersion.version;
        console.log(`[${sessionId}] Using WA Web version: ${version.join('.')}`);
    } catch (e) {
        const baileysVersion = await fetchLatestBaileysVersion();
        version = baileysVersion.version;
        console.log(`[${sessionId}] Using Baileys version: ${version.join('.')} (fallback)`);
    }

    const sock = makeWASocket({
        version,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, logger),
        },
        printQRInTerminal: false,
        logger,
        browser: Browsers.ubuntu('Chrome'),
        generateHighQualityLinkPreview: false,
        shouldIgnoreJid: (jid) => isJidBroadcast(jid),
        qrTimeout: 40000,
        markOnlineOnConnect: true,
        syncFullHistory: false,
        retryRequestDelayMs: 500,
        maxMsgRetryCount: 3,
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 25000,
        defaultQueryTimeoutMs: undefined,
        getMessage: async () => ({ conversation: 'hello' })
    });

    // Store socket reference
    activeSockets.set(sessionId, sock);

    const emitEvent = (eventType, payload) => {
        if (onEvent) {
            onEvent(sessionId, eventType, payload);
        }
    };

    // Handle credentials update
    sock.ev.on('creds.update', saveCreds);

    // Handle connection updates
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            Session.updateStatus(sessionId, 'GENERATING_QR', 'Scan QR code');
            engineLogger.info('session', 'session.qr_generated', sessionId, 'QR Code gerado (não persistido)');
            if (onUpdate) onUpdate(sessionId, 'GENERATING_QR', 'Scan QR code', qr);

            // Broadcast QR directly via WebSocket to bypass DB logging
            const wss = require('../../index').wss || engineLogger.wssInstance;
            if (wss) {
                const qrMessage = JSON.stringify({
                    event: 'qr.generated',
                    sessionId: sessionId,
                    qr: qr
                });
                wss.clients.forEach(client => {
                    if (client.readyState === 1 && client.isOpsClient) client.send(qrMessage);
                });
            }
        }

        if (connection === 'connecting') {
            Session.updateStatus(sessionId, 'CONNECTING', 'Connecting...');
            engineLogger.info('session', 'session.connecting', sessionId, 'Tentando conectar...');
            if (onUpdate) onUpdate(sessionId, 'CONNECTING', 'Connecting...', null);
        }

        if (connection === 'open') {
            console.log(`[${sessionId}] Connected!`);
            retryCounters.delete(sessionId);

            const name = sock.user?.name || 'Unknown';
            Session.updateStatus(sessionId, 'CONNECTED', `Connected as ${name}`);
            engineLogger.info('session', 'session.connected', sessionId, 'Sessão conectada com sucesso', { deviceName: name });
            if (onUpdate) onUpdate(sessionId, 'CONNECTED', `Connected as ${name}`, null);

            // Broadcast connected event to clear QR modal in UI
            const wss = require('../../index').wss || engineLogger.wssInstance;
            if (wss) {
                const connMessage = JSON.stringify({
                    event: 'session.connected',
                    sessionId: sessionId
                });
                wss.clients.forEach(client => {
                    if (client.readyState === 1 && client.isOpsClient) client.send(connMessage);
                });
            }
        }

        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const reason = lastDisconnect?.error?.output?.payload?.message || 'Connection closed';

            console.log(`[${sessionId}] Disconnected: ${statusCode} - ${reason}`);
            Session.updateStatus(sessionId, 'DISCONNECTED', reason);
            if (onUpdate) onUpdate(sessionId, 'DISCONNECTED', reason, null);

            // Handle reconnection logic
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut && statusCode !== 401 && statusCode !== 403;

            if (shouldReconnect) {
                engineLogger.warn('session', 'session.disconnected', sessionId, 'Sessão desconectada (tentando reconectar)', { statusCode, reason });
                const retryCount = (retryCounters.get(sessionId) || 0) + 1;
                retryCounters.set(sessionId, retryCount);

                if (retryCount <= 5) {
                    console.log(`[${sessionId}] Reconnecting... (attempt ${retryCount})`);
                    engineLogger.info('session', 'session.reconnecting', sessionId, `Tentativa de reconexão (${retryCount}/5)`);
                    setTimeout(() => connect(sessionId, onUpdate, onMessage, onEvent), 5000);
                } else {
                    console.log(`[${sessionId}] Max retries reached`);
                    engineLogger.error('session', 'session.reconnect_failed', sessionId, 'Máximo de tentativas de reconexão atingido', { reason });
                    retryCounters.delete(sessionId);
                }
            } else {
                // Clear session data on logout
                engineLogger.error('session', 'session.logged_out', sessionId, 'Sessão desconectada (Logged Out/Inválida)', { statusCode, reason });
                if (statusCode === DisconnectReason.loggedOut || statusCode === 401) {
                    console.log(`[${sessionId}] Logged out, cleaning session data`);
                    if (fs.existsSync(sessionDir)) {
                        fs.rmSync(sessionDir, { recursive: true, force: true });
                    }
                }
            }

            activeSockets.delete(sessionId);
        }
    });

    // Handle incoming messages
    if (onMessage) {
        sock.ev.on('messages.upsert', async (m) => {
            for (const msg of m.messages || []) {
                if (!msg.message || isStatusBroadcastMessage(msg)) {
                    continue;
                }

                engineLogger.info('message', 'message.received', sessionId, 'Mensagem recebida', {
                    messageId: msg.key?.id,
                    remoteJid: msg.key?.remoteJid,
                    fromMe: msg.key?.fromMe
                });

                await attachMediaAsset(sock, msg);
                onMessage(sessionId, msg);
            }
        });
    }

    sock.ev.on('messages.update', (updates) => {
        for (const update of updates || []) {
            if (isStatusBroadcastMessage(update)) {
                continue;
            }

            emitEvent(messageUpdateEventType(update), update);
        }
    });

    sock.ev.on('messages.delete', (item) => {
        if (isStatusBroadcastMessage(item)) {
            return;
        }

        emitEvent('message.deleted', item);
    });

    sock.ev.on('message-receipt.update', (updates) => {
        for (const update of updates || []) {
            if (isStatusBroadcastMessage(update)) {
                continue;
            }

            emitEvent('message.status', update);
        }
    });

    sock.ev.on('contacts.update', (updates) => {
        for (const update of updates || []) {
            emitEvent('contact.update', update);
        }
    });

    sock.ev.on('groups.update', (updates) => {
        for (const update of updates || []) {
            emitEvent('group.update', update);
        }
    });

    sock.ev.on('group-participants.update', (update) => {
        emitEvent('group.participants.update', update);
    });

    return sock;
}

/**
 * Disconnect a session
 * @param {string} sessionId - Session ID
 */
function disconnect(sessionId) {
    const sock = activeSockets.get(sessionId);
    if (sock) {
        sock.end();
        activeSockets.delete(sessionId);
    }
    retryCounters.delete(sessionId);
}

/**
 * Get socket for a session
 * @param {string} sessionId - Session ID
 * @returns {object|null} Socket or null
 */
function getSocket(sessionId) {
    return activeSockets.get(sessionId) || null;
}

/**
 * Check if session is connected
 * @param {string} sessionId - Session ID
 * @returns {boolean} True if connected
 */
function isConnected(sessionId) {
    const sock = activeSockets.get(sessionId);
    return sock?.user != null;
}

/**
 * Delete session data
 * @param {string} sessionId - Session ID
 */
function deleteSessionData(sessionId) {
    if (!require('../utils/validation').isValidId(sessionId)) {
        return;
    }

    disconnect(sessionId);

    const sessionDir = path.join(AUTH_DIR, sessionId);
    if (fs.existsSync(sessionDir)) {
        fs.rmSync(sessionDir, { recursive: true, force: true });
    }

    Session.delete(sessionId);
}

/**
 * Get all active sessions
 * @returns {Map} Active sockets
 */
function getActiveSessions() {
    return activeSockets;
}

function messageUpdateEventType(update) {
    const protocolMessage = update?.update?.message?.protocolMessage || update?.message?.protocolMessage;
    const protocolType = String(protocolMessage?.type ?? '').toUpperCase();

    if (protocolMessage?.editedMessage) {
        return 'message.edited';
    }

    if (protocolMessage?.key && (protocolType === '0' || protocolType.includes('REVOKE') || protocolType.includes('DELETE'))) {
        return 'message.deleted';
    }

    return 'message.status';
}

function isStatusBroadcastMessage(payload) {
    const remoteJid = payload?.key?.remoteJid
        || payload?.message?.key?.remoteJid
        || payload?.update?.key?.remoteJid
        || payload?.remoteJid;

    return typeof remoteJid === 'string' && remoteJid.startsWith('status@broadcast');
}

function unwrapMessageContent(message) {
    let content = message;

    if (content?.ephemeralMessage?.message) {
        content = content.ephemeralMessage.message;
    }

    if (content?.viewOnceMessage?.message) {
        content = content.viewOnceMessage.message;
    }

    if (content?.viewOnceMessageV2?.message) {
        content = content.viewOnceMessageV2.message;
    }

    if (content?.viewOnceMessageV2Extension?.message) {
        content = content.viewOnceMessageV2Extension.message;
    }

    if (content?.documentWithCaptionMessage?.message) {
        content = content.documentWithCaptionMessage.message;
    }

    return content;
}

function inferDocumentExtension(content) {
    const fileName = content?.documentMessage?.fileName;

    if (fileName && path.extname(fileName)) {
        return path.extname(fileName).replace('.', '').toLowerCase();
    }

    const mimeType = content?.documentMessage?.mimetype;
    const mimeMap = {
        'application/pdf': 'pdf',
        'application/msword': 'doc',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
        'application/vnd.ms-excel': 'xls',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx'
    };

    return mimeMap[mimeType] || 'bin';
}

async function uploadMediaToApih(buffer, type, fileName) {
    const uploadUrl = process.env.APIH_MEDIA_UPLOAD_URL || 'https://apih.hartmidia.com/api/v1/media/upload';
    const form = new FormData();

    form.append('file', buffer, { filename: fileName });
    form.append('type', type);

    const response = await axios.post(uploadUrl, form, {
        headers: form.getHeaders(),
        timeout: parseInt(process.env.APIH_MEDIA_UPLOAD_TIMEOUT_MS || '15000', 10),
        maxBodyLength: Infinity,
        maxContentLength: Infinity
    });

    return response.data;
}

async function attachMediaAsset(sock, msg) {
    const content = unwrapMessageContent(msg.message);
    const messageType = content ? Object.keys(content)[0] : null;
    const mediaConfig = MEDIA_TYPE_MAP[messageType];

    if (!mediaConfig) {
        return;
    }

    try {
        const buffer = await downloadMediaMessage(msg, 'buffer', {}, { logger });
        const extension = messageType === 'documentMessage'
            ? inferDocumentExtension(content)
            : mediaConfig.extension;
        const asset = await uploadMediaToApih(buffer, mediaConfig.type, `whatsapp-${msg.key?.id || Date.now()}.${extension}`);

        if (asset?.id) {
            msg.mediaAssetId = asset.id;
        }
    } catch (error) {
        logger.error({
            messageId: msg.key?.id,
            mediaType: messageType,
            error: error.response?.data || error.message
        }, '[HAXIS] Media upload to ApiH failed');
    }
}

module.exports = {
    connect,
    disconnect,
    getSocket,
    isConnected,
    deleteSessionData,
    getActiveSessions,
    AUTH_DIR
};
