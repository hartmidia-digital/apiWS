# Checklist de Produção - HAXIS WhatsApp Engine

Antes de considerar o deploy na `api.useb.ws` como concluído, execute as seguintes verificações:

## 1. Ambiente, Permissões e Paths Seguros
- [ ] O repositório foi clonado corretamente em `/home/usebws/api`.
- [ ] As variáveis de ambiente essenciais (`MASTER_API_KEY`, `ADMIN_DASHBOARD_PASSWORD`, `WEBHOOK_SECRET`, `SESSION_SECRET`, `TOKEN_ENCRYPTION_KEY`) foram preenchidas no painel do Node.js App.
- [ ] O banco de dados e arquivos críticos (`auth_info_baileys`) foram criados fora da pasta pública (em `/home/usebws/apiws-data/`).
- [ ] Execute `npm run check:production` e confirme que não há erros bloqueantes.

## 2. Testes de Segurança no Navegador (Obrigatório)
Valide se as regras do `.htaccess` e das rotas isoladas estão funcionando. As URLs abaixo **DEVEM** retornar erro (403 Forbidden ou 404 Not Found), não permitindo o download ou visualização:
- [ ] `https://api.useb.ws/.env`
- [ ] `https://api.useb.ws/package.json`
- [ ] `https://api.useb.ws/src/config/paths.js`
- [ ] `https://api.useb.ws/docs/webhooks.md`
- [ ] `https://api.useb.ws/.git/config`
- [ ] `https://api.useb.ws/auth_info_baileys` (se por acidente for criado no root)
- [ ] `https://api.useb.ws/database` (se por acidente for criado no root)
- [ ] `https://api.useb.ws/node_modules/express/package.json`

## 3. Acesso ao Painel Técnico
- [ ] Acesse `https://api.useb.ws/admin/dashboard.html`.
- [ ] Confirme que não é possível visualizar o painel sem preencher a senha (`ADMIN_DASHBOARD_PASSWORD`).

## 4. Gestão de Sessão (WhatsApp) e Persistência
- [ ] Crie uma sessão de teste. O token deve persistir no banco de dados (`apiws-data/database/whatsapp.db`).
- [ ] Leia o QR Code; confirme a pasta preenchida em `/home/usebws/apiws-data/auth_info_baileys/`.
- [ ] Clique no botão **Restart App** no cPanel e confirme se a sessão recarrega como conectada sem a necessidade de ler o QR Code novamente.

## 5. Webhooks, Limites e Comunicação
- [ ] Responda uma mensagem do celular conectado para o celular de destino.
- [ ] Confirme no log do webhook se o HAXIS Gateway obteve a mensagem validada através do `X-Haxis-Signature`.
- [ ] Mande várias mensagens seguidas. Confirme se o Rate Limiting configurado recusa com status `429 Too Many Requests`.
- [ ] O CRON / Timeout de Limpeza `haxisCleanup` rodou em `apiws-data/logs/` sem problemas de permissão?
