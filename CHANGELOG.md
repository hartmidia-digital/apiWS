# Changelog

Todas as mudanças notáveis deste projeto serão documentadas neste arquivo.

## [Unreleased]
### Added
- **Pack: ApiWS — Controlled History Sync + Media Handoff Reliability**:
  - Implementado sistema de History Sync seguro, assíncrono e controlado (desligado por padrão).
  - Tabela `history_sync_batches` e `history_sync_items` criadas em banco local SQLite para registrar histórico cadenciado.
  - O fluxo original de mensagens (`messages.upsert`) foi refatorado para ignorar `append` por padrão sem quebrar as mensagens reais (`notify`).
  - Listeners adicionados para interceptar grandes volumes através do evento Baileys `messaging-history.set`.
  - Criado novo worker assíncrono independente (`HistorySyncWorker.js`) focado apenas em iterar e emitir payloads cadenciados (`message.history_sync`) sem travar a porta e memória da máquina.
  - Metadados simplificados para mídias históricas: O ApiWS agora envia apenas preview de metadados sem acionar automação indesejada via download pesado por parte do histórico longo.
  - Remoção de mensagens passadas foram contornadas enviando metadados `preserve_history: true` nos eventos detectados, como registro de auditoria, bloqueando perda indesejada do BD no APIH.
  - Deduplicação robusta e determinística adotada via string formatada de identificadores chaves `source_event_key`.
  - Novos utilitários npm scripts CLI para tratamento do Media Handoff: `npm run media-handoff:health`, `npm run media-handoff:retry-failed`, `npm run media-handoff:redispatch` (Redispatch envia payload usando Headers e não expõe tokens na Query).
  - Novos utilitários npm scripts CLI para History Sync: `npm run history-sync:health`, `npm run history-sync:retry-failed`, `npm run history-sync:process-once`, `npm run history-sync:cleanup` com opção manual de simulação `--dry-run`.
  - Adicionado roteador de endpoints privados (`/api/v1/internal/health/*`) para diagnóstico online da aplicação sem comprometer o console oficial legado.
  - Atualização dos Defaults em documentação: `MEDIA_HANDOFF_URL_TTL_MINUTES` subiu para 2880 e `MEDIA_HANDOFF_RETENTION_HOURS` subiu para 72.

- **Pack 2: ApiWS Media Handoff**:
  - Configuração inicial do Media Pipeline.
  - Implementado `MediaHandoffWorker` e a tabela `media_handoffs` para realizar o download temporário seguro da mídia original de mensagens do WhatsApp e mantê-la fora da aplicação/banco e versionamento, disponível sob demanda.
  - Novo payload do evento `message.media_update` que não propaga dados pesados (base64) e envia apenas uma URL segura combinada com o parametro temporal de token via webhook.
  - Disponibilizados endpoints privados internos em `/api/v1/internal/media-handoff/` para consumo do HAXIS APIH de forma controlada (`GET` seguro para o arquivo real e confirmação `POST` via `confirm-transferred`).
  - Segurança fail-closed atualizada: Se a flag `MEDIA_HANDOFF_ENABLED` estiver ativa mas faltar o ambiente declarar a obrigatória `MEDIA_HANDOFF_SECRET`, a aplicação bloqueia os endpoints operacionais prevenindo vazamento das Midias locais sob tokens genéricos e o worker aborta a inicialização.
  - Evitada alocação de token sensível atrelado a arquivo em Query Strings para proteger access logs web: Tokens agora trafegam seguros via payload de body com a propriedade separada `download_token` para ser provida apenas via Header HTTP (`X-Haxis-Media-Token`).
  - Adicionadas opções de feature flag completas (como `MEDIA_HANDOFF_ENABLED=false` padrão) que mantêm comportamento retrocompatível intocado sem configurações ativas.
  - Acompanha script de limpeza `media-handoff:cleanup` para gerenciamento seguro e mitigação de lixo acumulado expirado/transferido.

- **Fase 1: Cobertura de Eventos Baileys**:
  - Implementado envio e formatação simplificada via webhook para diversos novos eventos nativos: `messages.reaction`, `call`, `blocklist.update`, `blocklist.set`, `chats.upsert`, `chats.update`, `chats.delete`, `messages.media-update`, bem como variações atreladas à versão (`labels.*` e `newsletter.*`).
  - Atualizadas as validações e mapeamentos centralizados em `webhookHaxis.js` contendo uma geração própria de string de idempotência atrelada ao evento base (`source_event_key`) mitigando as re-entregas do framework nativo.
  - Ajuste nas submissões internas com `engineLogger` no `sendWebhook` antes do salvamento da fila do SQLite, garantindo rastreabilidade protegida dos pacotes da engine.
  - Regra de compatibilidade do Media Update inserida exclusivamente como "metadata-only" (apenas alteração do log do arquivo leve, sem iniciar download físico e processamento - que ocorrerá na task futura separada de "Media Pipeline").

### Fixes & Compatibility
  - Bloqueados via exclusão de escopo provisório eventos `presence.update` e variações de `messaging-history.*` por serem intensamente volumosos e exigirem limites robustos de debounce antes da entrada na camada da fila persistente, poupando a engine de ruído transacional massivo sem retorno operacional orgânico atual na APIH.
  - Refatorados eventos passados de mensagem para englobarem os listeners sob a blindagem `try/catch`, minimizando chance de um callback contendo exceção mal-formada do framework parar as escutas.
  - Regras de compatibilidade do `messages.delete` unificadas, adicionando as propriedades requeridas `message.delete_detected` e `preserve_history` nas validações do sistema que disparam auditoria para proteger as remoções do webhook de apagar os dados centrais em outras pontas.

- **Confiabilidade de Entrega de Webhooks (Fila Persistente):**
  - Adicionada tabela SQLite `webhook_deliveries` para persistir e enfileirar webhooks antes do envio, separando o status de entrega do log de eventos.
  - Implementado Worker de Background com repetições automáticas (Retry) via backoff progressivo em caso de falhas temporárias de rede (timeouts, HTTP 500, etc) ao comunicar com a APIH.

## [1.1.2] - 2024-05-18

### Added
- Feature Flag `APIWS_LEGACY_ADMIN_ENABLED` to strictly control access to legacy `/admin` interface.
- Complete redirect coverage ensuring legacy `/admin` URLs gracefully fallback to `/ops/` when disabled.
