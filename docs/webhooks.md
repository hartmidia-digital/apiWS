# HAXIS Webhooks Documentation

## 1. Visão Geral

O HAXIS WhatsApp Web Engine (`api.useb.ws`) emite requisições POST para informar sistemas externos (a "API Limpa") sobre eventos em tempo real (ex.: mensagens recebidas, alterações de status da sessão). Este design é baseado no padrão de **Fire-and-Forget**, garantindo que o motor principal não fique bloqueado enquanto aguarda respostas.

## 2. Configurações e Comportamento

As configurações principais são definidas no `.env`:
- `WEBHOOK_URL`: A URL absoluta (ex.: `https://api.hartmidia.com/engine-webhook`) que receberá as requisições.
- `WEBHOOK_SECRET`: Um token secreto usado para calcular e validar a assinatura HMAC.
- `WEBHOOK_TIMEOUT_MS`: O tempo máximo que o motor aguardará pela resolução do POST (padrão 5000ms).

### Comportamentos Críticos:
- **WEBHOOK_URL Vazia:** Se a URL não estiver definida, os eventos são ignorados em silêncio. Isso não quebra o motor.
- **API Limpa Indisponível:** Se a requisição atingir o timeout ou retornar erro 5xx/4xx, o erro é registrado no log local e a execução do motor continua. **O motor não faz retries**; a API limpa é responsável por consultar o status de mensagens pendentes se houver suspeita de falha.
- **Armazenamento Idempotente:** A API Limpa **deve** usar a propriedade `event_id` para garantir que o mesmo evento não seja processado mais de uma vez.

## 3. Segurança e Headers HMAC

Todas as requisições enviadas conterão os seguintes cabeçalhos para auxiliar na segurança e triagem:

- `X-Haxis-Event-Id`: Um UUIDv4 único representando a tentativa.
- `X-Haxis-Event-Type`: O tipo do evento (ex.: `message.received`).
- `X-Haxis-Timestamp`: ISO 8601 Timestamp informando o instante de emissão.
- `X-Haxis-Signature`: Assinatura digital.

**Fórmula da Assinatura HMAC:**
O cabeçalho `X-Haxis-Signature` contém um hash em hexadecimal computado usando o algoritmo `SHA-256`, o `WEBHOOK_SECRET` como chave, e o *body* inteiro (JSON stringificado) da requisição como payload.

*Exemplo de validação no Node.js (API Limpa):*
```javascript
const crypto = require('crypto');
const signature = crypto.createHmac('sha256', process.env.WEBHOOK_SECRET)
    .update(req.rawBody) // Importante: usar a string bruta exata
    .digest('hex');

if (req.headers['x-haxis-signature'] !== signature) {
    return res.status(403).send('Invalid signature');
}
```

## 4. Payload Padrão

Todo evento enviado no body seguirá a estrutura abaixo:

```json
{
  "event_id": "8b51d459-71fc-40d6-953b-9e429bbbbbbb",
  "event_type": "message.received",
  "engine_session_id": "sess-admin-123",
  "timestamp": "2024-05-15T10:00:00.000Z",
  "raw_payload": { ... },
  "normalized_preview": { ... }
}
```

## 5. Eventos Implementados

### 5.1 `session.status` (Conexão / Desconexão)
Emitido quando há alteração na camada de conectividade Baileys.

**Exemplo:**
```json
{
  "event_id": "uuid",
  "event_type": "session.status",
  "engine_session_id": "teste-01",
  "timestamp": "2024-05-15T10:00:00.000Z",
  "raw_payload": { "state": "open", "status": "CONNECTED" },
  "normalized_preview": {
    "status": "CONNECTED",
    "reason": ""
  }
}
```

### 5.2 `message.received`
Emitido quando uma mensagem é recebida no WhatsApp.

**Exemplo:**
```json
{
  "event_id": "uuid",
  "event_type": "message.received",
  "engine_session_id": "teste-01",
  "timestamp": "2024-05-15T10:05:00.000Z",
  "raw_payload": {
      "key": { "remoteJid": "5511999999999@s.whatsapp.net", "id": "ABC123XYZ" },
      "message": { "conversation": "Olá mundo!" },
      "pushName": "João"
  },
  "normalized_preview": {
    "from": "5511999999999@s.whatsapp.net",
    "pushName": "João",
    "text": "Olá mundo!",
    "hasMedia": false
  }
}
```

### 5.3 `message.sent` / `message.status`
Emitido quando uma mensagem é enviada ativamente através do motor, ou há atualização de leitura/entrega.

**Exemplo:**
```json
{
  "event_id": "uuid",
  "event_type": "message.sent",
  "engine_session_id": "teste-01",
  "timestamp": "2024-05-15T10:10:00.000Z",
  "raw_payload": {
      "key": { "remoteJid": "5511999999999@s.whatsapp.net" },
      "status": "SENT"
  },
  "normalized_preview": {
    "to": "5511999999999@s.whatsapp.net",
    "status": "SENT"
  }
}
```

## 6. Eventos Parciais e Pendentes

- **`media.received` (Parcial):** Atualmente, o recebimento de mídia cai sob o guarda-chuva de `message.received` (O atributo `hasMedia` será verdadeiro, e o `raw_payload` conterá a estrutura `imageMessage` ou `documentMessage`). O motor **ainda não extrai e baixa automaticamente** a mídia para persistência isolada sem comandos do usuário.
- **`session.qr` (Pendente):** O webhook para exibir o QR em tempo real para a API Limpa deve ser estendido no futuro para permitir renderização headless total (atualmente consumido via WebSocket pelo painel técnico nativo).
- **`engine.error` (Pendente):** Falhas críticas no subsistema ainda são registradas estritamente em disco no `logs/system.log`. Pode ser exposto via webhook em futuras interações.
