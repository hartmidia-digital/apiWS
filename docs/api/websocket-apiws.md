# WebSocket e Transmissão de Eventos

O ApiWS expõe um servidor WebSocket (`ws://` ou `wss://` dependendo do proxy reverso) para transmitir dados em tempo real a interfaces observacionais e ferramentas de linha de comando.

Este servidor está embutido no processo principal (`index.js`), partilhando a mesma porta do servidor Express.

## 1. Endpoints do WebSocket

Existem dois fluxos principais conectados a este socket:

### 1.1 `ws://.../ops/ws` (Console Operacional)
Este é o fluxo **Oficial** para a operação técnica.
- **Autenticação:** Baseada no cookie da sessão (`session-file-store`). Durante o handshake (`upgrade`), o Node lê os cookies do request. Se o ID de sessão existir no `sessionStore` e possuir a flag `adminAuthed`, a conexão é aceita e marcada com `client.isOpsClient = true`.
- **Eventos Recebidos:**
  - O terminal Ops envia mensagens apenas para testes de ping, sendo o canal primordialmente *read-only* de lado cliente.
- **Eventos Emitidos (Broadcasting):**
  - Todo log sanitizado que passar pelo `engineLogger.js` (Eventos de `INFO`, `WARN`, `ERROR` atrelados a categorias como `webhook`, `session`, `system`).
  - Geração de QR Code (`qr.generated`).

### 1.2 `ws://.../` (Raiz / Transicional)
Este é o fluxo **Legado/Transicional**, pertencente ao Dashboard `/admin` antigo.
- **Autenticação:** Ouve a emissão do token (gerado via `/admin/ws-token`).
- **Eventos Emitidos:**
  - `session-update`: Emite status de conexão, de geração de QR Code para os componentes antigos (e também usado internamente por alguns lógicos).
  - `session-deleted`.

*Nota de Planejamento:* Quando o painel legado for descontinuado, a porta raiz do WebSocket poderá ser extinta, deixando apenas o `/ops/ws` como fonte de observabilidade segura.

## 2. QR Code (Transitoriedade)
O motor trata o QR Code do WhatsApp com máxima confidencialidade e volatilidade.
- A biblioteca Baileys gera o QR Code durante o pareamento de sessão.
- O evento entra em um *callback* no motor e é transmitido como *string* (Base64/URL) através do WebSocket.
- O dado **nunca** é salvo em disco ou injetado em banco de dados (`engine_logs`).
- Assim que o QR expira ou o painel WebSocket se fecha, o QR é descartado.

## 3. Comportamento do Broadcasting
- Cada instância de Socket (`wss.clients`) interage de maneira diferente baseada na flag `isOpsClient`.
- Logs de motor (`type: log`) só são disparados pelo `engineLogger` se detectarem que a instância do WebSocket está ativa e com a devida autenticação.
- Caso o socket sofra timeout ou encerramento da conexão, a interface web irá invocar uma estratégia de reconnect ou forçará reload.

## 4. Diferença entre WebSocket e Webhook
É crucial não confundir os dois mecanismos:
- **WebSocket (`/ops/ws`)**: Transmite dados para leitura visual *humana* dentro dos painéis administrativos para debugging e acompanhamento da saúde do serviço.
- **Webhook (`POST` para a APIH)**: É a transmissão *máquina-para-máquina* (S2S). Todos os eventos reais de WhatsApp (recebimento de mensagens, status de bateria, status de conexão realística) são postados via webhook HAXIS para alimentar o back-end inteligente.
