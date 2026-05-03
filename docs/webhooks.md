# HAXIS Webhooks Documentation

O motor WhatsApp Web `api.useb.ws` envia webhooks fire-and-forget para a ApiH.
O objetivo do motor e entregar eventos Baileys ricos; a ApiH e responsavel por
normalizar contatos, conversas, mensagens e linha do tempo.

## Configuracao

Variaveis principais:

- `WEBHOOK_URL`: URL absoluta da ApiH.
- `WEBHOOK_SECRET`: segredo usado na assinatura HMAC.
- `WEBHOOK_TIMEOUT_MS`: timeout do POST, padrao `5000`.
- `APIH_MEDIA_UPLOAD_URL`: endpoint da ApiH para upload antecipado de midia.
- `APIH_MEDIA_UPLOAD_TIMEOUT_MS`: timeout do upload de midia.
- `AUTH_INFO_PATH`: diretorio persistente das credenciais Baileys. O motor usa
  esse caminho para reconectar sessoes existentes apos restart.

Se `WEBHOOK_URL` estiver vazia, o motor ignora webhooks sem interromper a
sessao. Falhas no POST sao registradas em log e nao bloqueiam o Baileys.

## Headers

Todo webhook inclui:

- `X-Haxis-Event-Id`: UUIDv4 unico da emissao.
- `X-Haxis-Event-Type`: tipo do evento.
- `X-Haxis-Timestamp`: instante ISO 8601.
- `X-Haxis-Signature`: HMAC-SHA256 do corpo bruto usando `WEBHOOK_SECRET`.

A ApiH usa `event_id` para idempotencia.

## Payload padrao

```json
{
  "event_id": "uuid",
  "event_type": "message.received",
  "engine_session_id": "sessao-01",
  "timestamp": "2026-05-03T10:00:00.000Z",
  "raw_payload": {},
  "normalized_preview": {}
}
```

## Eventos emitidos

### `session.status`

Emitido em mudancas de conexao, QR, reconexao e desconexao.

`raw_payload` inclui `status`, `state`, `detail` e, quando aplicavel, `qr`.

### `message.received`

Emitido para cada mensagem entregue por `messages.upsert`. O motor percorre
todas as mensagens do lote, nao apenas a primeira.

O `raw_payload` e a mensagem Baileys original, com `key`, `message`,
`pushName`, timestamps e metadados. Quando possivel, o motor faz upload
antecipado de midia para a ApiH e adiciona `mediaAssetId`.

Tipos de conteudo esperados no payload:

- `conversation`
- `extendedTextMessage`
- `imageMessage`
- `videoMessage`
- `audioMessage`
- `documentMessage`
- `stickerMessage`
- `locationMessage`
- `liveLocationMessage`
- `contactMessage`
- `contactsArrayMessage`
- `reactionMessage`
- `pollCreationMessage`, `pollCreationMessageV2`, `pollCreationMessageV3`
- `pollUpdateMessage`
- `buttonsResponseMessage`, `listResponseMessage`,
  `templateButtonReplyMessage`, `interactiveResponseMessage`
- `groupInviteMessage`
- `eventMessage`
- wrappers como `ephemeralMessage`, `viewOnceMessage`,
  `viewOnceMessageV2`, `viewOnceMessageV2Extension` e
  `documentWithCaptionMessage`

### `message.status`

Emitido a partir de `messages.update` e `message-receipt.update` quando ha
status de envio, entrega, leitura ou reproducao.

Status numericos Baileys sao preservados no `raw_payload`; a ApiH mapeia:

- `0`: failed
- `1`: pending
- `2`: sent
- `3`: delivered
- `4`: read
- `5`: played

### `message.edited`

Emitido quando `messages.update` traz `protocolMessage.editedMessage`.

### `message.deleted`

Emitido a partir de `messages.delete` ou `messages.update` com protocolo de
revogacao/exclusao.

### `contact.update`

Emitido para cada item de `contacts.update`. Pode incluir `id`, `jid`, `name`,
`notify`, `verifiedName`, `imgUrl`, `avatarUrl` ou `profilePictureUrl`.

### `group.update`

Emitido para cada item de `groups.update`. Pode incluir `id`, `jid`,
`groupId`, `subject`, `name` ou `title`.

### `group.participants.update`

Emitido para eventos de participantes de grupo. O payload costuma trazer `id`,
`participants` e `action`.

## Midia

O motor tenta anexar `mediaAssetId` antes do webhook para:

- imagem
- video
- audio
- documento
- sticker

Se o upload antecipado falhar, a mensagem ainda e enviada. A ApiH pode fazer
fallback chamando o endpoint de download do motor por `sessionId` e `messageId`.
