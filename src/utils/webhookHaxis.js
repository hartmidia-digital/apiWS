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

    if (['message.sent', 'message.status', 'message.error', 'message.edited'].includes(eventType)) {
        return statusPreview(eventType, rawPayload);
    }

    if (eventType === 'message.delete_detected') {
        const key = rawPayload.keys?.[0] || rawPayload.key || {};
        return {
            message_id: key.id || rawPayload.id || '',
            chat_id: key.remoteJid || rawPayload.remoteJid || '',
            action: 'delete_detected',
            preserve_history: true,
            source_event_key: `message_delete_${key.id || rawPayload.id}_${Date.now()}`
        };
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

    if (eventType === 'message.reaction') {
        const key = rawPayload.key || {};
        return {
            message_id: key.id || '',
            remote_jid: key.remoteJid || '',
            participant_jid: key.participant || rawPayload.sender || '',
            reaction: rawPayload.reaction || rawPayload.text || '',
            action: (rawPayload.reaction || rawPayload.text) ? 'added' : 'removed',
            source_event_key: `reaction_${key.id}_${key.participant || rawPayload.sender}_${rawPayload.reaction || rawPayload.text || 'removed'}`
        };
    }

    if (eventType === 'call.received' || eventType === 'call.update') {
        return {
            call_id: rawPayload.id || '',
            from: rawPayload.from || rawPayload.chatId || '',
            call_type: rawPayload.isVideo ? 'video' : (rawPayload.isGroup ? 'group' : 'audio'),
            status: rawPayload.status || 'unknown',
            source_event_key: `call_${rawPayload.id}_${rawPayload.status}`
        };
    }

    if (eventType === 'blocklist.update') {
        const action = rawPayload.action || 'unknown';
        const jids = rawPayload.blocklist || [];
        const maskedJids = jids.map(j => {
            const phone = j.split('@')[0];
            return phone.length > 4 ? phone.substring(0, 4) + '****' + phone.substring(phone.length - 4) : phone;
        });

        return {
            jid_masked: maskedJids[0] || '',
            action: action,
            source_event_key: `blocklist_${action}_${Date.now()}`
        };
    }

    if (eventType === 'blocklist.set') {
        const jids = rawPayload.blocklist || [];
        const maskedJids = jids.map(j => {
            const phone = j.split('@')[0];
            return phone.length > 4 ? phone.substring(0, 4) + '****' + phone.substring(phone.length - 4) : phone;
        });

        return {
            total_items: jids.length,
            items_masked: maskedJids
        };
    }

    if (eventType === 'newsletter.event') {
        return {
            newsletter_id: rawPayload.id || rawPayload.jid || '',
            event_subtype: rawPayload.type || rawPayload.subtype || 'unknown',
            source_event_key: `newsletter_${rawPayload.id || rawPayload.jid}_${rawPayload.type || rawPayload.subtype}_${Date.now()}`
        };
    }

    if (eventType === 'label.update') {
        return {
            label_id: rawPayload.id || '',
            label_name: rawPayload.name || '',
            target_id: rawPayload.targetId || rawPayload.jid || '',
            action: rawPayload.action || rawPayload.type || 'unknown',
            source_event_key: `label_${rawPayload.id}_${rawPayload.targetId || rawPayload.jid}_${rawPayload.action || rawPayload.type}`
        };
    }

    if (eventType === 'chat.upsert') {
        return {
            chat_id: rawPayload.id || rawPayload.jid || '',
            chat_type: rawPayload.id?.endsWith('@g.us') ? 'group' : (rawPayload.id?.endsWith('@newsletter') ? 'newsletter' : 'individual'),
            unread_count: rawPayload.unreadCount || 0,
            archived: rawPayload.archived || false,
            pinned: rawPayload.pinned || false,
            muted: rawPayload.muteEndTime ? true : false,
            source: rawPayload.source || 'unknown',
            source_event_key: `chat_upsert_${rawPayload.id || rawPayload.jid}_${Date.now()}`
        };
    }

    if (eventType === 'chat.update') {
        const changedFields = Object.keys(rawPayload).filter(k => k !== 'id' && k !== 'jid');
        return {
            chat_id: rawPayload.id || rawPayload.jid || '',
            changed_fields: changedFields,
            unread_count: rawPayload.unreadCount !== undefined ? rawPayload.unreadCount : null,
            archived: rawPayload.archived !== undefined ? rawPayload.archived : null,
            pinned: rawPayload.pinned !== undefined ? rawPayload.pinned : null,
            muted: rawPayload.muteEndTime !== undefined ? (rawPayload.muteEndTime ? true : false) : null,
            source: rawPayload.source || 'unknown',
            source_event_key: `chat_update_${rawPayload.id || rawPayload.jid}_${Date.now()}`
        };
    }

    if (eventType === 'chat.delete_detected') {
        return {
            chat_id: rawPayload.id || rawPayload.jid || rawPayload.chatId || '',
            action: 'delete_detected',
            preserve_history: true,
            source_event_key: `chat_delete_${rawPayload.id || rawPayload.jid || rawPayload.chatId}_${Date.now()}`
        };
    }

    if (eventType === 'message.media_update') {
        return {
            message_id: rawPayload.key?.id || rawPayload.id || '',
            media_type: rawPayload.media?.mediaType || rawPayload.mediaType || 'unknown',
            mime_type: rawPayload.media?.mimetype || rawPayload.mimetype || '',
            file_size: rawPayload.media?.fileLength || rawPayload.fileLength || 0,
            status: rawPayload.error ? 'failed' : 'updated',
            source_event_key: `media_update_${rawPayload.key?.id || rawPayload.id}_${Date.now()}`
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

    // Registra log seguro e local sem payload cru
    engineLogger.info('webhook', `event.${eventType}`, engineSessionId, `Preparando webhook (${eventType})`, {
        eventId: payload.event_id,
        eventType: payload.event_type,
        normalized_preview: payload.normalized_preview
    });

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
