const { db } = require('../config/database');
const { v4: uuidv4 } = require('uuid');

class MediaHandoff {
    static create(data) {
        const stmt = db.prepare(`
            INSERT INTO media_handoffs (
                handoff_id, engine_id, engine_session_id, source_event_id, source_event_key,
                external_message_id, chat_id, message_key_json, media_type, mime_type,
                original_filename, safe_filename, file_extension, file_size_bytes,
                checksum_sha256, status, temp_path, download_token_hash,
                download_url_expires_at, transferred_to_apih_at, confirmed_by_apih_at,
                deleted_at, failure_reason, attempts, metadata
            ) VALUES (
                @handoff_id, @engine_id, @engine_session_id, @source_event_id, @source_event_key,
                @external_message_id, @chat_id, @message_key_json, @media_type, @mime_type,
                @original_filename, @safe_filename, @file_extension, @file_size_bytes,
                @checksum_sha256, @status, @temp_path, @download_token_hash,
                @download_url_expires_at, @transferred_to_apih_at, @confirmed_by_apih_at,
                @deleted_at, @failure_reason, @attempts, @metadata
            )
        `);

        const id = data.handoff_id || uuidv4();

        const info = stmt.run({
            handoff_id: id,
            engine_id: data.engine_id || null,
            engine_session_id: data.engine_session_id,
            source_event_id: data.source_event_id || null,
            source_event_key: data.source_event_key || null,
            external_message_id: data.external_message_id || null,
            chat_id: data.chat_id || null,
            message_key_json: data.message_key_json ? JSON.stringify(data.message_key_json) : null,
            media_type: data.media_type || 'unknown',
            mime_type: data.mime_type || null,
            original_filename: data.original_filename || null,
            safe_filename: data.safe_filename || null,
            file_extension: data.file_extension || null,
            file_size_bytes: data.file_size_bytes || null,
            checksum_sha256: data.checksum_sha256 || null,
            status: data.status || 'detected',
            temp_path: data.temp_path || null,
            download_token_hash: data.download_token_hash || null,
            download_url_expires_at: data.download_url_expires_at || null,
            transferred_to_apih_at: data.transferred_to_apih_at || null,
            confirmed_by_apih_at: data.confirmed_by_apih_at || null,
            deleted_at: data.deleted_at || null,
            failure_reason: data.failure_reason || null,
            attempts: data.attempts || 0,
            metadata: data.metadata ? JSON.stringify(data.metadata) : null
        });

        return this.findById(id);
    }

    static findById(handoff_id) {
        const stmt = db.prepare('SELECT * FROM media_handoffs WHERE handoff_id = ?');
        const record = stmt.get(handoff_id);

        if (record) {
            if (record.message_key_json) {
                try { record.message_key = JSON.parse(record.message_key_json); } catch(e) {}
            }
            if (record.metadata) {
                try { record.metadata = JSON.parse(record.metadata); } catch(e) {}
            }
        }
        return record;
    }

    static update(handoff_id, updates) {
        const current = this.findById(handoff_id);
        if (!current) throw new Error('Media handoff not found');

        const fields = [];
        const values = {};

        for (const [key, value] of Object.entries(updates)) {
            if (value === undefined || ['id', 'handoff_id', 'created_at'].includes(key)) continue;

            let finalValue = value;
            if (key === 'message_key_json' && typeof value === 'object') {
                finalValue = JSON.stringify(value);
            } else if (key === 'metadata' && typeof value === 'object') {
                finalValue = JSON.stringify(value);
            }

            fields.push(`${key} = @${key}`);
            values[key] = finalValue;
        }

        if (fields.length === 0) return current;

        fields.push('updated_at = CURRENT_TIMESTAMP');
        values.handoff_id = handoff_id;

        const stmt = db.prepare(`
            UPDATE media_handoffs
            SET ${fields.join(', ')}
            WHERE handoff_id = @handoff_id
        `);

        stmt.run(values);
        return this.findById(handoff_id);
    }

    static findQueued(limit = 10) {
        const stmt = db.prepare(`
            SELECT * FROM media_handoffs
            WHERE status = 'queued'
            ORDER BY created_at ASC
            LIMIT ?
        `);
        return stmt.all(limit).map(record => {
            if (record.message_key_json) {
                try { record.message_key = JSON.parse(record.message_key_json); } catch(e) {}
            }
            if (record.metadata) {
                try { record.metadata = JSON.parse(record.metadata); } catch(e) {}
            }
            return record;
        });
    }

    static markAsFailed(handoff_id, reason, incrementAttempt = true) {
        const stmt = db.prepare(`
            UPDATE media_handoffs
            SET status = 'failed',
                failure_reason = ?,
                attempts = attempts + ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE handoff_id = ?
        `);
        stmt.run(reason, incrementAttempt ? 1 : 0, handoff_id);
        return this.findById(handoff_id);
    }

    static markAsReady(handoff_id, { temp_path, file_size_bytes, checksum_sha256, download_token_hash, download_url_expires_at }) {
        const stmt = db.prepare(`
            UPDATE media_handoffs
            SET status = 'ready_for_apih',
                temp_path = ?,
                file_size_bytes = ?,
                checksum_sha256 = ?,
                download_token_hash = ?,
                download_url_expires_at = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE handoff_id = ?
        `);
        stmt.run(temp_path, file_size_bytes, checksum_sha256, download_token_hash, download_url_expires_at, handoff_id);
        return this.findById(handoff_id);
    }

    static getExpired(limit = 50) {
        const stmt = db.prepare(`
            SELECT * FROM media_handoffs
            WHERE download_url_expires_at IS NOT NULL
              AND download_url_expires_at <= datetime('now')
              AND status IN ('ready_for_apih', 'downloading')
            LIMIT ?
        `);
        return stmt.all(limit);
    }

    static getTransferred(limit = 50) {
        const stmt = db.prepare(`
            SELECT * FROM media_handoffs
            WHERE status = 'transferred'
            LIMIT ?
        `);
        return stmt.all(limit);
    }
}

module.exports = MediaHandoff;
