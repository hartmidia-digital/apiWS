const axios = require('axios');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const pino = require('pino');
const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

const WEBHOOK_URL = process.env.WEBHOOK_URL;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

/**
 * Normaliza o preview do evento
 * @param {string} eventType
 * @param {any} rawPayload
 * @returns {object}
 */
function normalizePreview(eventType, rawPayload) {
    // Implementar a normalização básica
    let preview = {};

    if (eventType === 'session.status' || eventType.startsWith('session.')) {
        preview = {
            status: rawPayload.status || rawPayload.state || 'unknown',
            reason: rawPayload.reason || ''
        };
    } else if (eventType === 'message.received') {
        const msg = rawPayload.message;
        preview = {
            from: rawPayload.key?.remoteJid || '',
            pushName: rawPayload.pushName || '',
            text: msg?.conversation || msg?.extendedTextMessage?.text || '[media/other]',
            hasMedia: !!(msg?.imageMessage || msg?.videoMessage || msg?.documentMessage || msg?.audioMessage)
        };
    } else if (eventType === 'message.sent' || eventType === 'message.status') {
         preview = {
            to: rawPayload.key?.remoteJid || '',
            status: rawPayload.status || ''
        };
    }

    return preview;
}

/**
 * Envia o webhook para a API limpa do HAXIS
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
        engine_session_id: engineSessionId,
        timestamp: new Date().toISOString(),
        raw_payload: rawPayload,
        normalized_preview: normalizePreview(eventType, rawPayload)
    };

    const payloadString = JSON.stringify(payload);
    let headers = {
        'Content-Type': 'application/json',
        'X-Haxis-Event-Id': payload.event_id,
        'X-Haxis-Event-Type': payload.event_type,
        'X-Haxis-Timestamp': payload.timestamp
    };

    if (WEBHOOK_SECRET) {
        const signature = crypto.createHmac('sha256', WEBHOOK_SECRET)
            .update(payloadString)
            .digest('hex');
        headers['X-Haxis-Signature'] = signature;
    }

    const timeoutMs = parseInt(process.env.WEBHOOK_TIMEOUT_MS) || 5000;

    try {
        // Fire-and-forget: não bloquear execução aguardando retorno
        axios.post(WEBHOOK_URL, payloadString, {
            headers,
            timeout: timeoutMs
        }).then(() => {
            logger.debug(`Webhook enviado: ${eventType} para sessão ${engineSessionId}`);
        }).catch(error => {
            logger.error(`Falha ao enviar webhook ${eventType}: ${error.message}`);
        });
    } catch (error) {
        logger.error(`Falha ao processar webhook ${eventType}: ${error.message}`);
    }
}

module.exports = {
    sendWebhook
};
