# Rotas e Endpoints ApiWS

Este documento mapeia todas as rotas reais encontradas no código-fonte (`index.js`, `src/routes/api.js`, `src/routes/auth.js`, `src/routes/users.js` e `src/routes/ops.js`). A documentação foca no status atual (oficial vs. legado) para fins de auditoria e preparação para a remoção futura do painel `/admin`.

## 1. Rotas do Console Operacional (`/ops`)
Essas rotas servem as páginas estáticas e os endpoints que o painel `/ops` consome. São consideradas **Oficiais** e **Operacionais**. Requerem que a sessão possua `adminAuthed = true` e papel de `admin`.

| Método | Caminho | Autenticação | Finalidade | Status |
|---|---|---|---|---|
| `GET` | `/ops/` | Sessão (`admin`) | Redireciona para o Dashboard Operacional. | Oficial |
| `GET` | `/ops/*.html` | Sessão (`admin`) | Arquivos estáticos do painel (sessions, events, live-logs, health, etc.). | Oficial |
| `GET` | `/api/v1/ops/health` | Nenhuma | Retorna status básico, versão, memória, etc. | Oficial |
| `GET` | `/api/v1/ops/sessions` | Sessão (`admin`) | Lista todas as sessões e status reais da memória/banco. | Oficial |
| `POST` | `/api/v1/ops/sessions` | Sessão (`admin`) | Cria nova sessão via painel Ops. Payload: `{ sessionId }`. | Oficial |
| `POST` | `/api/v1/ops/sessions/:id/connect` | Sessão (`admin`) | Inicia comando de conexão via Ops. | Oficial |
| `POST` | `/api/v1/ops/sessions/:id/disconnect` | Sessão (`admin`) | Desconecta a sessão e atualiza DB. | Oficial |
| `POST` | `/api/v1/ops/sessions/:id/restart` | Sessão (`admin`) | Desconecta e reconecta após 2 segundos. | Oficial |
| `POST` | `/api/v1/ops/sessions/:id/reset-auth` | Sessão (`admin`) | Exclui pasta de auth no disco mas mantém registro no BD. | Oficial |
| `DELETE`| `/api/v1/ops/sessions/:id` | Sessão (`admin`) | Exclui a sessão e todos os dados (`whatsappService.deleteSessionData`). | Oficial |
| `GET` | `/api/v1/ops/logs` | Sessão (`admin`) | Filtra e retorna logs persistidos do DB (`EngineLog`). | Oficial |
| `GET` | `/api/v1/ops/integration` | Sessão (`admin`) | Métricas e contagem de webhooks enviados no dia. | Oficial |
| `POST` | `/api/v1/ops/webhooks/test` | Sessão (`admin`) | Dispara um payload `webhook.test` para validar conectividade com a APIH. | Oficial |

## 2. Rotas da API Interna do Motor (`/api/v1/`)
São as rotas projetadas para comunicação entre o HAXIS/APIH e o Motor, baseadas na `MASTER_API_KEY` ou Bearer Token da Sessão.

| Método | Caminho | Autenticação | Finalidade | Status |
|---|---|---|---|---|
| `POST` | `/api/v1/sessions` | `MASTER_API_KEY` | Criação de Sessão. Payload: `{ sessionId }`. | Oficial |
| `GET` | `/api/v1/sessions` | Nenhuma | Listagem simples das sessões. | Oficial |
| `DELETE`| `/api/v1/sessions/:sessionId` | Bearer Token | Deleção de sessão via API interna. | Oficial |
| `GET` | `/api/v1/sessions/:sessionId/qr` | `MASTER_API_KEY` | Força a geração de QR Code de uma sessão. | Oficial |
| `POST` | `/api/v1/messages` | Bearer Token | Envio de mensagens (texto/mídia). | Oficial |
| `POST` | `/api/v1/media` | Bearer Token | Upload de mídia multipart. Retorna `mediaId`. | Oficial |

## 3. Rotas de Autenticação (`/admin/login`, `/admin/logout`, etc.)
Apesar de possuírem o prefixo `/admin`, o sistema de auth é usado também pelo `/ops`. Estas rotas são marcadas como **Transicionais**, pois precisarão ser reestruturadas/movidas quando a interface legada `/admin` for removida.

| Método | Caminho | Finalidade | Status |
|---|---|---|---|
| `GET` | `/admin/login.html` | Página de login (servida estaticamente/interceptada). | Transicional |
| `POST` | `/admin/login` | Processa e-mail/senha. Cria sessão e cookies (`adminAuthed`). | Transicional |
| `POST` | `/admin/logout` | Destrói a sessão. | Transicional |
| `GET` | `/admin/me` | Retorna os dados básicos do usuário logado e sua role. | Transicional |
| `GET` | `/admin/ws-token`| Retorna um token para uso em WebSocket legado. | Transicional |

## 4. Rotas Legadas (Comerciais/Campanhas e UI do Admin)
Essas rotas foram projetadas para a operação "CRM/Massa" do antigo sistema. Elas não fazem parte da proposta "Dumb Engine" do ApiWS atual. São rotas e arquivos marcados como **Legado** e deverão ser removidos em fase posterior.

| Método | Caminho | Autenticação | Finalidade | Status |
|---|---|---|---|---|
| `GET` | `/admin/dashboard.html` | Sessão (`admin`) | Dashboard antigo/comercial. | Legado |
| `GET` | `/admin/*.html` | Sessão (`admin`) | `activities.html`, `campaigns.html`, `users.html`. | Legado |
| `GET` | `/admin/users` | Sessão (`admin`) | Listar usuários do admin legado. | Legado |
| `POST` | `/admin/users` | Sessão (`admin`) | Criar novos usuários admin legados. | Legado |
| `PUT` | `/admin/users/:email` | Sessão (`admin`) | Atualizar usuário. | Legado |
| `DELETE`| `/admin/users/:email` | Sessão (`admin`) | Remover usuário. | Legado |
| `(API)` | Rotas de contatos/listas | Variável | Rotas relacionadas a Campanhas em `src/routes/api.js`. | Legado |

## Observação de Segurança e Isolamento
Nenhuma rota deve expor secrets (como `WEBHOOK_SECRET` ou `MASTER_API_KEY`) nem payloads brutos não sanitizados. O acesso às rotas do `/ops` depende fortemente de `requireAuth` e `requireAdmin`. A documentação foca em refletir a realidade do código atual na branch `main`.
