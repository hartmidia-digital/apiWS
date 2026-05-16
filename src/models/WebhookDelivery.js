const { db } = require('../config/database');
const { v4: uuidv4 } = require('uuid');

class WebhookDelivery {
    /**
     * Create a new webhook delivery record
     * @param {Object} data
     * @returns {Object} Created record
     */
    static create(data) {
        const id = data.id || uuidv4();
        const payloadJson = typeof data.payload_json === 'string' ? data.payload_json : JSON.stringify(data.payload_json);
        const headersJson = data.headers_json ? (typeof data.headers_json === 'string' ? data.headers_json : JSON.stringify(data.headers_json)) : null;
        const status = data.status || 'pending';
        const attempts = data.attempts || 0;
        const maxAttempts = data.max_attempts || parseInt(process.env.WEBHOOK_MAX_ATTEMPTS || '5', 10);
        const nextRetryAt = data.next_retry_at || null;

        const stmt = db.prepare(`
            INSERT INTO webhook_deliveries (
                id, event_id, event_type, engine_id, engine_base_url, engine_session_id,
                webhook_url, payload_json, headers_json, status, attempts, max_attempts, next_retry_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        stmt.run(
            id,
            data.event_id,
            data.event_type,
            data.engine_id || null,
            data.engine_base_url || null,
            data.engine_session_id || null,
            data.webhook_url,
            payloadJson,
            headersJson,
            status,
            attempts,
            maxAttempts,
            nextRetryAt
        );

        return { id, ...data, status, attempts, max_attempts: maxAttempts };
    }

    /**
     * Update delivery status and relevant fields
     */
    static update(id, updates) {
        const setClauses = [];
        const params = [];

        for (const [key, value] of Object.entries(updates)) {
            setClauses.push(`${key} = ?`);
            params.push(value);
        }

        setClauses.push(`updated_at = CURRENT_TIMESTAMP`);

        if (setClauses.length === 0) return false;

        params.push(id);

        const query = `UPDATE webhook_deliveries SET ${setClauses.join(', ')} WHERE id = ?`;
        const stmt = db.prepare(query);
        const result = stmt.run(...params);

        return result.changes > 0;
    }

    /**
     * Get a delivery by ID
     */
    static findById(id) {
        const stmt = db.prepare('SELECT * FROM webhook_deliveries WHERE id = ?');
        const row = stmt.get(id);

        if (row) {
            try { row.payload_json = JSON.parse(row.payload_json); } catch(e) {}
            if (row.headers_json) {
                try { row.headers_json = JSON.parse(row.headers_json); } catch(e) {}
            }
        }

        return row;
    }

    /**
     * Get pending deliveries that are due for retry
     */
    static getDueDeliveries() {
        const stmt = db.prepare(`
            SELECT * FROM webhook_deliveries
            WHERE status IN ('pending', 'retrying')
            AND attempts < max_attempts
            AND (next_retry_at IS NULL OR next_retry_at <= CURRENT_TIMESTAMP)
            ORDER BY created_at ASC
            LIMIT 50
        `);

        const rows = stmt.all();
        return rows.map(row => {
            try { row.payload_json = JSON.parse(row.payload_json); } catch(e) {}
            if (row.headers_json) {
                try { row.headers_json = JSON.parse(row.headers_json); } catch(e) {}
            }
            return row;
        });
    }

    /**
     * Get deliveries with filtering and pagination
     */
    static getDeliveries(filters = {}, limit = 50, offset = 0) {
        let query = 'SELECT * FROM webhook_deliveries';
        const conditions = [];
        const params = [];

        if (filters.status) {
            conditions.push('status = ?');
            params.push(filters.status);
        }
        if (filters.engine_session_id) {
            conditions.push('engine_session_id = ?');
            params.push(filters.engine_session_id);
        }
        if (filters.event_type) {
            conditions.push('event_type = ?');
            params.push(filters.event_type);
        }
        if (filters.event_id) {
            conditions.push('event_id = ?');
            params.push(filters.event_id);
        }
        if (filters.attention_required) {
            conditions.push(`(status IN ('failed', 'blocked') OR (status = 'retrying' AND attempts >= max_attempts))`);
        }

        if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
        }

        query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
        params.push(limit, offset);

        const stmt = db.prepare(query);
        const rows = stmt.all(...params);

        return rows.map(row => {
            try { row.payload_json = JSON.parse(row.payload_json); } catch(e) {}
            if (row.headers_json) {
                try { row.headers_json = JSON.parse(row.headers_json); } catch(e) {}
            }
            return row;
        });
    }

    /**
     * Get stats
     */
    static getStats() {
        const todayStart = new Date();
        todayStart.setHours(0,0,0,0);
        const todayStr = todayStart.toISOString();

        const successStmt = db.prepare(`SELECT count(*) as count FROM webhook_deliveries WHERE status = 'delivered' AND created_at >= ?`);
        const successToday = successStmt.get(todayStr).count;

        const allErrorsStmt = db.prepare(`SELECT count(*) as count FROM webhook_deliveries WHERE status IN ('failed', 'blocked') AND created_at >= ?`);
        const errorsToday = allErrorsStmt.get(todayStr).count;

        const totalPendingStmt = db.prepare(`SELECT count(*) as count FROM webhook_deliveries WHERE status = 'pending'`);
        const pendingCount = totalPendingStmt.get().count;

        const totalRetryingStmt = db.prepare(`SELECT count(*) as count FROM webhook_deliveries WHERE status = 'retrying'`);
        const retryingCount = totalRetryingStmt.get().count;

        const totalFailedStmt = db.prepare(`SELECT count(*) as count FROM webhook_deliveries WHERE status = 'failed'`);
        const failedCount = totalFailedStmt.get().count;

        const totalBlockedStmt = db.prepare(`SELECT count(*) as count FROM webhook_deliveries WHERE status = 'blocked'`);
        const blockedCount = totalBlockedStmt.get().count;

        const lastSuccessStmt = db.prepare(`SELECT * FROM webhook_deliveries WHERE status = 'delivered' ORDER BY delivered_at DESC LIMIT 1`);
        const lastSuccess = lastSuccessStmt.get();

        const lastErrorStmt = db.prepare(`SELECT * FROM webhook_deliveries WHERE status IN ('failed', 'blocked') ORDER BY updated_at DESC LIMIT 1`);
        const lastError = lastErrorStmt.get();

        return {
            successToday,
            errorsToday,
            pendingCount,
            retryingCount,
            failedCount,
            blockedCount,
            lastSuccess,
            lastError
        };
    }
}

module.exports = WebhookDelivery;
