const path = require('path');

/**
 * Resolução Centralizada de Paths
 * Garante que em produção os dados fiquem fora de public_html
 */

const APP_BASE_PATH = process.env.APP_BASE_PATH || path.join(__dirname, '../../');
const DATA_PATH = process.env.DATA_PATH || path.join(__dirname, '../../data');

const paths = {
    authInfo: process.env.AUTH_INFO_PATH || path.join(DATA_PATH, 'auth_info_baileys'),
    media: process.env.MEDIA_PATH || path.join(DATA_PATH, 'media'),
    logs: process.env.LOGS_PATH || path.join(DATA_PATH, 'logs'),
    database: process.env.DATABASE_PATH || path.join(DATA_PATH, 'database'),
    tmp: process.env.TMP_PATH || path.join(DATA_PATH, 'tmp')
};

module.exports = paths;
