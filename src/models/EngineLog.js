const { db } = require('../config/database');
const { v4: uuidv4 } = require('uuid');

class EngineLog {
    /**
     * Create a new log entry
     * @param {Object} logData - Log data
     * @returns {Object} Created log entry
     */
    static create(logData) {
        const id = logData.id || uuidv4();

        let detailsJson = null;
        if (logData.details) {
            try {
                detailsJson = typeof logData.details === 'string' ? logData.details : JSON.stringify(logData.details);
            } catch (e) {
                detailsJson = '{}';
            }
        }

        const stmt = db.prepare(`
            INSERT INTO engine_logs (
                id, level, category, event, session_id, message, details_json,
                correlation_id, source, ip, user_email, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const now = new Date().toISOString();

        stmt.run(
            id,
            logData.level || 'INFO',
            logData.category || 'system',
            logData.event || 'system.log',
            logData.sessionId || null,
            logData.message || '',
            detailsJson,
            logData.correlationId || null,
            logData.source || 'system',
            logData.ip || null,
            logData.userEmail || null,
            logData.timestamp || now
        );

        return {
            id,
            ...logData,
            timestamp: logData.timestamp || now
        };
    }

    /**
     * Get logs with optional filtering
     * @param {Object} filters
     * @param {number} limit
     * @returns {Array} List of logs
     */
    static getLogs(filters = {}, limit = 100) {
        let query = 'SELECT * FROM engine_logs';
        const conditions = [];
        const params = [];

        if (filters.sessionId) {
            conditions.push('session_id = ?');
            params.push(filters.sessionId);
        }

        if (filters.level) {
            conditions.push('level = ?');
            params.push(filters.level);
        }

        if (filters.category) {
            conditions.push('category = ?');
            params.push(filters.category);
        }

        if (filters.event) {
            conditions.push('event = ?');
            params.push(filters.event);
        }

        if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
        }

        query += ' ORDER BY created_at DESC LIMIT ?';
        params.push(limit);

        const stmt = db.prepare(query);
        const rows = stmt.all(...params);

        // Parse JSON details
        return rows.map(row => {
            let details = null;
            if (row.details_json) {
                try {
                    details = JSON.parse(row.details_json);
                } catch(e) {}
            }

            return {
                ...row,
                details
            };
        });
    }

    /**
     * Clear all logs (destructive)
     * @returns {Object} Info about deleted rows
     */
    static clearAll() {
        const stmt = db.prepare('DELETE FROM engine_logs');
        return stmt.run();
    }
}

module.exports = EngineLog;
