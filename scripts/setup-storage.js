const fs = require('fs');
const paths = require('../src/config/paths');

console.log('--- Configurando diretórios de dados do HAXIS ---');
const directoriesToCreate = [
    paths.authInfo,
    paths.media,
    paths.logs,
    paths.database,
    paths.tmp
];

directoriesToCreate.forEach(dir => {
    if (!fs.existsSync(dir)) {
        try {
            fs.mkdirSync(dir, { recursive: true });
            console.log(`[+] Criado com sucesso: ${dir}`);
        } catch (error) {
            console.error(`[X] Falha ao criar diretório ${dir}:`, error.message);
        }
    } else {
        console.log(`[-] Diretório já existe: ${dir}`);

        try {
            fs.accessSync(dir, fs.constants.W_OK);
            console.log(`    -> Permissão de escrita OK`);
        } catch (error) {
            console.error(`    -> ERRO: Sem permissão de escrita em ${dir}`);
        }
    }
});

console.log('--- Configuração concluída ---');
