require('dotenv').config();
const { db } = require('../src/config/database');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const retentionDays = parseInt(process.env.HISTORY_SYNC_RETENTION_DAYS || '7', 10);

console.log('--- History Sync Cleanup ---');
console.log(`Retention Period: ${retentionDays} days`);

const beforeDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();

if (dryRun) {
    const itemsCount = db.prepare(`SELECT COUNT(*) as count FROM history_sync_items WHERE created_at < ? AND status IN ('dispatched', 'skipped', 'duplicate', 'failed')`).get(beforeDate);
    const batchesCount = db.prepare(`SELECT COUNT(*) as count FROM history_sync_batches WHERE created_at < ? AND status IN ('completed', 'failed', 'cancelled')`).get(beforeDate);

    console.log(`[DRY-RUN] Would delete ${itemsCount.count} old items.`);
    console.log(`[DRY-RUN] Would delete ${batchesCount.count} old batches.`);
} else {
    const deletedItems = db.prepare(`DELETE FROM history_sync_items WHERE created_at < ? AND status IN ('dispatched', 'skipped', 'duplicate', 'failed')`).run(beforeDate);
    const deletedBatches = db.prepare(`DELETE FROM history_sync_batches WHERE created_at < ? AND status IN ('completed', 'failed', 'cancelled')`).run(beforeDate);

    console.log(`Deleted ${deletedItems.changes} old items.`);
    console.log(`Deleted ${deletedBatches.changes} old batches.`);
}
