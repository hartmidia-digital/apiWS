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
const MediaHandoff = require('../models/MediaHandoff');
const haxisPaths = require('../config/paths');
const engineLogger = require('../utils/engineLogger');
const { db } = require('../config/database');
const { v4: uuidv4 } = require('uuid');

// Logger configuration
const defaultLogLevel = "info";
const logger = pino({ level: process.env.LOG_LEVEL || defaultLogLevel });

// Active socket connections (in-memory)
const activeSockets = new Map();
const retryCounters = new Map();
const reconnectTimers = new Map();
const stoppedSessions = new Set();

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
async function connect(sessionId, onUpdate, onMessage, onEvent, isCreation = false) {
    if (!require('../utils/validation').isValidId(sessionId)) {
        throw new Error('Invalid session ID');
    }

    if (stoppedSessions.has(sessionId)) {
        engineLogger.info('session', 'session.connect_aborted', sessionId, 'Tentativa de conexão abortada pois a sessão foi deletada ou parada');
        return null;
    }

    const sessionExists = Session.findById(sessionId);
    if (!sessionExists && !isCreation) {
        engineLogger.info('session', 'session.connect_aborted', sessionId, 'Tentativa de conexão abortada pois a sessão não existe no banco de dados');
        return null;
    }

    if (activeSockets.has(sessionId)) {
        engineLogger.warn('session', 'session.already_connecting', sessionId, 'Sessão já possui um socket ativo');
        return activeSockets.get(sessionId);
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
    let versionOrigin;
    try {
        const baileysVersion = await fetchLatestBaileysVersion();
        version = baileysVersion.version;
        versionOrigin = 'fetchLatestBaileysVersion';
        console.log(`[${sessionId}] Using Baileys version: ${version.join('.')} (primary)`);
    } catch (e) {
        versionOrigin = 'default_baileys';
        console.log(`[${sessionId}] Failed to fetch version, using Baileys default (fallback)`);
    }

    const sock = makeWASocket({
        version,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, logger),
        },
        printQRInTerminal: false,
        logger,
        browser: Browsers.macOS('Desktop'),
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

    engineLogger.info('session', 'session.socket_created', sessionId, 'Socket criado para a sessão', {
        waVersion: version ? version.join('.') : 'default',
        versionOrigin,
        browserIdentity: sock.authState?.creds?.browser || "Mac OS, Desktop",
        baileysVersion: require('../../package.json').dependencies['@whiskeysockets/baileys']
    });

    function isSessionOperable() {
        return !stoppedSessions.has(sessionId) && !!Session.findById(sessionId);
    }

    const emitEvent = (eventType, payload) => {
        if (!isSessionOperable()) return;
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
            if (!isSessionOperable()) return;
            Session.updateStatus(sessionId, 'GENERATING_QR', 'Scan QR code');
            engineLogger.info('session', 'session.qr_generated', sessionId, 'QR Code gerado (não persistido)');
            if (onUpdate) onUpdate(sessionId, 'GENERATING_QR', 'Scan QR code', qr);

            // Broadcast QR directly via WebSocket to bypass DB logging
            if (engineLogger.broadcastOpsEvent) {
                engineLogger.broadcastOpsEvent({
                    event: 'qr.generated',
                    sessionId: sessionId,
                    qr: qr
                });
            }
        }

        if (connection === 'connecting') {
            if (!isSessionOperable()) return;
            Session.updateStatus(sessionId, 'CONNECTING', 'Connecting...');
            engineLogger.info('session', 'session.connecting', sessionId, 'Tentando conectar...');
            if (onUpdate) onUpdate(sessionId, 'CONNECTING', 'Connecting...', null);
        }

        if (connection === 'open') {
            if (!isSessionOperable()) return;
            console.log(`[${sessionId}] Connected!`);
            retryCounters.delete(sessionId);

            const name = sock.user?.name || 'Unknown';
            Session.updateStatus(sessionId, 'CONNECTED', `Connected as ${name}`);
            engineLogger.info('session', 'session.connected', sessionId, 'Sessão conectada com sucesso', { deviceName: name });
            if (onUpdate) onUpdate(sessionId, 'CONNECTED', `Connected as ${name}`, null);

            // Broadcast connected event to clear QR modal in UI
            if (engineLogger.broadcastOpsEvent) {
                engineLogger.broadcastOpsEvent({
                    event: 'session.connected',
                    sessionId: sessionId
                });
            }
        }

        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const reason = lastDisconnect?.error?.output?.payload?.message || 'Connection closed';

            console.log(`[${sessionId}] Disconnected: ${statusCode} - ${reason}`);

            if (!isSessionOperable()) {
                activeSockets.delete(sessionId);
                return;
            }

            if (Session.findById(sessionId)) {
                Session.updateStatus(sessionId, 'DISCONNECTED', reason);
            }
            if (onUpdate) onUpdate(sessionId, 'DISCONNECTED', reason, null);

            // Handle reconnection logic
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut && statusCode !== 401 && statusCode !== 403;

            if (shouldReconnect && isSessionOperable()) {
                engineLogger.warn('session', 'session.disconnected', sessionId, 'Sessão desconectada (tentando reconectar)', { statusCode, reason });
                const retryCount = (retryCounters.get(sessionId) || 0) + 1;
                retryCounters.set(sessionId, retryCount);

                if (retryCount <= 5) {
                    console.log(`[${sessionId}] Reconnecting... (attempt ${retryCount})`);
                    engineLogger.info('session', 'session.reconnecting', sessionId, `Tentativa de reconexão (${retryCount}/5)`);

                    const timer = setTimeout(() => {
                        if (!isSessionOperable()) {
                             engineLogger.info('session', 'session.reconnect_aborted', sessionId, 'Reconexão abortada pois a sessão foi deletada ou parada');
                             return;
                        }
                        connect(sessionId, onUpdate, onMessage, onEvent);
                    }, 5000);
                    reconnectTimers.set(sessionId, timer);
                } else {
                    console.log(`[${sessionId}] Max retries reached`);
                    engineLogger.error('session', 'session.reconnect_failed', sessionId, 'Máximo de tentativas de reconexão atingido', { reason });
                    retryCounters.delete(sessionId);
                }
            } else {
                if (isSessionOperable() && statusCode !== undefined) {
                    // Clear session data on logout
                    engineLogger.error('session', 'session.logged_out', sessionId, 'Sessão desconectada (Logged Out/Inválida)', { statusCode, reason });
                    if (statusCode === DisconnectReason.loggedOut || statusCode === 401) {
                        console.log(`[${sessionId}] Logged out, cleaning session data`);
                        if (fs.existsSync(sessionDir)) {
                            fs.rmSync(sessionDir, { recursive: true, force: true });
                        }
                    }
                }
            }

            activeSockets.delete(sessionId);
        }
    });

    // Helpers for history sync
    const insertHistoryBatch = db.prepare(`
        INSERT INTO history_sync_batches (
            batch_id, engine_id, engine_session_id, source_event, total_items
        ) VALUES (?, ?, ?, ?, ?)
    `);

    const insertHistoryItem = db.prepare(`
        INSERT OR IGNORE INTO history_sync_items (
            batch_id, item_id, engine_id, engine_session_id, item_type,
            source_event_key, external_message_id, chat_id, payload_preview_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const processHistorySyncMessage = (msg, batchId) => {
        const engineId = process.env.APIWS_ENGINE_ID;
        const externalMessageId = msg.key?.id;
        const chatId = msg.key?.remoteJid;
        const sourceEventKey = `history_${engineId}_${sessionId}_${chatId}_${externalMessageId}`;

        let itemType = 'message';
        // Add minimal metadata for media without triggering attachMediaAsset
        if (msg.message?.imageMessage || msg.message?.videoMessage || msg.message?.documentMessage || msg.message?.audioMessage || msg.message?.stickerMessage) {
            itemType = 'media_metadata';
        }

        try {
            const previewPayload = JSON.stringify(msg);
            insertHistoryItem.run(
                batchId,
                uuidv4(),
                engineId,
                sessionId,
                itemType,
                sourceEventKey,
                externalMessageId,
                chatId,
                previewPayload
            );
        } catch (error) {
            engineLogger.error('whatsapp', 'history_sync.item_error', sessionId, 'Failed to insert history sync item', {
                error: error.message,
                messageId: externalMessageId
            });
        }
    };


    // Handle incoming messages
    if (onMessage) {
        sock.ev.on('messages.upsert', async (m) => {
            if (!isSessionOperable()) return;

            for (const msg of m.messages || []) {
                if (!msg.message || isStatusBroadcastMessage(msg)) {
                    continue;
                }

                if (m.type === 'notify') {
                    engineLogger.info('message', 'message.received', sessionId, 'Mensagem recebida', {
                        messageId: msg.key?.id,
                        remoteJid: msg.key?.remoteJid,
                        fromMe: msg.key?.fromMe
                    });

                    await attachMediaAsset(sock, msg, sessionId);
                    onMessage(sessionId, msg);
                } else if (m.type === 'append') {
                    if (process.env.HISTORY_SYNC_ENABLED !== 'true') {
                        engineLogger.info('whatsapp', 'history_sync.ignored', sessionId, 'history sync ignored by feature flag', {
                            messageId: msg.key?.id
                        });
                        continue;
                    }

                    const batchId = uuidv4();
                    try {
                        insertHistoryBatch.run(batchId, process.env.APIWS_ENGINE_ID, sessionId, 'messages.upsert.append', 1);
                        processHistorySyncMessage(msg, batchId);
                    } catch(error) {
                        engineLogger.error('whatsapp', 'history_sync.batch_error', sessionId, 'Failed to create history batch for append', {
                            error: error.message
                        });
                    }
                }
            }
        });
    }

    sock.ev.on('messaging-history.set', (item) => {
        if (!isSessionOperable()) return;

        if (process.env.HISTORY_SYNC_ENABLED !== 'true') {
            engineLogger.info('whatsapp', 'history_sync.ignored', sessionId, 'history sync ignored by feature flag');
            return;
        }

        const batchId = uuidv4();
        const totalItems = (item.messages?.length || 0) + (item.chats?.length || 0) + (item.contacts?.length || 0);

        try {
            insertHistoryBatch.run(batchId, process.env.APIWS_ENGINE_ID, sessionId, 'messaging-history.set', totalItems);

            if (process.env.HISTORY_SYNC_CAPTURE_MESSAGES === 'true' && item.messages) {
                for (const msg of item.messages) {
                    processHistorySyncMessage(msg, batchId);
                }
            }

            // Note: chat and contact capture could be implemented here as well in the future.

        } catch (error) {
            engineLogger.error('whatsapp', 'history_sync.batch_error', sessionId, 'Failed to create history batch for history set', {
                error: error.message
            });
        }
    });

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

        // Se veio de history sync (notado pelo item ser um batch de keys proveniente do messaging-history em algumas versões)
        // e NÃO de tempo real. Eventos em tempo real costumam disparar message.deleted diretamente.
        // A prop `isHistoric` ou checar se a deleção veio junto de um append/history.
        // Por ora, deletes interceptados aqui sem marca explícita de histórico em tempo real devem prosseguir.
        // O Prompt pediu "Deletes vindos de histórico devem usar preserve_history=true".
        // Vamos checar explicitamente a prop de flag 'history_sync' ou manter o fluxo normal.
        if (item.keys && process.env.HISTORY_SYNC_ENABLED === 'true' && item.source === 'history_sync') {
             const payload = {
                 ...item,
                 preserve_history: true
             };
             emitEvent('message.delete_detected', payload);
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

    sock.ev.on('contacts.upsert', (updates) => {
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
 * @param {boolean} isManual - Is manual disconnect?
 */
function disconnect(sessionId, isManual = false) {
    if (isManual) {
        stoppedSessions.add(sessionId);
    }

    const sock = activeSockets.get(sessionId);
    if (sock) {
        sock.end();
        activeSockets.delete(sessionId);
    }
    retryCounters.delete(sessionId);

    if (reconnectTimers.has(sessionId)) {
        clearTimeout(reconnectTimers.get(sessionId));
        reconnectTimers.delete(sessionId);
    }
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
function resetSessionAuth(sessionId) {
    if (!require('../utils/validation').isValidId(sessionId)) {
        return;
    }

    stoppedSessions.add(sessionId);
    disconnect(sessionId);

    const sessionDir = path.join(AUTH_DIR, sessionId);
    if (fs.existsSync(sessionDir)) {
        fs.rmSync(sessionDir, { recursive: true, force: true });
    }

    // We allow reconnection manually later, but we need to remove from stopped so that ops panel can connect
    // The manual removal of stoppedSessions is handled before the actual manual connect
}

/**
 * Delete session data completely from memory, disk and database
 * @param {string} sessionId - Session ID
 */
function deleteSessionData(sessionId) {
    stoppedSessions.add(sessionId);
    resetSessionAuth(sessionId);
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

async function attachMediaAsset(sock, msg, sessionId) {
    const isHandoffEnabled = process.env.MEDIA_HANDOFF_ENABLED === 'true';
    const hasSecret = !!process.env.MEDIA_HANDOFF_SECRET;

    const content = unwrapMessageContent(msg.message);
    const messageType = content ? Object.keys(content)[0] : null;
    const mediaConfig = MEDIA_TYPE_MAP[messageType];

    if (!mediaConfig) {
        return;
    }

    if (isHandoffEnabled && hasSecret) {
        try {
            const msgContent = content[messageType];

            let fileSizeBytes = msgContent?.fileLength || null;
            if (fileSizeBytes) {
                fileSizeBytes = Number(fileSizeBytes);
            }

            const originalFilename = messageType === 'documentMessage' ? msgContent?.fileName : null;

            let fileExtension = messageType === 'documentMessage' ? inferDocumentExtension(content) : mediaConfig.extension;
            let mimeType = msgContent?.mimetype || null;

            const engineId = process.env.APIWS_ENGINE_ID || null;

            MediaHandoff.create({
                handoff_id: `mh_${msg.key?.id || Date.now()}`,
                engine_id: engineId,
                engine_session_id: sessionId,
                source_event_id: null,
                source_event_key: `media_detected_${msg.key?.id}_${Date.now()}`,
                external_message_id: msg.key?.id,
                chat_id: msg.key?.remoteJid,
                message_key_json: msg.key,
                media_type: mediaConfig.type,
                mime_type: mimeType,
                original_filename: originalFilename,
                file_extension: fileExtension,
                file_size_bytes: fileSizeBytes,
                status: 'detected',
                metadata: {
                    message_type: messageType,
                    raw_message_json: msg
                }
            });

            engineLogger.info('media', 'media.detected', sessionId, 'Media detected and handoff created', {
                messageId: msg.key?.id,
                mediaType: mediaConfig.type
            });

        } catch (error) {
            logger.error({
                messageId: msg.key?.id,
                mediaType: messageType,
                error: error.message
            }, '[HAXIS] Media handoff creation failed');
        }
    } else {
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
}

function clearStoppedSession(sessionId) {
    stoppedSessions.delete(sessionId);
}

function isSessionStopped(sessionId) {
    return stoppedSessions.has(sessionId);
}

module.exports = {
    connect,
    disconnect,
    getSocket,
    isConnected,
    resetSessionAuth,
    deleteSessionData,
    getActiveSessions,
    AUTH_DIR,
    clearStoppedSession,
    isSessionStopped
};
