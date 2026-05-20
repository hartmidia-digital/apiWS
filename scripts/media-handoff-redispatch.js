require('dotenv').config();
const { db } = require('../src/config/database');
const { sendWebhook } = require('../src/utils/webhookHaxis');
const crypto = require('crypto');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');

console.log('--- Media Handoff Redispatch ---');

const items = db.prepare(`SELECT * FROM media_handoffs WHERE status = 'ready_for_apih'`).all();

if (items.length === 0) {
    console.log('No ready_for_apih items found.');
    process.exit(0);
}

const ttlMinutes = parseInt(process.env.MEDIA_HANDOFF_URL_TTL_MINUTES || '2880', 10);
const baseUrl = process.env.MEDIA_HANDOFF_PUBLIC_BASE_URL || process.env.APIWS_PUBLIC_URL || process.env.ENGINE_PUBLIC_URL || 'http://localhost:3000';

const run = async () => {
    let count = 0;
    for (const handoff of items) {
        if (!handoff.temp_path || !fs.existsSync(handoff.temp_path)) {
            console.log(`[SKIP] Missing file for handoff_id: ${handoff.handoff_id}`);
            db.prepare(`UPDATE media_handoffs SET status = 'failed', error_message = 'File missing during redispatch' WHERE id = ?`).run(handoff.id);
            continue;
        }

        if (dryRun) {
            console.log(`[DRY-RUN] Would redispatch handoff_id: ${handoff.handoff_id}`);
            count++;
            continue;
        }

        const downloadToken = crypto.randomBytes(32).toString('hex');
        const tokenHash = crypto.createHash('sha256').update(downloadToken).digest('hex');
        const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString();

        db.prepare(`
            UPDATE media_handoffs
            SET download_token_hash = ?, download_url_expires_at = ?, status = 'ready_for_apih'
            WHERE id = ?
        `).run(tokenHash, expiresAt, handoff.id);

        const secureUrl = `${baseUrl}/api/v1/internal/media-handoff/${handoff.handoff_id}/download`;

        let parsedKey = {};
        try {
            parsedKey = JSON.parse(handoff.message_key_json);
        } catch(e) {}

        const webhookPayload = {
            handoff_id: handoff.handoff_id,
            source_event_key: handoff.source_event_key,
            external_message_id: handoff.external_message_id,
            chat_id: handoff.chat_id,
            media_type: handoff.media_type,
            mime_type: handoff.mime_type,
            file_size_bytes: handoff.file_size_bytes,
            secure_download_url: secureUrl,
            expires_at: expiresAt,
            authorization_header: `Bearer ${downloadToken}`
        };

        try {
            await sendWebhook('message.media_update', handoff.engine_session_id, webhookPayload);
            console.log(`Redispatched handoff_id: ${handoff.handoff_id}`);
            count++;
        } catch (err) {
            console.log(`Failed to redispatch handoff_id: ${handoff.handoff_id}: ${err.message}`);
        }
    }

    console.log(`\nProcessed ${count} items.`);
    process.exit(0);
};

run();
