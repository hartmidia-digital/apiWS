require('dotenv').config();
const { db } = require('../src/config/database');

console.log('--- History Sync Health Report ---');

const batchCounts = db.prepare(`SELECT status, COUNT(*) as count FROM history_sync_batches GROUP BY status`).all();
const totalBatches = batchCounts.reduce((acc, c) => acc + c.count, 0);

console.log(`Total Batches: ${totalBatches}`);
batchCounts.forEach(c => {
    console.log(`- ${c.status}: ${c.count}`);
});

console.log('\n--- Items Status ---');
const itemCounts = db.prepare(`SELECT status, COUNT(*) as count FROM history_sync_items GROUP BY status`).all();
const totalItems = itemCounts.reduce((acc, c) => acc + c.count, 0);
console.log(`Total Items: ${totalItems}`);
itemCounts.forEach(c => {
    console.log(`- ${c.status}: ${c.count}`);
});

const stuckItems = db.prepare(`SELECT COUNT(*) as count FROM history_sync_items WHERE status = 'processing' AND updated_at < datetime('now', '-1 hour')`).get();
if (stuckItems && stuckItems.count > 0) {
    console.log(`\nWarning: Found ${stuckItems.count} items stuck in 'processing' status for over an hour.`);
}

const errors = db.prepare(`SELECT item_id, error_message FROM history_sync_items WHERE status = 'failed' LIMIT 5`).all();
if (errors.length > 0) {
    console.log('\n--- Recent Errors ---');
    errors.forEach(e => {
        console.log(`Item ID: ${e.item_id} | Error: ${e.error_message || 'N/A'}`);
    });
}
