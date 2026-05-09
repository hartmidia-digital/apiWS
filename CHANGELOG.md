# Changelog

Todas as mudanças notáveis deste projeto serão documentadas neste arquivo.

## [Unreleased]
### Added
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