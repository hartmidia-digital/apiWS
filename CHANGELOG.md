# Changelog

Todas as mudanças notáveis deste projeto serão documentadas neste arquivo.

## [Unreleased]
### Added
- **Confiabilidade de Entrega de Webhooks (Fila Persistente):**
  - Adicionada tabela SQLite `webhook_deliveries` para persistir e enfileirar webhooks antes do envio, separando o status de entrega do log de eventos.
  - Implementado Worker de Background com repetições automáticas (Retry) via backoff progressivo em caso de falhas temporárias de rede (timeouts, HTTP 500, etc) ao comunicar com a APIH.
  - Preservação estrita do `event_id` durante retentativas para garantir idempotência do lado da APIH.
  - Painel Operacional `/ops/integration.html` reestruturado para exibir métricas da fila (Pendentes, Em Retry, Falhas), listagem detalhada de todos os envios e suporte à intervenção manual (reprocessar agendamento imediatamente ou marcar erro definitivo como ignorado).

### Fixes & Compatibility (Compatibilidade WA Web/Baileys)
- Atualização da versão do pacote `@whiskeysockets/baileys` de `^7.0.0-rc.9` para `^7.0.0-rc11` e ajustes de compatibilidade para resolver o problema onde o WhatsApp marcava mensagens como enviadas por "versão antiga".
- Remoção do uso forçado de `fetchLatestWaWebVersion()` devido a possíveis desalinhamentos com os protobufs do Baileys. A prioridade agora é o `fetchLatestBaileysVersion()`, com fallback automático.
- Ajuste no `Browser Identity` alterando de `Ubuntu, Chrome` para `Mac OS, Desktop` buscando diminuir flags de incompatibilidade e suspeitas pelo WhatsApp Web.

### Added
- **Logs Operacionais Seguros:** Adicionados logs de diagnóstico seguros com `engineLogger` na inicialização do socket em `whatsapp.js`, exibindo a versão efetivamente utilizada do WA Web e a versão do pacote Baileys.
- Endpoint `/api/v1/ops/health` enriquecido para retornar informações de `baileysVersion` e `browserIdentity` no diagnóstico operacional.

- **Console Operacional (`/ops`)**: Novo painel exclusivo para diagnóstico do motor WhatsApp, separado do dashboard `/admin`.
- **Telas Inclusas**:
  - Visão Geral (status do motor, uptime, ambiente, mem).
  - Sessões (criação, conexão, remoção e QR code em tempo real).
  - Logs ao Vivo (streaming via WebSocket).
  - Histórico de Eventos (leitura do log em SQLite).
  - Saúde do Motor (diagnósticos e paths isolados).
  - Integração APIH (estatísticas e teste prático de webhook).
- **Logger Central (`engineLogger.js`)**: Abstração de log que intercepta eventos do Baileys, Webhooks e do sistema (mascarando tokens, telefones, ocultando payload/QR real) com output para banco, console e WebSocket.
- **Modelo \`EngineLog\`**: Nova tabela no SQLite (`engine_logs`) gerada para persistir todos os eventos do motor.
- **Proteção no WebSockets (`/ops/ws`)**: Validação de sessão do painel para o acesso à rota de broadcast.
- Documentação exclusiva para operação (`docs/operacao/console-operacional-apiws.md`).

### Changed
- `src/services/whatsapp.js`: Eventos de status (connecting, open, close) e recepção de mensagens agora são emitidos pro \`engineLogger\`.
- `src/utils/webhookHaxis.js`: Despachos enviados com sucesso ou falha agora registram log na observabilidade do motor.
- `index.js`: Integrado a inicialização das novas rotas de `/ops` e middleware de segurança protegendo todos os recursos HTML do painel utilizando a role `admin`.

## [Não lançado]

### Ajustes Operacionais e Homologação
- implementado endpoint seguro de verificação de saúde (`GET /health`) para monitoramento;
- ajustado o limite inicial de sessões sugerido de `10` para `MAX_SESSIONS=5`;
- implementada trava (HTTP 403) na criação de novas sessões que impede ultrapassar o valor de `MAX_SESSIONS`;
- revisado o envio correto de `engine_id` e `engine_base_url` nos webhooks com payload assinado via HMAC;
- revisada a documentação (`/docs`) e `README.md` refletindo os novos parâmetros e endpoints adicionados.

### Funcionalidades
- adicionado envio de `engine_id` nos webhooks para APIH;
- adicionado envio de `engine_base_url` nos webhooks para APIH;
- adicionadas variáveis `APIWS_ENGINE_ID` e `APIWS_PUBLIC_URL`;
- HMAC continua assinando o payload completo.

### Segurança / Operacional
- inicialização bloqueada em produção caso falte `APIWS_ENGINE_ID` (impede processamento silencioso e inseguro);

### Documentação
- atualizada documentação em `/docs` sobre Identidade Operacional e regras do webhook (`docs/webhooks/integracao-apih-engine-id.md`).
- Criada auditoria de consistência entre documentação e código do ApiWS (`docs/auditorias/relatorio-consistencia-documentacao-codigo-apiws.md`).
- Organizada a nomenclatura da pasta `/docs` usando os padrões exigidos (português do Brasil, kebab-case).
- Criado índice oficial da documentação do ApiWS (`docs/indice-documentacao-apiws.md`).
- Criado documento de padrões permanentes de documentação (`docs/padroes-documentacao-apiws.md`).
- Criado documento oficial da instância ApiWS — WhatsApp (`docs/instancia/instancia-apiws-whatsapp.md`).
- Criada documentação de operação de sessão WhatsApp (`docs/operacao/operacao-sessoes-whatsapp-apiws.md`).
- Organizada a documentação de webhooks ApiWS → APIH (`docs/webhooks/webhooks-apiws-para-apih.md`).
- Mapeada e organizada a documentação de deploy de produção (`docs/deploy/`).
- Criada documentação de segurança evidenciando uso da `MASTER_API_KEY`, encriptação local de tokens e limitações de spam (`docs/seguranca/seguranca-apiws.md`).
- Registradas pendências entre documentação e implementação real.
- Criada ata de recomendação para próxima sprint, com foco em Estabilização Operacional (`docs/sprints/sprint-estabilizacao-operacional-apiws.md`).
- `README.md` reduzido e atualizado para atuar puramente como um portal/índice direcionando para `/docs`.
## [1.1.3] - 2026-05-15
### Adicionado
- O painel `/ops` foi consolidado como Console Operacional oficial da engine.
- O painel administrativo antigo `/admin` foi marcado como legado e seu acesso será controlado através da flag de ambiente `APIWS_LEGACY_ADMIN_ENABLED`.
- Adicionado novo fluxo de redirecionamento pós-login para o `/ops`.
- Implementado listagem de identificação humana (telefone/nome) mascarados nas conexões do WhatsApp no painel Ops.
- Logs técnicos foram reformulados para uma visão operacional e clara (Logs ao Vivo e Histórico de Eventos).
- Tela de Integração APIH agora exibe informações completas de último erro/sucesso e lista de falhas recentes no webhook.
- Adicionado sistema de filtros compostos (Sessão, Nível, Categoria, Status Operacional, Busca Textual) nos Logs ao Vivo (Nota: Filtro por Período listado como pendência técnica para futuras implementações em tempo real).
- Implementada sanitização de payloads de logs diretamente no Backend (`src/routes/ops.js`), impedindo que conteúdos de mensagens, tokens, headers ou senhas sejam trafegados brutos pela rede e exibidos no painel web.
