require('dotenv').config();
const { db } = require('../src/config/database');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');

console.log('--- History Sync Retry Failed ---');

const failedItems = db.prepare(`SELECT id, item_id FROM history_sync_items WHERE status = 'failed'`).all();

if (failedItems.length === 0) {
    console.log('No failed items found.');
    process.exit(0);
}

let retried = 0;

for (const item of failedItems) {
    if (dryRun) {
        console.log(`[DRY-RUN] Would retry item_id: ${item.item_id}`);
    } else {
        db.prepare(`UPDATE history_sync_items SET status = 'pending', attempts = 0, error_message = NULL WHERE id = ?`).run(item.id);
        console.log(`Retried (queued) item_id: ${item.item_id}`);
    }
    retried++;
}

console.log(`\nProcessed ${retried} items.`);
