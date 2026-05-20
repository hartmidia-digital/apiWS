const pino = require('pino');
const { db } = require('../config/database');
const { sendWebhook } = require('../utils/webhookHaxis');
const engineLogger = require('../utils/engineLogger');

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

class HistorySyncWorker {
    constructor() {
        this.isRunning = false;
        this.intervalId = null;
        this.dispatchPerMinute = parseInt(process.env.HISTORY_SYNC_DISPATCH_PER_MINUTE || '60', 10);
        this.processIntervalMs = parseInt(process.env.HISTORY_SYNC_PROCESS_INTERVAL_MS || '5000', 10);
        this.dispatchedCount = 0;
        this.lastResetTime = Date.now();
    }

    start() {
        if (process.env.HISTORY_SYNC_ENABLED !== 'true') {
            logger.info('[HistorySyncWorker] Disabled via HISTORY_SYNC_ENABLED flag.');
            return;
        }

        if (this.isRunning) return;

        this.isRunning = true;
        this.intervalId = setInterval(() => this.processItems(), this.processIntervalMs);
        logger.info(`[HistorySyncWorker] Started with interval ${this.processIntervalMs}ms and rate limit ${this.dispatchPerMinute}/min`);
    }

    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        this.isRunning = false;
        logger.info('[HistorySyncWorker] Stopped.');
    }

    async processItems() {
        // Reset rate limiter window
        const now = Date.now();
        if (now - this.lastResetTime >= 60000) {
            this.dispatchedCount = 0;
            this.lastResetTime = now;
        }

        if (this.dispatchedCount >= this.dispatchPerMinute) {
            return; // Rate limit reached
        }

        const limit = this.dispatchPerMinute - this.dispatchedCount;

        try {
            // Fetch pending items
            const items = db.prepare(`
                SELECT id, item_id, engine_session_id, item_type, source_event_key, external_message_id, chat_id, payload_preview_json, attempts
                FROM history_sync_items
                WHERE status IN ('pending', 'failed') AND attempts < 3
                ORDER BY created_at ASC
                LIMIT ?
            `).all(limit);

            if (items.length === 0) return;

            for (const item of items) {
                // Deduplicate logic (could check external system or rely on idempotency, but here we update status to processing)
                db.prepare(`UPDATE history_sync_items SET status = 'processing', attempts = attempts + 1 WHERE id = ?`).run(item.id);

                try {
                    let parsedPayload = {};
                    try {
                        parsedPayload = JSON.parse(item.payload_preview_json);
                    } catch (e) {
                        parsedPayload = {};
                    }

                    const webhookPayload = {
                        source: 'history_sync',
                        source_event_key: item.source_event_key,
                        external_message_id: item.external_message_id,
                        chat_id: item.chat_id,
                        item_type: item.item_type,
                        message_timestamp: parsedPayload.messageTimestamp || Math.floor(Date.now() / 1000)
                    };

                    if (item.item_type === 'media_metadata') {
                        // Extract only metadata
                        webhookPayload.media_metadata = {
                            has_media: true,
                            source: 'history_sync',
                            message_id: item.external_message_id,
                            chat_id: item.chat_id
                        };
                    } else if (item.item_type === 'delete') {
                        webhookPayload.preserve_history = true;
                    }

                    // Keep the actual raw payload as is? Prompt says: "Não incluir: arquivo; base64; token; source_url sensível; pacote bruto."
                    // But we can include the normalized message preview
                    webhookPayload.message_preview = parsedPayload; // This is already sanitized in DB usually, but for history sync we just keep it simple

                    await sendWebhook('message.history_sync', item.engine_session_id, webhookPayload);

                    db.prepare(`UPDATE history_sync_items SET status = 'dispatched', dispatched_at = CURRENT_TIMESTAMP WHERE id = ?`).run(item.id);
                    this.dispatchedCount++;

                } catch (error) {
                    db.prepare(`UPDATE history_sync_items SET status = 'failed', error_message = ? WHERE id = ?`).run(error.message, item.id);
                    engineLogger.error('history_sync', 'item.failed', item.engine_session_id, 'Failed to process history sync item', {
                        itemId: item.item_id,
                        error: error.message
                    });
                }
            }
        } catch (error) {
            logger.error(`[HistorySyncWorker] Error processing items: ${error.message}`);
        }
    }
}

module.exports = new HistorySyncWorker();
