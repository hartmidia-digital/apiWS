# Segurança — ApiWS

Este documento estabelece as diretrizes e regras de segurança oficiais para o motor ApiWS, validando a proteção dos endpoints, autenticação e dados persistidos.

## 1. Endpoints Sensíveis e Autenticação
Quase todas as operações no motor são restritas e expostas sob rotas da API versão 1 (`/api/v1/`).

- **Criação e Controle de Sessão via API Interna:** Protegidas por **Bearer Tokens** (Tokens seriais únicos gerados na criação, não são necessariamente JWTs complexos) gerados na inicialização ou pela chave mestra (`MASTER_API_KEY`) passada através do header `X-Master-Key`. Esse token deve estar no cabeçalho de todas as requisições server-to-server (`Authorization: Bearer <token>`).
- **Console Operacional (`/ops`):** Protegido através de sessão de cookie (`session-file-store` ou memória persistente) firmada com login. A senha exigida na rota transicional de login (`/admin/login.html`) equivale à variável de ambiente `ADMIN_DASHBOARD_PASSWORD`.
- **Rotas Legadas (`/admin`):** Seguem o mesmo modelo de cookie da sessão, porém encontram-se em fase transicional/obsoleta e não devem ser estendidas.

## 2. Risco de Exposição de QR Code
Um QR Code de WhatsApp exposto na web pode permitir que um invasor tome controle do número celular como se fosse um dispositivo oficial vinculado (WhatsApp Web).
- O QR Code só é fornecido se a requisição provir de uma API logada (Master Key, Bearer) ou via WebSocket autenticado no console operacional `/ops/ws` (onde o sysadmin tem a visão do QR Code).
- O QR Code é tratado como dado **efêmero**: transita na rede mas nunca é persistido no banco SQLite nem nos arquivos físicos de log.

## 3. Risco de Envio de Mensagens por Endpoint Público
- O token Bearer deve permanecer isolado do lado cliente (frontend). Ele é custodiado pelo ecossistema HAXIS (APIH), que assinará e baterá no ApiWS pelo backend (server-to-server).

## 4. Persistência Segura e Isolamento de Diretórios
- As subpastas de sessão do `@whiskeysockets/baileys` (`auth_info_baileys`), bem como a pasta `media`, `logs` e `database` (SQLite) devem sempre ficar **isoladas do `public_html`**.
- O projeto conta com um `.htaccess` na raiz para bloquear tentativas de requisição direta a arquivos sensíveis, porém o deploy via cPanel `Node.js App` já garante por padrão que a execução do código fonte permaneça em diretório não exposto.
- O SQLite e demais diretórios seguem o caminho definido em `DATA_PATH` (ver `/src/config/paths.js`).

## 5. Regras do .env e Variáveis
1. Nunca versionar o `.env`. Existe apenas `.env.example` no git.
2. Em produção, variáveis sensíveis como `TOKEN_ENCRYPTION_KEY`, `SESSION_SECRET` e `ADMIN_DASHBOARD_PASSWORD` devem ser injetadas de forma segura (geralmente pelo Setup Node.js App do cPanel).
3. `COOKIE_SECURE` deve estar `true` em produção sob HTTPS para impedir interceptação da sessão técnica.

## 6. Regras de Logs e Mascaramento
O `engineLogger.js` atua sanitizando tudo antes da persistência:
- Mensagens de chat, conteúdo binário ou metadados de webhook não são salvos nos logs estruturados.
- Números de telefone, chaves e tokens são mascarados no log e no `/ops`.

## 7. Versionamento Rigoroso
1. Diretórios de dados (`auth_info_baileys/`, `database/`, arquivos SQLite) e os logs nunca devem ser commitados.
2. O arquivo `.gitignore` atua como barreira fundamental.

## 8. Webhooks (APIWS → APIH)
- A comunicação com o HAXIS é assinada via HMAC-SHA256 (`X-Haxis-Signature`). Apenas quem possuir a chave `WEBHOOK_SECRET` pode gerar ou validar a autenticidade dos dados gerados por este motor.

## 9. Recomendações Futuras (Backlog de Segurança)
- Implementar limitação restritiva em nível WHM/cPanel (Firewall L7/IP) permitindo apenas que os IPs do Gateway HAXIS consumam os endpoints em `/api/v1/`.
