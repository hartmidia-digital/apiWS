# Webhooks ApiWS → APIH

## 1. Objetivo
O motor WhatsApp Web (`api.useb.ws` / ApiWS) envia webhooks assíncronos e `fire-and-forget` para a API Limpa (APIH/Gateway). O objetivo principal é repassar os eventos em tempo real do Baileys para o Gateway processá-los.

## 2. Fluxo
O evento entra pelo WebSocket do Baileys e sai por POST (Axios) em direção à API Limpa.
**WhatsApp** → (WebSocket) → **ApiWS** → (POST HTTP) → **APIH** → (Filas/Processamento) → **HAXIS**

## 3. Configuração de Destino
Configurada no `.env` (ou ambiente cPanel) através das variáveis:
- `WEBHOOK_URL` (URL destino)
- `WEBHOOK_SECRET` (Segredo de assinatura)
- `WEBHOOK_TIMEOUT_MS` (Timeout, padrão 5000ms)

## 4. Autenticação e Headers (HMAC-SHA256)
O ApiWS possui uma chave (`WEBHOOK_SECRET`). Toda vez que emite o evento para a APIH, ele criptografa/assina o Body e insere a assinatura nos headers:

**Headers enviados:**
- `X-Haxis-Event-Id`: Um UUID único para evitar duplicações/idempotência.
- `X-Haxis-Event-Type`: String com o tipo do evento (ex: `message.received`).
- `X-Haxis-Timestamp`: ISO 8601 Timestamp de quando a requisição foi montada.
- `X-Haxis-Signature`: A assinatura HMAC-SHA256.

## 5. Payloads e Identificação
Os payloads incluem a origem (`engine_id` e `engine_base_url`) definidos nas variáveis de ambiente. Isso permite à APIH saber de qual motor a requisição está vindo quando há múltiplas instâncias em balanceamento.

**Exemplo Base (eventos de mensagens baseados no utilitário de webhooks do código):**
```json
{
  "event_id": "550e8400-e29b-41d4-a716-446655440000",
  "event_type": "message.received",
  "engine_id": "apiws.hartmidia.com",
  "engine_base_url": "https://apiws.hartmidia.com",
  "engine_session_id": "sessao_haxis_01",
  "timestamp": "2026-05-03T10:00:00.000Z",
  "raw_payload": {
    "key": {
      "remoteJid": "5511999999999@s.whatsapp.net"
    },
    "message": {}
  },
  "normalized_preview": {}
}
```

## 6. O Evento de Teste (`webhook.test`)
O Console Operacional (`/ops`) expõe um recurso visual para validar o envio de webhooks via rota `POST /api/v1/ops/webhooks/test`.
O payload gerado possui o evento tipo `webhook.test` e o envio é aguardado na requisição (diferente do fluxo fire-and-forget nativo).
O resultado desse envio (falha ou sucesso, e o tempo levado - `durationMs`) é impresso na interface de Integração para auditoria do sysadmin.

## 7. Eventos Padrões Suportados
1. `session.status`: Emitido na troca de estado da conexão (conectado, desconectado, aguardando qr).
2. `message.received`: Mensagem do chat chegou.
3. Eventos estendidos de status e chats (dependendo do mapping direto implementado em `whatsappService`).

## 8. Tratamento de Falhas
- **Fire-and-forget:** O ApiWS não armazena eventos na fila em caso de falha de conexão com a APIH (erro 500, timeout).
- **Log Persistente:** Se a requisição falha (ou se o timeout expira), o evento aciona o logger, salvando na tabela `engine_logs` (categoria `webhook`, evento `webhook.dispatch_failed`), o que fica visível no `/ops/live-logs.html` e na tela Integration, alertando o sysadmin que o HAXIS está inoperante.
