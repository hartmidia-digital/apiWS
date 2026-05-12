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

## 3. Configurando a App Node.js e Variáveis de Ambiente
1. Vá em **Setup Node.js App** no cPanel e clique em **Create Application**.
2. **Node.js version**: Selecione 18 ou a mais recente disponível.
3. **Application mode**: Production.
4. **Application root**: Selecione o diretório `/home/usebws/api`.
5. **Application URL**: Selecione o domínio `api.useb.ws`.
6. **Application startup file**: Digite `index.js`.
7. **NÃO crie um arquivo `.env` manual na pasta `api`**. Adicione as **Variáveis de Ambiente** através da própria interface do *Setup Node.js App*.
    *   `PORT=3000`
    *   `NODE_ENV=production`
    *   `DATA_PATH=/home/usebws/apiws-data`
    *   `APIWS_ENGINE_ID=apiws.seu-dominio.com` (Obrigatório em produção)
    *   `APIWS_PUBLIC_URL=https://apiws.seu-dominio.com`
    *   `WEBHOOK_URL=https://api.gateway.com/hook`
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
4. Você pode validar se o deploy foi bem sucedido consultando o endpoint `https://api.useb.ws/api/v1/ops/health` que retornará dados de saúde ou a rota raiz básica se configurada.
5. Alternativamente, via shell do cPanel, rode:
   `cd /home/usebws/api && npm run check:production`

## 5. Fluxo de Validação Pós-Deploy no Console Ops
1. Acesse o domínio `https://api.useb.ws/ops` (que pode requerer login temporário via interface legada `/admin/login.html`).
2. O sistema pedirá o login: use o e-mail de admin e a senha configurada em `ADMIN_DASHBOARD_PASSWORD`.
3. No **Console Operacional** (`/ops/sessions.html`), crie ou selecione uma sessão e inicie a conexão.
4. Leia o QR Code usando a aba "Aparelhos Conectados" no app WhatsApp.
5. Verifique o status como `CONNECTED`. Na tela `/ops/live-logs.html`, monitore os logs fluindo, validando a integridade da transmissão.
6. Teste o webhook em `/ops/integration.html`.

## 6. O que NUNCA deve ir para o Git
A arquitetura configurada via `/src/config/paths.js` e o `.gitignore` já garantem a exclusão, mas atente-se para nunca forçar o tracking de:
- A pasta `auth_info_baileys/` ou qualquer token local.
- Banco de dados SQLite (`*.db`).
- Arquivos `.env`.
