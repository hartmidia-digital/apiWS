const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const pino = require('pino');

const MediaHandoff = require('../models/MediaHandoff');
const { getSocket } = require('./whatsapp');
const WebhookDeliveryService = require('./webhookDeliveryService');
const engineLogger = require('../utils/engineLogger');
const { normalizePreview } = require('../utils/webhookHaxis');

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

class MediaHandoffWorker {
    constructor() {
        this.isRunning = false;
        this.intervalId = null;
        this.concurrency = parseInt(process.env.MEDIA_HANDOFF_DOWNLOAD_CONCURRENCY || '1', 10);
        this.maxSizeMB = parseInt(process.env.MEDIA_HANDOFF_MAX_FILE_SIZE_MB || '2048', 10);
        this.urlTtlMinutes = parseInt(process.env.MEDIA_HANDOFF_URL_TTL_MINUTES || '120', 10);
        this.activeDownloads = 0;
        this.tempRoot = process.env.MEDIA_HANDOFF_TEMP_ROOT || path.join(__dirname, '../../../apiws-data/media-handoff');

        if (!fs.existsSync(this.tempRoot)) {
            fs.mkdirSync(this.tempRoot, { recursive: true });
        }
    }

    start() {
        if (process.env.MEDIA_HANDOFF_ENABLED !== 'true') return;
        if (!process.env.MEDIA_HANDOFF_SECRET) {
            logger.error('[MediaHandoffWorker] FAILED TO START: MEDIA_HANDOFF_SECRET is required when feature is enabled.');
            engineLogger.error('system', 'media_handoff.startup_failed', null, 'Failed to start Media Handoff Worker: Missing MEDIA_HANDOFF_SECRET');
            return;
        }
        if (this.isRunning) return;

        this.isRunning = true;
        this.intervalId = setInterval(() => this.processQueue(), 5000);
        logger.info('[MediaHandoffWorker] Started');
    }

    stop() {
        if (!this.isRunning) return;
        this.isRunning = false;
        clearInterval(this.intervalId);
        logger.info('[MediaHandoffWorker] Stopped');
    }

    async processQueue() {
        if (!this.isRunning) return;
        if (this.activeDownloads >= this.concurrency) return;

        try {
            // Check for detected handoffs and queue them
            const detectedStmts = require('../config/database').db.prepare(`
                UPDATE media_handoffs
                SET status = 'queued'
                WHERE status = 'detected'
            `);
            detectedStmts.run();

            const availableSlots = this.concurrency - this.activeDownloads;
            if (availableSlots <= 0) return;

            const queued = MediaHandoff.findQueued(availableSlots);

            for (const item of queued) {
                this.activeDownloads++;
                this.processItem(item).finally(() => {
                    this.activeDownloads--;
                });
            }
        } catch (error) {
            logger.error(`[MediaHandoffWorker] Error processing queue: ${error.message}`);
        }
    }

    async processItem(item) {
        let tempFilePath = null;
        try {
            MediaHandoff.update(item.handoff_id, { status: 'downloading' });

            const sock = getSocket(item.engine_session_id);
            if (!sock) {
                throw new Error('WhatsApp socket not found for session');
            }

            if (!item.metadata || !item.metadata.raw_message_json) {
                throw new Error('Missing raw message payload in metadata');
            }

            if (item.file_size_bytes && (item.file_size_bytes / (1024 * 1024)) > this.maxSizeMB) {
                throw new Error(`File size exceeds maximum allowed (${this.maxSizeMB}MB)`);
            }

            const msg = item.metadata.raw_message_json;

            // Prepare directory structure: tempRoot/sessionId/YYYY/MM/
            const now = new Date();
            const year = now.getFullYear().toString();
            const month = (now.getMonth() + 1).toString().padStart(2, '0');
            const dirPath = path.join(this.tempRoot, item.engine_session_id, year, month);

            if (!fs.existsSync(dirPath)) {
                fs.mkdirSync(dirPath, { recursive: true });
            }

            const safeExt = item.file_extension ? `.${item.file_extension.replace(/[^a-zA-Z0-9]/g, '')}` : '.bin';
            tempFilePath = path.join(dirPath, `${item.handoff_id}${safeExt}`);

            // Download as stream to avoid loading large files into memory
            const stream = await downloadMediaMessage(msg, 'stream', {}, { logger });

            await new Promise((resolve, reject) => {
                const writeStream = fs.createWriteStream(tempFilePath);
                let currentSize = 0;

                stream.on('data', (chunk) => {
                    currentSize += chunk.length;
                    if ((currentSize / (1024 * 1024)) > this.maxSizeMB) {
                        writeStream.destroy();
                        reject(new Error(`File size exceeded maximum allowed limit during download`));
                    }
                });

                stream.pipe(writeStream);
                stream.on('error', reject);
                writeStream.on('finish', resolve);
                writeStream.on('error', reject);
            });

            // Calculate Checksum and File Size
            const fileBuffer = fs.readFileSync(tempFilePath); // We can optimize to stream hash later if files are huge
            const hashSum = crypto.createHash('sha256');
            hashSum.update(fileBuffer);
            const checksum = hashSum.digest('hex');
            const finalSize = fs.statSync(tempFilePath).size;

            // Generate Token
            const token = crypto.randomBytes(32).toString('hex');
            const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

            const expiresAt = new Date(Date.now() + this.urlTtlMinutes * 60 * 1000);

            // Update item
            MediaHandoff.markAsReady(item.handoff_id, {
                temp_path: tempFilePath,
                file_size_bytes: finalSize,
                checksum_sha256: checksum,
                download_token_hash: tokenHash,
                download_url_expires_at: expiresAt.toISOString()
            });

            // Clear raw_message_json from metadata to save space
            const metadata = { ...item.metadata };
            delete metadata.raw_message_json;
            MediaHandoff.update(item.handoff_id, { metadata });

            // Dispatch Webhook
            await this.emitWebhook(item, token, finalSize, checksum, expiresAt);

        } catch (error) {
            if (tempFilePath && fs.existsSync(tempFilePath)) {
                try { fs.unlinkSync(tempFilePath); } catch (e) {}
            }
            MediaHandoff.markAsFailed(item.handoff_id, error.message);
            engineLogger.error('media', 'media.download_failed', item.engine_session_id, `Failed to download media for handoff ${item.handoff_id}`, { error: error.message });
        }
    }

    async emitWebhook(item, token, sizeBytes, checksum, expiresAt) {
        const baseUrl = process.env.MEDIA_HANDOFF_PUBLIC_BASE_URL || process.env.APIWS_PUBLIC_URL || `http://localhost:${process.env.PORT || 3000}`;
        const sourceUrl = `${baseUrl}/api/v1/internal/media-handoff/${item.handoff_id}/download`;

        const rawPayload = {
            id: item.external_message_id,
            mediaType: item.media_type,
            mimetype: item.mime_type,
            fileLength: sizeBytes,
            media: {
                media_id: item.handoff_id,
                handoff_id: item.handoff_id,
                media_type: item.media_type,
                mime_type: item.mime_type,
                file_name: item.original_filename || `${item.handoff_id}.${item.file_extension}`,
                file_size_bytes: sizeBytes,
                source_url: sourceUrl,
                download_token: token,
                source_url_expires_at: expiresAt.toISOString(),
                checksum_sha256: checksum
            }
        };

        const payload = {
            event_id: uuidv4(),
            event_type: 'message.media_update',
            engine_id: process.env.APIWS_ENGINE_ID || '',
            engine_base_url: process.env.APIWS_PUBLIC_URL || '',
            engine_session_id: item.engine_session_id,
            timestamp: new Date().toISOString(),
            raw_payload: rawPayload,
            normalized_preview: normalizePreview('message.media_update', rawPayload)
        };

        if (item.source_event_key) {
            payload.source_event_key = item.source_event_key;
        }

        const headers = {
            'Content-Type': 'application/json',
            'X-Haxis-Event-Id': payload.event_id,
            'X-Haxis-Event-Type': payload.event_type,
            'X-Haxis-Timestamp': payload.timestamp
        };

        await WebhookDeliveryService.enqueueDelivery({
            event_id: payload.event_id,
            event_type: payload.event_type,
            engine_id: payload.engine_id,
            engine_base_url: payload.engine_base_url,
            engine_session_id: payload.engine_session_id,
            webhook_url: process.env.WEBHOOK_URL,
            payload_json: payload,
            headers_json: headers
        });

        engineLogger.info('media', 'media.ready', item.engine_session_id, `Media handoff ready ${item.handoff_id}`, { eventId: payload.event_id });
    }
}

module.exports = new MediaHandoffWorker();
