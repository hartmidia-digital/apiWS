/**
 * Database Configuration and Initialization
 * SQLite database with better-sqlite3 for synchronous operations
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Database file path
const haxisPaths = require('./paths');
const DB_PATH = path.join(haxisPaths.database, 'whatsapp.db');

// Ensure data directory exists
const dataDir = haxisPaths.database;
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

// Create database instance
const db = new Database(DB_PATH, {
    verbose: process.env.NODE_ENV === 'development' ? console.log : null
});

// Enable WAL mode for better concurrency
db.pragma('journal_mode = WAL');

/**
 * Initialize database schema
 */
function initializeSchema() {
    // Users table
    db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            role TEXT DEFAULT 'user' CHECK(role IN ('admin', 'user')),
            created_by TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_login DATETIME,
            is_active INTEGER DEFAULT 1
        )
    `);

    // WhatsApp sessions table (metadata only, auth stored in auth_info_baileys)
    db.exec(`
        CREATE TABLE IF NOT EXISTS whatsapp_sessions (
            id TEXT PRIMARY KEY,
            owner_email TEXT REFERENCES users(email) ON DELETE SET NULL,
            token TEXT NOT NULL,
            status TEXT DEFAULT 'DISCONNECTED',
            detail TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Campaigns table
    db.exec(`
        CREATE TABLE IF NOT EXISTS campaigns (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT,
            status TEXT DEFAULT 'draft' CHECK(status IN ('draft', 'ready', 'sending', 'paused', 'completed', 'cancelled')),
            session_id TEXT REFERENCES whatsapp_sessions(id) ON DELETE SET NULL,
            message_content TEXT,
            message_type TEXT DEFAULT 'text',
            media_url TEXT,
            message_delay_min INTEGER DEFAULT 3,
            message_delay_max INTEGER DEFAULT 8,
            created_by TEXT REFERENCES users(email) ON DELETE SET NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            scheduled_at DATETIME,
            started_at DATETIME,
            completed_at DATETIME
        )
    `);

    // Campaign recipients table
    db.exec(`
        CREATE TABLE IF NOT EXISTS campaign_recipients (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
            number TEXT NOT NULL,
            name TEXT,
            custom_fields TEXT,
            status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'sent', 'failed', 'retry')),
            sent_at DATETIME,
            error TEXT,
            retry_count INTEGER DEFAULT 0,
            UNIQUE(campaign_id, number)
        )
    `);

    // Create index for faster recipient lookups
    db.exec(`
        CREATE INDEX IF NOT EXISTS idx_recipients_campaign_status
        ON campaign_recipients(campaign_id, status)
    `);

    // Activity logs table
    db.exec(`
        CREATE TABLE IF NOT EXISTS activity_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_email TEXT,
            action TEXT NOT NULL,
            resource TEXT,
            resource_id TEXT,
            details TEXT,
            ip TEXT,
            user_agent TEXT,
            success INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Create index for activity log queries
    db.exec(`
        CREATE INDEX IF NOT EXISTS idx_activity_user_date
        ON activity_logs(user_email, created_at)
    `);

    // Recipient lists table
    db.exec(`
        CREATE TABLE IF NOT EXISTS recipient_lists (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT,
            recipients TEXT NOT NULL,
            created_by TEXT REFERENCES users(email) ON DELETE SET NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Engine logs table
    db.exec(`
        CREATE TABLE IF NOT EXISTS engine_logs (
            id TEXT PRIMARY KEY,
            level TEXT NOT NULL,
            category TEXT NOT NULL,
            event TEXT NOT NULL,
            session_id TEXT,
            message TEXT NOT NULL,
            details_json TEXT,
            correlation_id TEXT,
            source TEXT,
            ip TEXT,
            user_email TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Indexes for engine_logs
    db.exec(`CREATE INDEX IF NOT EXISTS idx_enginelogs_created_at ON engine_logs(created_at)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_enginelogs_level ON engine_logs(level)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_enginelogs_category ON engine_logs(category)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_enginelogs_event ON engine_logs(event)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_enginelogs_session_id ON engine_logs(session_id)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_enginelogs_correlation_id ON engine_logs(correlation_id)`);

    // Webhook Deliveries table
    db.exec(`
        CREATE TABLE IF NOT EXISTS webhook_deliveries (
            id TEXT PRIMARY KEY,
            event_id TEXT NOT NULL,
            event_type TEXT NOT NULL,
            engine_id TEXT,
            engine_base_url TEXT,
            engine_session_id TEXT,
            webhook_url TEXT NOT NULL,
            payload_json TEXT NOT NULL,
            headers_json TEXT,
            status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'delivering', 'delivered', 'retrying', 'failed', 'blocked', 'ignored')),
            attempts INTEGER DEFAULT 0,
            max_attempts INTEGER DEFAULT 5,
            last_error TEXT,
            last_http_status INTEGER,
            next_retry_at DATETIME,
            delivered_at DATETIME,
            failed_at DATETIME,
            ignored_at DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Indexes for webhook_deliveries
    db.exec(`CREATE INDEX IF NOT EXISTS idx_webhook_deliv_event_id ON webhook_deliveries(event_id)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_webhook_deliv_engine_id ON webhook_deliveries(engine_id)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_webhook_deliv_session_id ON webhook_deliveries(engine_session_id)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_webhook_deliv_status ON webhook_deliveries(status)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_webhook_deliv_next_retry ON webhook_deliveries(next_retry_at)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_webhook_deliv_created ON webhook_deliveries(created_at)`);

    console.log('[Database] Schema initialized successfully');
}

/**
 * Close database connection
 */
function close() {
    db.close();
}

// Initialize schema on load
initializeSchema();

// Handle graceful shutdown
process.on('exit', () => db.close());
process.on('SIGINT', () => {
    db.close();
    process.exit(0);
});

module.exports = {
    db,
    initializeSchema,
    close,
    DB_PATH
};
