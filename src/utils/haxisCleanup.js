const fs = require('fs');
const path = require('path');
const pino = require('pino');
const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

function cleanupOldFiles(dirPath, maxAgeDays) {
    if (!fs.existsSync(dirPath)) return;

    const now = Date.now();
    const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;

    let deletedCount = 0;
    const files = fs.readdirSync(dirPath);

    for (const file of files) {
        if (file === '.gitkeep') continue;

        const filePath = path.join(dirPath, file);
        try {
            const stats = fs.statSync(filePath);
            if (stats.isFile() && (now - stats.mtimeMs > maxAgeMs)) {
                fs.unlinkSync(filePath);
                deletedCount++;
            }
        } catch (err) {
            logger.error(`Erro ao limpar arquivo ${filePath}: ${err.message}`);
        }
    }

    if (deletedCount > 0) {
        logger.info(`HAXIS Cleanup: Removidos ${deletedCount} arquivos antigos de ${dirPath}`);
    }
}

function runCleanupRoutine() {
    if (process.env.CLEANUP_ENABLED !== 'true') return;

    logger.info('HAXIS Cleanup: Iniciando rotina de limpeza conservadora...');

    const haxisPaths = require('../config/paths');
    const mediaDir = haxisPaths.media;
    const logsDir = haxisPaths.logs;

    const mediaMaxAge = parseInt(process.env.CLEANUP_MEDIA_MAX_AGE_DAYS || '30');
    const logsMaxAge = parseInt(process.env.CLEANUP_LOGS_MAX_AGE_DAYS || '30');

    cleanupOldFiles(mediaDir, mediaMaxAge);
    cleanupOldFiles(logsDir, logsMaxAge);
}

function startCleanupCron() {
    if (process.env.CLEANUP_ENABLED !== 'true') return;

    const intervalHours = parseInt(process.env.CLEANUP_INTERVAL_HOURS || '24');
    const intervalMs = intervalHours * 60 * 60 * 1000;

    // Roda uma vez no início (com pequeno atraso) e depois no intervalo
    setTimeout(runCleanupRoutine, 5000);
    setInterval(runCleanupRoutine, intervalMs);
}

module.exports = {
    startCleanupCron
};
