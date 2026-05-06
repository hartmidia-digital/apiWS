const fs = require('fs');
const path = require('path');
const paths = require('../src/config/paths');

console.log('--- Verificando Ambiente de Produção HAXIS ---');

const REQUIRED_ENVS = [
    'ADMIN_DASHBOARD_PASSWORD',
    'MASTER_API_KEY',
    'TOKEN_ENCRYPTION_KEY',
    'SESSION_SECRET',
    'APIWS_ENGINE_ID'
];

let hasErrors = false;

// 1. Verificando Variáveis de Ambiente
console.log('\n[1] Verificando Variáveis de Ambiente Essenciais:');
require('dotenv').config();

REQUIRED_ENVS.forEach(env => {
    if (!process.env[env]) {
        console.error(`  [X] ERRO: Variável ${env} não configurada!`);
        hasErrors = true;
    } else {
        console.log(`  [+] OK: ${env} está configurada.`);
    }
});

if (process.env.WEBHOOK_SECRET) {
    console.log(`  [+] OK: WEBHOOK_SECRET está configurada.`);
} else {
    console.warn(`  [!] AVISO: WEBHOOK_SECRET não está configurada. Webhooks não serão assinados.`);
}

// 2. Verificando Isolamento do Diretório public_html
console.log('\n[2] Verificando Isolamento do public_html:');
const isPublicHtml = (dirPath) => dirPath.includes('public_html');

const DIRS_TO_CHECK = [
    { name: 'auth_info_baileys', path: paths.authInfo },
    { name: 'media', path: paths.media },
    { name: 'logs', path: paths.logs },
    { name: 'database', path: paths.database }
];

DIRS_TO_CHECK.forEach(dir => {
    if (isPublicHtml(dir.path)) {
        console.warn(`  [!] ALERTA DE SEGURANÇA: ${dir.name} está dentro de public_html: ${dir.path}`);
        hasErrors = true;
    } else {
        console.log(`  [+] SEGURO: ${dir.name} está fora do public_html: ${dir.path}`);
    }
});

console.log('\n--- Resultado ---');
if (hasErrors) {
    console.warn('[!] Foram encontrados problemas no ambiente. Verifique os alertas acima.');
    // Não saímos com process.exit(1) para não quebrar scripts no cPanel, a não ser que forçado.
} else {
    console.log('[+] Ambiente de produção parece configurado corretamente.');
}
