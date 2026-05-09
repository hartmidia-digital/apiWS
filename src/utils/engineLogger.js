const EngineLog = require('../models/EngineLog');
const { v4: uuidv4 } = require('uuid');

// We'll set this later from index.js to avoid circular dependencies
let wssInstance = null;

class EngineLogger {
    static setWss(wss) {
        wssInstance = wss;
    }

    static get wssInstance() {
        return wssInstance;
    }

    static maskSensitiveData(str) {
        if (!str) return str;

        // Match numbers like 5548999991234
        const phoneRegex = /\b(\d{4})(\d{4,5})(\d{4})\b/g;
        let masked = str.replace(phoneRegex, '$1****$3');

        // Match possible emails
        const emailRegex = /([a-zA-Z0-9._-]+)@([a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/gi;
        masked = masked.replace(emailRegex, (match, p1, p2) => {
            if (p1.length > 4) {
                return p1.substring(0, 4) + '***@' + p2;
            }
            return '***@' + p2;
        });

        // Match tokens
        const tokenRegex = /token_([a-zA-Z0-9]+)/gi;
        masked = masked.replace(tokenRegex, 'token_abc****');

        return masked;
    }

    static async log(level, category, event, sessionId, message, details = {}, correlationId = null, source = 'system') {
        try {
            // Never persist full messages or QRs
            const safeDetails = { ...details };
            if (safeDetails.qr) delete safeDetails.qr;
            if (safeDetails.messageContent) safeDetails.messageContent = '[REDACTED]';
            if (safeDetails.message) safeDetails.message = '[REDACTED]';

            // Mask string properties in safeDetails (shallow)
            for (const key in safeDetails) {
                if (typeof safeDetails[key] === 'string') {
                    safeDetails[key] = this.maskSensitiveData(safeDetails[key]);
                }
            }

            const safeMessage = this.maskSensitiveData(message);

            const logEntry = {
                id: uuidv4(),
                timestamp: new Date().toISOString(),
                level,
                category,
                event,
                sessionId,
                message: safeMessage,
                details: safeDetails,
                correlationId,
                source
            };

            // 1. Save to SQLite
            EngineLog.create(logEntry);

            // 2. Local Console if DEV
            if (process.env.NODE_ENV !== 'production' || level === 'ERROR' || level === 'FATAL') {
                const color = level === 'ERROR' || level === 'FATAL' ? '\x1b[31m' :
                              level === 'WARN' ? '\x1b[33m' :
                              level === 'DEBUG' ? '\x1b[35m' : '\x1b[36m';
                console.log(`${color}[${level}] [${category}::${event}]${sessionId ? ' ['+sessionId+']' : ''} ${safeMessage}\x1b[0m`);
            }

            // 3. Broadcast to WebSocket if ops client connected
            if (wssInstance) {
                const wsMessage = JSON.stringify({
                    event: 'log.created',
                    data: logEntry
                });

                // For ops clients, we identify them by the path /ops/ws
                wssInstance.clients.forEach((client) => {
                    if (client.readyState === 1 && client.isOpsClient) {
                        client.send(wsMessage);
                    }
                });
            }

        } catch (error) {
            console.error('[EngineLogger] Failed to log event', error);
        }
    }

    // Convenience methods
    static info(category, event, sessionId, message, details = {}, correlationId = null) {
        return this.log('INFO', category, event, sessionId, message, details, correlationId);
    }

    static warn(category, event, sessionId, message, details = {}, correlationId = null) {
        return this.log('WARN', category, event, sessionId, message, details, correlationId);
    }

    static error(category, event, sessionId, message, details = {}, correlationId = null) {
        return this.log('ERROR', category, event, sessionId, message, details, correlationId);
    }

    static fatal(category, event, sessionId, message, details = {}, correlationId = null) {
        return this.log('FATAL', category, event, sessionId, message, details, correlationId);
    }

    static debug(category, event, sessionId, message, details = {}, correlationId = null) {
        return this.log('DEBUG', category, event, sessionId, message, details, correlationId);
    }
}

module.exports = EngineLogger;
