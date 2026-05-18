require('dotenv').config();
const fs = require('fs');
const path = require('path');
const MediaHandoff = require('../src/models/MediaHandoff');
const { db } = require('../src/config/database');

const isDryRun = process.env.MEDIA_HANDOFF_CLEANUP_DRY_RUN === 'true';
const tempRoot = process.env.MEDIA_HANDOFF_TEMP_ROOT || path.join(__dirname, '../apiws-data/media-handoff');

console.log(`[MediaHandoffCleanup] Starting cleanup routine...`);
console.log(`[MediaHandoffCleanup] Dry Run: ${isDryRun}`);

let expiredCount = 0;
let transferredCount = 0;

try {
    // 1. Apagar expirados
    const expired = MediaHandoff.getExpired(100);
    console.log(`[MediaHandoffCleanup] Found ${expired.length} expired records.`);

    for (const record of expired) {
        if (record.temp_path && record.temp_path.startsWith(tempRoot)) {
            if (fs.existsSync(record.temp_path)) {
                if (!isDryRun) {
                    try { fs.unlinkSync(record.temp_path); } catch(e) {}
                }
                expiredCount++;
            }
        }

        if (!isDryRun) {
            MediaHandoff.update(record.handoff_id, {
                status: 'expired',
                deleted_at: new Date().toISOString()
            });
        }
    }

    // 2. Apagar confirmados transferidos que ainda não foram marcados como deletados (backup caso a confirmação síncrona tenha falhado no disco)
    const transferred = MediaHandoff.getTransferred(100);
    console.log(`[MediaHandoffCleanup] Found ${transferred.length} transferred records to verify.`);

    for (const record of transferred) {
        if (record.temp_path && record.temp_path.startsWith(tempRoot)) {
            if (fs.existsSync(record.temp_path)) {
                if (!isDryRun) {
                    try { fs.unlinkSync(record.temp_path); } catch(e) {}
                }
                transferredCount++;
            }
        }

        if (!isDryRun) {
            MediaHandoff.update(record.handoff_id, {
                status: 'deleted',
                deleted_at: new Date().toISOString()
            });
        }
    }

    // 3. Optional: Clean up partial old 'downloading' states stuck for > 2 hours
    const staleDownloadingStmt = db.prepare(`
        SELECT * FROM media_handoffs
        WHERE status = 'downloading'
        AND updated_at < datetime('now', '-2 hours')
    `);
    const stale = staleDownloadingStmt.all();
    console.log(`[MediaHandoffCleanup] Found ${stale.length} stale downloading records.`);

    for (const record of stale) {
        if (record.temp_path && record.temp_path.startsWith(tempRoot) && fs.existsSync(record.temp_path)) {
            if (!isDryRun) {
                try { fs.unlinkSync(record.temp_path); } catch(e) {}
            }
        }
        if (!isDryRun) {
            MediaHandoff.markAsFailed(record.handoff_id, 'Stuck downloading, cleaned up by worker');
        }
    }

    console.log(`[MediaHandoffCleanup] Cleanup finished.`);
    console.log(`[MediaHandoffCleanup] Expirations cleaned: ${expiredCount}`);
    console.log(`[MediaHandoffCleanup] Transferred files cleaned: ${transferredCount}`);
    console.log(`[MediaHandoffCleanup] Stale downloads reset: ${stale.length}`);

} catch (error) {
    console.error(`[MediaHandoffCleanup] Error during cleanup: ${error.message}`);
    process.exit(1);
}
