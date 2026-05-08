# Deployment HAXIS WhatsApp Engine (cPanel / Node.js)

Este documento descreve como realizar o deploy do motor WhatsApp Web em uma hospedagem cPanel (`api.useb.ws`).

## 1. Estrutura de Diretórios Segura
Para garantir que os arquivos sensíveis não fiquem expostos na web, a estrutura é separada da seguinte forma:

*   **Código da Aplicação:** `/home/usebws/api` (Onde este repositório git é clonado).
*   **Dados Privados:** `/home/usebws/apiws-data` (Onde o SQLite, tokens Baileys, e mídias ficam armazenados).

## 2. Deploy via Git Version Control
1. No cPanel, acesse **Git Version Control** e crie um novo repositório apontando para a sua branch contendo este código.
2. Defina o caminho do diretório: `/home/usebws/api`.
3. O cPanel deve reconhecer o arquivo `.cpanel.yml` automaticamente durante os pulls. O script cuidará de rodar as validações estruturais e reiniciar o app (`tmp/restart.txt`).

## 3. Configurando a App Node.js e `.env`
1. Vá em **Setup Node.js App** no cPanel e clique em **Create Application**.
2. **Node.js version**: Selecione 18 ou a mais recente disponível.
3. **Application mode**: Production.
4. **Application root**: Selecione o diretório `/home/usebws/api`.
5. **Application URL**: Selecione o domínio `api.useb.ws`.
6. **Application startup file**: Digite `index.js`.
7. **NÃO crie um arquivo `.env` manual na pasta `api`**. Adicione as **Variáveis de Ambiente** através da própria interface do *Setup Node.js App*.
    *   `PORT=3000`
    *   `NODE_ENV=production`
    *   `APP_BASE_PATH=/home/usebws/api`
    *   `DATA_PATH=/home/usebws/apiws-data`
    *   `APIWS_ENGINE_ID=apiws.seu-dominio.com` (Obrigatório em produção)
    *   `APIWS_PUBLIC_URL=https://apiws.seu-dominio.com`
    *   `MAX_SESSIONS=5`
    *   `ADMIN_DASHBOARD_PASSWORD=...`
    *   `MASTER_API_KEY=...`
    *   `TOKEN_ENCRYPTION_KEY=...` (64 char hex)
    *   `SESSION_SECRET=...`
8. Salve.

## 4. Instalação e Execução Inicial
1. Depois de salvar, clique no botão **Run NPM Install** na mesma tela do cPanel.
2. Clique em **Restart** ou **Start App**.
3. O servidor criará automaticamente a pasta `/home/usebws/apiws-data/` contendo `database`, `media`, `logs`, e `auth_info_baileys`. Se a variável `APIWS_ENGINE_ID` não estiver definida e o ambiente for de produção, a aplicação falhará de forma segura (Fatal Error).
4. Você pode validar se o deploy foi bem sucedido consultando o endpoint `https://api.useb.ws/health` que retornará o status `ok` e o ambiente (`production`).
5. Alternativamente, via shell do cPanel, rode:
   `cd /home/usebws/api && npm run check:production`

## 5. Fluxo Técnico: Como Escanear o QR Code
1. Acesse o domínio `https://api.useb.ws/admin/dashboard.html`.
2. O sistema pedirá o login: use a senha que você configurou em `ADMIN_DASHBOARD_PASSWORD`.
3. No painel, crie ou selecione uma sessão e clique em **Connect** / **Show QR Code**.
4. Leia o QR Code usando a aba "Aparelhos Conectados" no app WhatsApp.
5. Verifique o status como `CONNECTED`. O webhook `session.connected` será disparado para a API Limpa.

## 6. O que NUNCA deve ir para o Git
A arquitetura configurada via `/src/config/paths.js` e o `.gitignore` já garantem a exclusão, mas atente-se para nunca forçar o tracking de:
- A pasta `auth_info_baileys/` ou qualquer token local.
- Banco de dados SQLite (`*.db`).
- Arquivos `.env`.
