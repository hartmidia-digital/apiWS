# Cobertura de Eventos ApiWS

Esta documentação mapeia a matriz oficial de cobertura dos eventos emitidos pela biblioteca Baileys (`@whiskeysockets/baileys`) pelo motor ApiWS e seu respectivo repasse para a APIH/HAXIS, após a conclusão da **Fase 1**.

## Matriz Oficial de Eventos

| Evento Baileys | Evento interno ApiWS | Capturado | Log técnico | Webhook/APIH | Observação |
|---|---|---|---|---|---|
| `connection.update` | `session.status` | Sim | Sim | Sim | Controla os estados primários do socket. |
| `messages.upsert` | `message.received` | Sim | Sim | Sim | Disparado para novas mensagens. |
| `messages.update` | `message.edited`, `message.deleted` ou `message.status` | Sim | Sim | Sim | Reflete as edições/lidas. |
| `messages.delete` | `message.delete_detected` | Sim | Sim | Sim | **Nunca apaga o histórico no banco de dados**, apenas notifica. |
| `message-receipt.update` | `message.status` | Sim | Sim | Sim | Atualizações de status da mensagem e lidas de visualização. |
| `contacts.update` | `contact.update` | Sim | Sim | Sim | |
| `contacts.upsert` | `contact.update` | Sim | Sim | Sim | Mapeado internamente como `contact.update`. |
| `groups.update` | `group.update` | Sim | Sim | Sim | |
| `group-participants.update`| `group.participants.update` | Sim | Sim | Sim | |
| `messages.reaction` | `message.reaction` | Sim | Sim | Sim | Traz chaves normalizadas: `message_id`, `remote_jid`, `participant_jid`, `reaction`, `action`. |
| `call` | `call.received` | Sim | Sim | Sim | Apenas para log e acompanhamento (audio/video/group). |
| `blocklist.update` | `blocklist.update` | Sim | Sim | Sim | Telefones expostos com máscara nos logs (`jid_masked`). |
| `blocklist.set` | `blocklist.set` | Sim | Sim | Sim | Apenas mascarado no backend e retorna quantidade e lista parcial no frontend. |
| `chats.upsert` | `chat.upsert` | Sim | Sim | Sim | Evento em volume sobre novos chats criados no aplicativo ou web. |
| `chats.update` | `chat.update` | Sim | Sim | Sim | Modificação em chat atual (pin, arquivo). |
| `chats.delete` | `chat.delete_detected` | Sim | Sim | Sim | **Nunca apaga o histórico no banco de dados**. |
| `messages.media-update` | `message.media_update` | Sim | Sim | Sim | **Tratado apenas como evento leve.** Não executa download nem processamento de mídia/base64 nesta fase. O media pipeline pesado foi deslocado. |
| `labels.edit` / `labels.association` | `label.update` | Sim | Sim | Sim | Evento agnóstico focado em categorizações de grupos. |
| `newsletter.*` | `newsletter.event` | Sim | Sim | Sim | Mapeamento flexível das variações da biblioteca para sub-status de view e participants. |

### Eventos Não Implementados na Fase 1 (Por Decisão Técnica)
1. **`presence.update`**: Omitido devido ao ruído extremo/exaustão do SQLite sem utilidade orgânica real na ponta final de operação da APIH.
2. **`messaging-history.*`**: Ayncs massivas de sincronização que onerariam os limits de rate da fila local (pode causar centenas de entregas simultâneas numa única inicialização com QR novo). Mídia também ficou retida na exclusão de escopo pesado.

### Segurança e Tratamentos
Todos os eventos acima contam com envolventes em blocos `try/catch` blindados (evitando que payloads malformados oriundos de `for` loops do baileys derrubem o motor). O log transmitido de todos eles para a tela operacional ocorre sem revelar o Raw Payload para a rede, apenas via `webhookHaxis.js` na submissão da fila local criptografada.
