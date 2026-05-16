const axios = require('axios');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const pino = require('pino');
const engineLogger = require('./engineLogger');

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

const WEBHOOK_URL = process.env.WEBHOOK_URL;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;
const ENGINE_ID = process.env.APIWS_ENGINE_ID;
const ENGINE_BASE_URL = process.env.APIWS_PUBLIC_URL || null;

function unwrapMessageContent(message) {
    let content = message || {};

    for (let i = 0; i < 6; i += 1) {
        const next = content.ephemeralMessage?.message
            || content.viewOnceMessage?.message
            || content.viewOnceMessageV2?.message
            || content.viewOnceMessageV2Extension?.message
            || content.documentWithCaptionMessage?.message;

        if (!next) {
            break;
        }

        content = next;
    }

    return content;
}

function messagePreview(rawPayload) {
    const content = unwrapMessageContent(rawPayload.message || rawPayload.content || {});
    const type = Object.keys(content)[0] || 'unknown';
    const mediaTypes = ['imageMessage', 'videoMessage', 'documentMessage', 'audioMessage', 'stickerMessage'];

    return {
        from: rawPayload.key?.remoteJid || rawPayload.remoteJid || '',
        participant: rawPayload.key?.participant || rawPayload.participant || '',
        pushName: rawPayload.pushName || '',
        messageId: rawPayload.key?.id || rawPayload.id || '',
        type,
        text: content.conversation
            || content.extendedTextMessage?.text
            || content.imageMessage?.caption
            || content.videoMessage?.caption
            || content.documentMessage?.caption
            || content.documentMessage?.fileName
            || content.eventMessage?.name
            || content.locationMessage?.name
            || content.locationMessage?.address
            || null,
        hasMedia: mediaTypes.includes(type),
        hasLocation: type === 'locationMessage' || type === 'liveLocationMessage'
    };
}

function statusPreview(eventType, rawPayload) {
    return {
        to: rawPayload.key?.remoteJid || rawPayload.remoteJid || '',
        participant: rawPayload.key?.participant || rawPayload.participant || '',
        messageId: rawPayload.key?.id || rawPayload.messageId || rawPayload.id || '',
        status: rawPayload.update?.status || rawPayload.status || eventType
    };
}

/**
 * Normaliza um resumo pequeno para consulta e auditoria na ApiH.
 * @param {string} eventType
 * @param {any} rawPayload
 * @returns {object}
 */
function normalizePreview(eventType, rawPayload = {}) {
    if (eventType === 'session.status' || eventType.startsWith('session.')) {
        return {
            status: rawPayload.status || rawPayload.state || 'unknown',
            reason: rawPayload.reason || rawPayload.detail || ''
        };
    }

    if (eventType === 'message.received') {
        return messagePreview(rawPayload);
    }

    if (['message.sent', 'message.status', 'message.error', 'message.deleted', 'message.edited'].includes(eventType)) {
        return statusPreview(eventType, rawPayload);
    }

    if (eventType === 'group.update' || eventType === 'group.participants.update') {
        return {
            groupId: rawPayload.id || rawPayload.jid || rawPayload.groupId || '',
            subject: rawPayload.subject || rawPayload.name || '',
            action: rawPayload.action || rawPayload.event || eventType,
            participants: rawPayload.participants || []
        };
    }

    if (eventType === 'contact.update') {
        return {
            jid: rawPayload.id || rawPayload.jid || '',
            name: rawPayload.name || rawPayload.notify || rawPayload.verifiedName || '',
            hasAvatar: Boolean(rawPayload.avatarUrl || rawPayload.imgUrl || rawPayload.profilePictureUrl)
        };
    }

    return {};
}

/**
 * Envia o webhook para a API limpa do HAXIS (agora usando a fila de entregas).
 * @param {string} eventType
 * @param {string} engineSessionId
 * @param {any} rawPayload
 */
async function sendWebhook(eventType, engineSessionId, rawPayload) {
    if (!WEBHOOK_URL) {
        return;
    }

    const payload = {
        event_id: uuidv4(),
        event_type: eventType,
        engine_id: ENGINE_ID,
        engine_base_url: ENGINE_BASE_URL,
        engine_session_id: engineSessionId,
        timestamp: new Date().toISOString(),
        raw_payload: rawPayload,
        normalized_preview: normalizePreview(eventType, rawPayload)
    };

    const headers = {
        'Content-Type': 'application/json',
        'X-Haxis-Event-Id': payload.event_id,
        'X-Haxis-Event-Type': payload.event_type,
        'X-Haxis-Timestamp': payload.timestamp
    };

    // Note: Signature is calculated later in WebhookDeliveryService to ensure it matches the actual sent string exactly

    // Lazy require to avoid circular dependencies
    const WebhookDeliveryService = require('../services/webhookDeliveryService');

    try {
        await WebhookDeliveryService.enqueueDelivery({
            event_id: payload.event_id,
            event_type: payload.event_type,
            engine_id: payload.engine_id,
            engine_base_url: payload.engine_base_url,
            engine_session_id: payload.engine_session_id,
            webhook_url: WEBHOOK_URL,
            payload_json: payload,
            headers_json: headers
        });
    } catch (error) {
        logger.error(`Falha ao enfileirar webhook ${eventType}: ${error.message}`);
        engineLogger.error('webhook', 'webhook.dispatch_failed', engineSessionId, `Erro interno ao enfileirar webhook (${eventType})`, { eventId: payload.event_id, eventType, error: error.message });
    }
}

module.exports = {
    sendWebhook,
    normalizePreview
};
