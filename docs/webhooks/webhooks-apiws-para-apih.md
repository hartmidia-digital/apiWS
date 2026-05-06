# Webhooks ApiWS → APIH

## 1. Objetivo
O motor WhatsApp Web (`api.useb.ws`) envia webhooks assíncronos e fire-and-forget para a API Limpa (APIH). O objetivo principal é repassar os eventos em tempo real do Baileys para o cérebro (APIH/HAXIS) para que este processe, salve no banco, acione gatilhos de CRM, fluxos de IA ou respostas.

## 2. Fluxo
O evento entra pelo WebSocket do Baileys e sai por POST (Axios) em direção à API Limpa.
**WhatsApp** → (WebSocket) → **ApiWS** → (POST HTTP) → **APIH** → (Filas/Processamento) → **HAXIS**

## 3. URL de destino
Configurada no `.env` do ApiWS através da variável:
`WEBHOOK_URL` (Exemplo fictício: `https://api.empresa.com/engine-webhook`)

*Nota: Não versionar segredos. O `.env.example` lista a chave sem revelar o segredo em produção.*

## 4. Autenticação
O ApiWS possui uma chave configurada em `.env` (a `WEBHOOK_SECRET`). Toda vez que ele emite o evento para a APIH, ele criptografa/assina o Body usando essa chave e insere isso nos cabeçalhos (Headers) da requisição.

O APIH do outro lado deve ler o body e recriar o hash HMAC-SHA256 usando o mesmo secret conhecido. Se bater, é autêntico.

**Headers enviados pelo ApiWS:**
- `X-Haxis-Event-Id`: Um UUIDv4 único da emissão para a APIH ignorar webhooks repetidos.
- `X-Haxis-Event-Type`: String com o tipo do evento (ex: `message.received`).
- `X-Haxis-Timestamp`: ISO 8601 Timestamp de quando o ApiWS montou a requisição.
- `X-Haxis-Signature`: A assinatura gerada (`crypto.createHmac('sha256', WEBHOOK_SECRET).update(payloadString).digest('hex')`).

## 5. Payloads
O Payload enviado em JSON tenta enviar a formatação bruta do Baileys e um resumo simplificado. Em novas arquiteturas de multi-instalação da ApiWS, também adicionamos a identificação de origem (`engine_id` e `engine_base_url`), permitindo que a APIH resolva corretamente de que servidor esta sessão pertence.
*(Para aprofundamento, leia [Integração HAXIS APIH: Identidade Operacional e Engine ID](./integracao-apih-engine-id.md))*

**Exemplo Fictício (Anonimizado) de `message.received`:**
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
      "remoteJid": "5511999999999@s.whatsapp.net",
      "fromMe": false,
      "id": "3EB0XXXXX..."
    },
    "message": {
      "conversation": "Olá, queria ver os planos!"
    },
    "pushName": "João Cliente"
  },
  "normalized_preview": {
    "from": "5511999999999@s.whatsapp.net",
    "participant": "",
    "pushName": "João Cliente",
    "messageId": "3EB0XXXXX...",
    "type": "conversation",
    "text": "Olá, queria ver os planos!",
    "hasMedia": false,
    "hasLocation": false
  }
}
```

## 6. Eventos Suportados
O motor observa os sockets do Baileys e mapeia para strings de `event_type`:

1. `session.status`: Emitido em mudanças de conexão (QR Code, conectado, desconectado).
2. `message.received`: A mensagem do chat chegou (Texto, Áudio, Foto).
3. `message.status`: Atualizações (Enviado, Recebido pelo aparelho do cliente, Lido, Áudio escutado).
4. `message.deleted`: Quando o cliente revoga (apaga para todos).
5. `message.edited`: Quando o cliente edita uma mensagem enviada recentemente.
6. `contact.update`: Atualização do nome de contato.
7. `group.update`: Atualização de informações de um grupo.
8. `group.participants.update`: Alguém entrou ou saiu de um grupo em que a sessão do ApiWS está.

## 7. Falhas e Tratamento (Retries)
Atualmente, se o webhook para a APIH der falha por conta de Timeout (`WEBHOOK_TIMEOUT_MS`) ou a APIH retornar Erro Interno (500), o sistema ApiWS irá apenas **gerar um Log no console de error** (ex: `[ERROR] Falha ao enviar webhook message.received: timeout exceeded`).
**Não existe Fila de Retry persistente implementada.** (O processo é fire-and-forget para não travar a recepção de milhares de mensagens por minuto). Se for mandatório, a arquitetura deverá evoluir e isso fica marcado como Risco e Pendência técnica.

## 8. Pendências
- Testar e simular as respostas em uma bateria de carga para assegurar que se a APIH engasgar (Rate Limit/429 ou 500 demorados) os Sockets do Baileys não causarão OutOfMemory na thread principal do NodeJS no cPanel.
- Criar a camada de upload de mídia antecipada `APIH_MEDIA_UPLOAD_URL` na própria APIH e documentar este handshake para download eficiente.