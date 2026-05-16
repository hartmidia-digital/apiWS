const axios = require('axios');
const crypto = require('crypto');
const pino = require('pino');
const WebhookDelivery = require('../models/WebhookDelivery');
const engineLogger = require('../utils/engineLogger');

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

class WebhookDeliveryService {
    constructor() {
        this.isRunning = false;
        this.workerInterval = null;
        this.processingIds = new Set();
        this.baseDelay = parseInt(process.env.WEBHOOK_RETRY_BASE_DELAY_SECONDS || '30', 10);
        this.maxDelay = parseInt(process.env.WEBHOOK_RETRY_MAX_DELAY_SECONDS || '900', 10);
        this.maxAttemptsDefault = parseInt(process.env.WEBHOOK_MAX_ATTEMPTS || '5', 10);
        this.isRetryEnabled = process.env.WEBHOOK_RETRY_ENABLED !== 'false';
        this.webhookSecret = process.env.WEBHOOK_SECRET;
    }

    startWorker() {
        if (this.isRunning) return;
        this.isRunning = true;
        // Run every 10 seconds
        this.workerInterval = setInterval(() => this.processDueDeliveries(), 10000);
        logger.info('Webhook Delivery Service worker started.');
    }

    stopWorker() {
        this.isRunning = false;
        if (this.workerInterval) {
            clearInterval(this.workerInterval);
            this.workerInterval = null;
        }
    }

    isRetryableError(error, httpStatus) {
        if (error.code && ['ECONNRESET', 'ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT'].includes(error.code)) {
            return true;
        }
        if (error.message && error.message.toLowerCase().includes('timeout')) {
            return true;
        }
        if (httpStatus) {
            const retryableStatuses = [408, 425, 429, 500, 502, 503, 504];
            if (retryableStatuses.includes(httpStatus)) return true;
        }
        return false;
    }

    calculateNextRetryAt(attempts) {
        // Simple progressive backoff
        // attempts 1 -> baseDelay * 1
        // attempts 2 -> baseDelay * 2
        // attempts 3 -> baseDelay * 4
        // ...
        const multiplier = Math.pow(2, attempts - 1);
        let delaySeconds = this.baseDelay * multiplier;
        if (delaySeconds > this.maxDelay) delaySeconds = this.maxDelay;

        const nextTime = new Date();
        nextTime.setSeconds(nextTime.getSeconds() + delaySeconds);
        return nextTime.toISOString();
    }

    async enqueueDelivery(data) {
        data.max_attempts = this.maxAttemptsDefault;
        const delivery = WebhookDelivery.create(data);

        engineLogger.info('webhook', 'webhook.delivery_created', data.engine_session_id, `Webhook adicionado na fila de entrega (${data.event_type})`, {
            eventId: data.event_id,
            eventType: data.event_type,
            deliveryId: delivery.id
        });

        // Try immediate delivery synchronously if not busy
        if (this.isRetryEnabled) {
             setImmediate(() => this.attemptDelivery(delivery.id));
        } else {
             // If retry is disabled, just attempt once synchronously.
             setImmediate(() => this.attemptDelivery(delivery.id));
        }

        return delivery;
    }

    async processDueDeliveries() {
        if (!this.isRetryEnabled) return;

        try {
            // 1. Recover any stale deliveries stuck in 'delivering' due to crashes
            const staleSeconds = parseInt(process.env.WEBHOOK_DELIVERY_STALE_AFTER_SECONDS || '300', 10);
            const staleDeliveries = WebhookDelivery.getStaleDeliveries(staleSeconds);
            for (const stale of staleDeliveries) {
                if (this.processingIds.has(stale.id)) continue; // Double check it's not actually running here

                // Return to pending/retrying
                WebhookDelivery.update(stale.id, {
                    status: stale.attempts > 0 ? 'retrying' : 'pending'
                });

                engineLogger.info('webhook', 'webhook.delivery_stale_recovered', stale.engine_session_id, `Entrega travada foi recuperada para a fila`, {
                    eventId: stale.event_id,
                    deliveryId: stale.id
                });
            }

            // 2. Process normally due deliveries
            const dueDeliveries = WebhookDelivery.getDueDeliveries();
            for (const delivery of dueDeliveries) {
                if (this.processingIds.has(delivery.id)) continue;
                await this.attemptDelivery(delivery.id);
            }
        } catch (error) {
            logger.error(`Error processing due deliveries: ${error.message}`);
        }
    }

    async attemptDelivery(deliveryId) {
        if (this.processingIds.has(deliveryId)) return;
        this.processingIds.add(deliveryId);

        let delivery = null;
        try {
            delivery = WebhookDelivery.findById(deliveryId);
            if (!delivery || !['pending', 'retrying'].includes(delivery.status)) {
                this.processingIds.delete(deliveryId);
                return;
            }

            // Lock it
            WebhookDelivery.update(deliveryId, { status: 'delivering' });

            const payloadString = typeof delivery.payload_json === 'string' ? delivery.payload_json : JSON.stringify(delivery.payload_json);

            let headers = {};
            if (delivery.headers_json) {
                headers = typeof delivery.headers_json === 'string' ? JSON.parse(delivery.headers_json) : delivery.headers_json;
            }

            // Always recalculate signature if secret exists
            if (this.webhookSecret) {
                headers['X-Haxis-Signature'] = crypto.createHmac('sha256', this.webhookSecret)
                    .update(payloadString)
                    .digest('hex');
            }

            const timeoutMs = parseInt(process.env.WEBHOOK_TIMEOUT_MS || '5000', 10);

            engineLogger.info('webhook', 'webhook.delivery_attempt', delivery.engine_session_id, `Tentativa de envio de webhook (${delivery.event_type})`, {
                eventId: delivery.event_id,
                deliveryId: delivery.id,
                attempt: delivery.attempts + 1,
                maxAttempts: delivery.max_attempts
            });

            try {
                const response = await axios.post(delivery.webhook_url, payloadString, {
                    headers,
                    timeout: timeoutMs
                });

                // Success
                WebhookDelivery.update(deliveryId, {
                    status: 'delivered',
                    delivered_at: new Date().toISOString(),
                    last_http_status: response.status,
                    attempts: delivery.attempts + 1,
                    // Optionally clear payload to save space/privacy
                    payload_json: '{}'
                });

                engineLogger.info('webhook', 'webhook.dispatch_success', delivery.engine_session_id, `Webhook entregue com sucesso (${delivery.event_type})`, {
                    eventId: delivery.event_id,
                    eventType: delivery.event_type,
                    deliveryId: delivery.id,
                    httpStatus: response.status
                });

            } catch (error) {
                this.handleDeliveryError(delivery, error);
            }

        } catch (error) {
            logger.error(`Critical error attempting delivery ${deliveryId}: ${error.message}`);
            // Fallback status reset
            if (delivery) {
                WebhookDelivery.update(deliveryId, { status: 'pending' });
            }
        } finally {
            this.processingIds.delete(deliveryId);
        }
    }

    handleDeliveryError(delivery, error) {
        const httpStatus = error.response ? error.response.status : null;
        const errorMessage = error.message;
        const currentAttempt = delivery.attempts + 1;

        const isRetryable = this.isRetryableError(error, httpStatus);

        engineLogger.error('webhook', 'webhook.dispatch_failed', delivery.engine_session_id, `Falha ao enviar webhook (${delivery.event_type})`, {
            eventId: delivery.event_id,
            eventType: delivery.event_type,
            deliveryId: delivery.id,
            error: errorMessage,
            httpStatus
        });

        if (!this.isRetryEnabled) {
            WebhookDelivery.update(delivery.id, {
                status: 'failed',
                last_error: errorMessage,
                last_http_status: httpStatus,
                attempts: currentAttempt,
                failed_at: new Date().toISOString()
            });
            engineLogger.info('webhook', 'webhook.delivery_failed_final', delivery.engine_session_id, `Falha definitiva (Retry desabilitado)`, { eventId: delivery.event_id });
            return;
        }

        if (isRetryable) {
            if (currentAttempt < delivery.max_attempts) {
                const nextRetry = this.calculateNextRetryAt(currentAttempt);
                WebhookDelivery.update(delivery.id, {
                    status: 'retrying',
                    last_error: errorMessage,
                    last_http_status: httpStatus,
                    attempts: currentAttempt,
                    next_retry_at: nextRetry
                });
                engineLogger.info('webhook', 'webhook.delivery_retry_scheduled', delivery.engine_session_id, `Retry agendado para ${nextRetry}`, { eventId: delivery.event_id });
            } else {
                WebhookDelivery.update(delivery.id, {
                    status: 'failed',
                    last_error: errorMessage,
                    last_http_status: httpStatus,
                    attempts: currentAttempt,
                    failed_at: new Date().toISOString()
                });
                engineLogger.info('webhook', 'webhook.delivery_failed_final', delivery.engine_session_id, `Falha definitiva (Max attempts atingido)`, { eventId: delivery.event_id });
            }
        } else {
            WebhookDelivery.update(delivery.id, {
                status: 'blocked',
                last_error: errorMessage,
                last_http_status: httpStatus,
                attempts: currentAttempt,
                failed_at: new Date().toISOString()
            });
            engineLogger.info('webhook', 'webhook.delivery_blocked', delivery.engine_session_id, `Webhook bloqueado (Erro permanente)`, { eventId: delivery.event_id });
        }
    }

    async forceRetry(deliveryId) {
        const delivery = WebhookDelivery.findById(deliveryId);
        if (!delivery) throw new Error("Delivery not found");

        if (['failed', 'retrying', 'blocked', 'delivering'].includes(delivery.status)) {
            engineLogger.info('webhook', 'webhook.manual_retry', delivery.engine_session_id, `Reprocessamento manual solicitado`, { eventId: delivery.event_id });

            const updates = {
                status: 'pending',
                next_retry_at: new Date().toISOString() // immediate
            };

            // Check if env webhook URL is different from the saved one to allow recovery from misconfigured URLs
            const currentEnvWebhookUrl = process.env.WEBHOOK_URL;
            if (currentEnvWebhookUrl && delivery.webhook_url !== currentEnvWebhookUrl) {
                updates.webhook_url = currentEnvWebhookUrl;
                engineLogger.info('webhook', 'webhook.delivery_url_refreshed_for_retry', delivery.engine_session_id, `URL do webhook atualizada para a do .env atual durante o reprocessamento manual`, {
                    eventId: delivery.event_id,
                    oldUrl: delivery.webhook_url,
                    newUrl: currentEnvWebhookUrl
                });
            }

            WebhookDelivery.update(deliveryId, updates);

            setImmediate(() => this.attemptDelivery(deliveryId));
            return true;
        }
        return false;
    }

    ignoreDelivery(deliveryId) {
        const delivery = WebhookDelivery.findById(deliveryId);
        if (!delivery) throw new Error("Delivery not found");

        WebhookDelivery.update(deliveryId, {
            status: 'ignored',
            ignored_at: new Date().toISOString()
        });

        engineLogger.info('webhook', 'webhook.delivery_ignored', delivery.engine_session_id, `Webhook ignorado manualmente`, { eventId: delivery.event_id });
        return true;
    }
}

module.exports = new WebhookDeliveryService();
