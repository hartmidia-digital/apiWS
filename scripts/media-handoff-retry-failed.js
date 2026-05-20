require('dotenv').config();
const { db } = require('../src/config/database');
const fs = require('fs');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');

console.log('--- Media Handoff Retry Failed ---');

const failedItems = db.prepare(`SELECT id, handoff_id, temp_path FROM media_handoffs WHERE status = 'failed'`).all();

if (failedItems.length === 0) {
    console.log('No failed items found.');
    process.exit(0);
}

let retried = 0;

for (const item of failedItems) {
    if (dryRun) {
        console.log(`[DRY-RUN] Would retry handoff_id: ${item.handoff_id}`);
    } else {
        const fileExists = item.temp_path && fs.existsSync(item.temp_path);
        if (fileExists) {
            // Already downloaded, just redispatch
            db.prepare(`UPDATE media_handoffs SET status = 'ready_for_apih', error_message = NULL WHERE id = ?`).run(item.id);
            console.log(`Retried (ready_for_apih) handoff_id: ${item.handoff_id}`);
        } else {
            // Re-download
            db.prepare(`UPDATE media_handoffs SET status = 'queued', error_message = NULL WHERE id = ?`).run(item.id);
            console.log(`Retried (queued) handoff_id: ${item.handoff_id}`);
        }
    }
    retried++;
}

console.log(`\nProcessed ${retried} items.`);
