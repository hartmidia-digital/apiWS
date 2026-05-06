# Relatório de Consistência entre Documentação e Código — ApiWS

## 1. Resumo executivo
O projeto ApiWS (Super-Light-Web-WhatsApp-API-Server adaptado para HAXIS) possui um código maduro (Node.js com Express e `@whiskeysockets/baileys`). No entanto, a documentação estava inicialmente distribuída entre arquivos genéricos na raiz e na pasta `/docs`, com alguns nomes pouco claros (ex: `DEPLOYMENT-HAXIS.md` x `DEPLOYMENT.md`). Foi feita uma consolidação da documentação técnica na pasta `/docs` seguindo os padrões HAXIS, criando a fonte de verdade para operação.

A stack identificada no código confirmou a utilização do Node.js, Express, `better-sqlite3` para banco, pm2/ecosystem, scripts `.cpanel.yml` para deployment em cPanel e disparo de webhooks seguros para a APIH.

## 2. Documentos encontrados
- `docs/API-CONTRACT-HAXIS-GATEWAY.md`: Coerente com o código (renomeado).
- `docs/webhooks.md`: Coerente com o código (renomeado).
- `DEPLOYMENT-HAXIS.md`: Coerente com o código (renomeado).
- `CHECKLIST-PRODUCTION.md`: Coerente com o código (renomeado).
- `DEPLOYMENT.md`: Parcialmente coerente / histórico (renomeado).
- `README.md`: Desatualizado frente à nova organização (será atualizado para focar no novo índice).
- `AGENTS.md`: Coerente com o código.
- `NOTICE.md`: Histórico.

## 3. Estrutura atual da documentação
Anteriormente:
```
/docs
  API-CONTRACT-HAXIS-GATEWAY.md
  webhooks.md
/
  DEPLOYMENT-HAXIS.md
  CHECKLIST-PRODUCTION.md
  DEPLOYMENT.md
  README.md
```

## 4. Estrutura organizada proposta/aplicada
Aplicada:
```
docs/
├── README.md (ou indice-documentacao-apiws.md)
├── padroes-documentacao-apiws.md
├── auditorias/
│   └── relatorio-consistencia-documentacao-codigo-apiws.md
├── arquitetura/
│   └── visao-geral-apiws-whatsapp.md
├── instancia/
│   └── instancia-apiws-whatsapp.md
├── operacao/
│   └── operacao-sessoes-whatsapp-apiws.md
├── webhooks/
│   └── webhooks-apiws-para-apih.md
├── deploy/
│   ├── deploy-producao-apiws.md
│   ├── checklist-production-apiws.md
│   └── deployment-legacy-apiws.md
├── seguranca/
│   └── seguranca-apiws.md
├── sprints/
│   └── sprint-estabilizacao-operacional-apiws.md
```

## 5. Tabela DE/PARA

| Arquivo atual | Problema encontrado | Nome sugerido | Ação realizada/recomendada |
|---|---|---|---|
| `docs/API-CONTRACT-HAXIS-GATEWAY.md` | Nome em inglês, falta de padronização | `docs/arquitetura/visao-geral-apiws-whatsapp.md` | Movido via git mv |
| `docs/webhooks.md` | Nome genérico | `docs/webhooks/webhooks-apiws-para-apih.md` | Movido via git mv |
| `DEPLOYMENT-HAXIS.md` | Fora da pasta docs, nome inglês | `docs/deploy/deploy-producao-apiws.md` | Movido via git mv |
| `CHECKLIST-PRODUCTION.md` | Fora da pasta docs, nome inglês | `docs/deploy/checklist-production-apiws.md` | Movido via git mv |
| `DEPLOYMENT.md` | Fora da pasta docs, redundância | `docs/deploy/deployment-legacy-apiws.md` | Movido via git mv |

## 6. Matriz documentação x código

| Documento | Afirmação/documentação | Arquivo(s) de código relacionado(s) | Status real no código | Classificação | Observação |
|---|---|---|---|---|---|
| visao-geral | `MASTER_API_KEY` protege `/api/v1/sessions` | `src/routes/api.js` | Existe a validação `validateMasterKey` | Feito | - |
| visao-geral | Webhooks usam `X-Haxis-Signature` HMAC-SHA256 | `src/utils/webhookHaxis.js` | Implementado gerando HMAC-SHA256 | Feito | - |
| deploy-producao | Banco, media e auth_info em `apiws-data` fora do public_html | `src/config/paths.js`, `.cpanel.yml` | Resolvido via `DATA_PATH` | Feito | Funciona via cPanel vars |
| webhooks | Evento `session.status` gerado na conexão | `src/services/whatsapp.js` | Existe emissão em `connection.update` | Feito | - |
| webhooks | Upload antecipado para `APIH_MEDIA_UPLOAD_URL` | `src/services/whatsapp.js` (`uploadMediaToApih`) | Implementado via FormData para ApiH | Feito | - |

## 7. Pendências críticas
- Nenhuma pendência funcional imediata identificada que bloqueie a operação. A stack reflete exatamente o que a documentação descrevia.

## 8. Pendências médias
- A cobertura de testes automatizados na documentação não estava muito explícita em relação aos novos fluxos do Baileys para o webhook, embora haja scripts de teste.
- O endpoint legado de upload ainda reside no arquivo `api.js` junto com a v1, pode gerar confusão futura.

## 9. Melhorias futuras
- Completar monitoramento de PM2 de maneira mais extensa na documentação (atualmente há foco em cPanel).
- Reforçar limites operacionais contra spam na documentação de operação.

## 10. Inconsistências encontradas
- Havia dois arquivos de deploy: `DEPLOYMENT.md` (antigo do repositório base) e `DEPLOYMENT-HAXIS.md` (específico do HAXIS). O primeiro foi mantido como legacy.
- Nenhuma inconsistência técnica detectada entre o código analisado de webhooks/rotas e os docs HAXIS.

## 11. Estado da instância WhatsApp
- **Nome da instância:** Gerenciado dinamicamente como multi-sessão por ID (ex: passando `sessionId`).
- **Domínio:** Em produção `https://api.useb.ws`.
- **Sessão:** Salva em disco na pasta resolvida por `AUTH_INFO_PATH` (`/home/usebws/apiws-data/auth_info_baileys`).
- **QR Code:** Exposto via WebSocket no painel (`/admin/dashboard.html`) ou API (re-geração segura).
- **Reconexão:** Automática gerenciada em `whatsapp.js` ao reiniciar ou `connection === 'close'`.
- **Persistência:** Pastas do Baileys, protegidas por `.htaccess` e fora da pasta pública do cPanel.
- **Restart:** Suportado, reconecta sessões salvas.
- **Logs:** Pino e PM2 logs em `apiws-data/logs`.
- **Riscos operacionais:** Deletar `auth_info_baileys` exige escanear os QRs novamente.

## 12. Estado dos endpoints
- `POST /api/v1/sessions` (cria/retoma, master key requerida).
- `GET /api/v1/sessions` (lista, open/auth).
- `DELETE /api/v1/sessions/:sessionId` (remove).
- `GET /api/v1/sessions/:sessionId/qr` (regera qr).
- `POST /api/v1/messages` (envio texto/media, session auth).
- `POST /api/v1/media` (upload de mídia).
- `DELETE /api/v1/message` (revogar mensagem enviada).
- Todos encontram reflexo na documentação nova de arquitetura.

## 13. Estado dos webhooks
- **Para APIH:** Disparados usando Axios em `webhookHaxis.js`.
- **Payload Real:** Contém `event_id`, `event_type`, `engine_session_id`, `timestamp`, `raw_payload`, `normalized_preview`.
- **Autenticação:** Header `X-Haxis-Signature` com HMAC-SHA256 (`WEBHOOK_SECRET`).
- **Headers:** `X-Haxis-Event-Id`, `X-Haxis-Event-Type`, `X-Haxis-Timestamp`.
- **Tratamento de falha:** O Axios possui timeout de `5000` (configurável) e logs em caso de falha (Pino log), é fire-and-forget (não trava Baileys).
- **Retries:** Não há retry configurado no engine; APIH deve tratar perda eventual se ocorrer (porém a estabilidade do server costuma contornar).
- **Riscos de duplicidade:** Mitigado pelo uso de `event_id` (UUIDv4) que a APIH deverá tratar.

## 14. Estado da segurança
- **Autenticação dos endpoints:** Bearer token validado nas rotas ou API_KEY (`X-Master-Key`).
- **Tokens/secrets:** Encriptados via `AES-256-CBC` (chave `TOKEN_ENCRYPTION_KEY`).
- **CORS:** Implementado, origens restritas (`ALLOWED_ORIGINS`).
- **Rate limit:** Implementado no Express (`RATE_LIMIT_WINDOW_MS`, etc).
- **Exposição de QR Code:** Restrito ao admin autenticado por sessão (cookie `ADMIN_DASHBOARD_PASSWORD`).
- **Proteção de rotas sensíveis:** `.htaccess` bloqueia acessos a pastas.
- **Variáveis de ambiente:** Documentadas em `.env.example`, injetadas via UI no cPanel.
- **Risco de envio não autorizado:** Mínimo, devido à exigência de JWT/Bearer + Session valid.

## 15. Estado do deploy
- Totalmente documentado:
  - **Domínio:** `api.useb.ws`.
  - **Caminho da aplicação:** `/home/usebws/api`.
  - **Proxy reverso:** Via Passenger do NodeJS cPanel.
  - **HTTPS:** Gerenciado pelo cPanel auto-SSL.
  - **Start/restart:** Gerado pelo `tmp/restart.txt` no `.cpanel.yml` auto deploy.
  - **Logs:** Arquivos e app logs.
  - **Variaveis de ambiente:** Inseridas no painel cPanel app settings.
  - **Backup de sessão:** Apenas pasta do disco `apiws-data`.

## 16. Estado da integração com APIH
- **Fluxo APIH → ApiWS:** POST em `/api/v1/messages` com auth.
- **Fluxo ApiWS → APIH:** POST em `WEBHOOK_URL`.
- Estão de acordo com o código, sem falhas aparentes de implementação versus documentação de arquitetura/webhooks.

## 17. O que existe no código e não está documentado
- As capacidades de campanhas e agendamentos (arquivos `campaigns.js`, `campaign-sender.js` e schema BD de recipients) não possuem docs específicos, parecem ser funções acopladas ao painel local que talvez fujam ao escopo "API Gateway".
- O gerenciamento detalhado de usuários em banco SQLite para o painel admin.

## 18. O que está documentado, mas não existe no código
- Não foi detectada nenhuma promessa falsa. A documentação (inclusive IA/Omnichannel) deixa claro que a "Inteligência" reside na APIH e não no ApiWS.

## 19. Riscos de desencontro de informação
- Sem as docs consolidadas na pasta correta, os desenvolvedores poderiam tentar subir em outras plataformas (como Docker puro sem storage correto) e perder os dados das sessões a cada restart.
- Perigo de misturarem o `.env.example` local (que gera na raiz) com o do cPanel (que pede `/home/...`).

## 20. Recomendações de próximas sprints
1. **Correção documental/consistência**: Concluído por esta tarefa.
2. **Estabilização operacional da instância WhatsApp**: Validar limpeza automática de logs antigos.
3. **Segurança dos endpoints e webhooks**: Considerar retries para webhooks se houver falhas curtas de rede com a APIH.
4. **Melhorias de deploy/monitoramento**: Expor métricas ou health-check simples público, e criar documentação estrita sobre o módulo de campanhas (ou sua remoção se HAXIS for a única fonte de verdade de envios).

## 21. Regra permanente de documentação
(Incorporada a partir do `docs/padroes-documentacao-apiws.md`)
Sempre priorizar o `/docs` como fonte da verdade, utilizando português do Brasil e mantendo a coerência com as regras HAXIS.