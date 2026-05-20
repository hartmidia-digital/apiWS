const express = require('express');
const router = express.Router();
const fs = require('fs');
const crypto = require('crypto');
const MediaHandoff = require('../models/MediaHandoff');
const engineLogger = require('../utils/engineLogger');

// Middleware to protect internal routes
const requireInternalAuth = (req, res, next) => {
    const internalSecret = process.env.MEDIA_HANDOFF_SECRET;
    const masterApiKey = process.env.MASTER_API_KEY;

    const authHeader = req.headers['authorization'];
    const providedSecret = req.headers['x-haxis-media-secret'] || (authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null);
    const providedMasterKey = req.headers['x-master-key'];

    const isValidSecret = providedSecret && internalSecret && providedSecret === internalSecret;
    const isValidMasterKey = providedMasterKey && masterApiKey && providedMasterKey === masterApiKey;

    if (!isValidSecret && !isValidMasterKey) {
        return res.status(401).json({ error: 'Unauthorized: Invalid or missing authentication credentials' });
    }

    next();
};

/**
 * GET /api/v1/internal/media-handoff/:handoffId/download
 * Download the media file. Requires authentication AND the temporary token.
 */
router.get('/media-handoff/:handoffId/download', requireInternalAuth, (req, res) => {
    try {
        const { handoffId } = req.params;
        const token = req.headers['x-haxis-media-token'];

        if (!token) {
            return res.status(401).json({ error: 'Unauthorized: Missing download token in header X-Haxis-Media-Token' });
        }

        const handoff = MediaHandoff.findById(handoffId);
        if (!handoff) {
            return res.status(404).json({ error: 'Media handoff not found' });
        }

        if (handoff.status !== 'ready_for_apih') {
            return res.status(409).json({ error: 'Media is not ready for download', status: handoff.status });
        }

        if (new Date() > new Date(handoff.download_url_expires_at)) {
            MediaHandoff.update(handoffId, { status: 'expired' });
            return res.status(410).json({ error: 'Download link has expired' });
        }

        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
        if (tokenHash !== handoff.download_token_hash) {
            return res.status(403).json({ error: 'Invalid download token' });
        }

        if (!handoff.temp_path || !fs.existsSync(handoff.temp_path)) {
            return res.status(404).json({ error: 'Media file no longer exists on disk' });
        }

        const stat = fs.statSync(handoff.temp_path);

        res.writeHead(200, {
            'Content-Type': handoff.mime_type || 'application/octet-stream',
            'Content-Length': stat.size,
            'Content-Disposition': `attachment; filename="${handoff.safe_filename || handoff.original_filename || `${handoffId}.${handoff.file_extension}`}"`
        });

        const readStream = fs.createReadStream(handoff.temp_path);
        readStream.pipe(res);

        readStream.on('error', (err) => {
            engineLogger.error('media', 'media.download_error', handoff.engine_session_id, `Stream error for handoff ${handoffId}`, { error: err.message });
            if (!res.headersSent) {
                res.status(500).json({ error: 'Failed to stream file' });
            }
        });

    } catch (error) {
        engineLogger.error('media', 'media.download_failed', null, `Download failed for handoff ${req.params.handoffId}`, { error: error.message });
        if (!res.headersSent) {
            res.status(500).json({ error: 'Internal server error' });
        }
    }
});

/**
 * POST /api/v1/internal/media-handoff/:handoffId/confirm-transferred
 * Confirm the transfer and cleanup the local file.
 */
router.post('/media-handoff/:handoffId/confirm-transferred', requireInternalAuth, (req, res) => {
    try {
        const { handoffId } = req.params;

        const handoff = MediaHandoff.findById(handoffId);
        if (!handoff) {
            return res.status(404).json({ error: 'Media handoff not found' });
        }

        if (handoff.status === 'transferred' || handoff.status === 'deleted') {
            return res.json({ success: true, message: 'Transfer already confirmed', status: handoff.status });
        }

        if (handoff.temp_path && fs.existsSync(handoff.temp_path)) {
            try {
                fs.unlinkSync(handoff.temp_path);
            } catch (err) {
                engineLogger.error('media', 'media.cleanup_error', handoff.engine_session_id, `Failed to delete file for handoff ${handoffId}`, { error: err.message });
            }
        }

        MediaHandoff.update(handoffId, {
            status: 'transferred',
            transferred_to_apih_at: new Date().toISOString(),
            confirmed_by_apih_at: new Date().toISOString()
        });

        engineLogger.info('media', 'media.transferred', handoff.engine_session_id, `Media handoff ${handoffId} transferred and cleaned up`);

        res.json({ success: true, message: 'Transfer confirmed and local file deleted' });

    } catch (error) {
        engineLogger.error('media', 'media.confirm_failed', null, `Confirmation failed for handoff ${req.params.handoffId}`, { error: error.message });
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * GET /api/v1/internal/health/media-handoff
 * Internal route for media handoff health monitoring
 */
router.get('/health/media-handoff', requireInternalAuth, (req, res) => {
    try {
        const { db } = require('../config/database');
        const counts = db.prepare(`SELECT status, COUNT(*) as count FROM media_handoffs GROUP BY status`).all();
        res.json({ success: true, counts });
    } catch(error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * GET /api/v1/internal/health/history-sync
 * Internal route for history sync health monitoring
 */
router.get('/health/history-sync', requireInternalAuth, (req, res) => {
    try {
        const { db } = require('../config/database');
        const batches = db.prepare(`SELECT status, COUNT(*) as count FROM history_sync_batches GROUP BY status`).all();
        const items = db.prepare(`SELECT status, COUNT(*) as count FROM history_sync_items GROUP BY status`).all();
        res.json({ success: true, batches, items });
    } catch(error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
