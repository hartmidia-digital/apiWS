# Cobertura de Eventos — ApiWS x Baileys

## 1. Visão Geral
A integração HAXIS ApiWS utiliza a biblioteca `@whiskeysockets/baileys` para se comunicar com os servidores do WhatsApp. Dada a arquitetura focada em estabilidade, o ApiWS atua como um motor "cego" (dumb engine), capturando eventos de forma limpa, sanitizada e reativa, repassando-os via webhooks para o cérebro centralizado (APIH).

A fim de evitar sobrecarga no banco local SQLite, excesso de ruído no console operacional `/ops`, e exaustão dos webhooks da APIH, adotamos uma estratégia **controlada** de cobertura de eventos. Não repassamos todo e qualquer micro-evento, priorizando eventos de negócio.

## 2. Matriz de Cobertura de Eventos

A tabela abaixo descreve os eventos interceptados, quais são registrados tecnicamente, quais podem ser visualizados no Console Operacional `/ops` e quais são efetivamente enviados à APIH via Webhook.

| Evento Baileys | Evento interno APIws | Capturado | Log técnico | /ops | Webhook/APIH | Observação |
|---|---|---|---|---|---|---|
| `connection.update` | `session.status` | Sim | Sim | Sim | Sim | Fundamental para ciclo de vida |
| `creds.update` | *(Interno)* | Sim | Não | Não | Não | Mantém os tokens de sessão na Engine |
| `messages.upsert` | `message.received` | Sim | Sim | Sim | Sim | Principal fluxo de conversação |
| `messages.update` | `message.edited` | Sim | Sim | Sim | Sim | Normalizado de forma segura |
| `messages.delete` | `message.deleted` | Sim | Sim | Sim | Sim | Normalizado de forma segura |
| `message-receipt.update` | `message.status` | Sim | Sim | Sim | Sim | Alto volume, usar filtros no /ops |
| `messages.reaction` | `message.reaction` | Sim | Sim | Sim | Sim | Extrai metadados essenciais |
| `contacts.upsert` | `contact.update` | Sim | Sim | Sim | Sim | Injeção inicial ou atualização |
| `contacts.update` | `contact.update` | Sim | Sim | Sim | Sim | Mudança de nome, avatar, etc |
| `groups.update` | `group.update` | Sim | Sim | Sim | Sim | Configurações gerais do grupo |
| `group-participants.update` | `group.participants.update` | Sim | Sim | Sim | Sim | Entradas, saídas, promoções |
| `call` | `call.received` | Sim | Sim | Sim | Sim | Registra que houve tentativa de ligação |
| `blocklist.update` | `blocklist.update` | Sim | Sim | Sim | Sim | Atualização da lista de bloqueados |
| `blocklist.set` | `blocklist.update` | Sim | Sim | Sim | Sim | Sincronização da lista de bloqueados |
| `chats.upsert` | `chat.update` | Sim | Sim | Sim | Sim | Criação de conversa na interface |
| `chats.update` | `chat.update` | Sim | Sim | Sim | Sim | Atualização de conversa |
| `chats.delete` | `chat.update` | Sim | Sim | Sim | Sim | Remoção de conversa |

## 3. Eventos Deliberadamente Ignorados (Fase 1)

Os seguintes eventos existem na biblioteca Baileys, mas não são processados, logados ou repassados para a APIH nesta versão para preservar performance ou porque dependem de futuras flags e definições de produto:

- **`presence.update`**: Comportamento de usuário (ex: digitando, gravando áudio). Gera dezenas de eventos por segundo em conversas ativas. Ignorado para não causar saturação/flood nos webhooks e estourar a base de logs. Requereria um mecanismo de _debounce_ local caso ativado no futuro.
- **`messaging-history.set`**: Sincronização inicial de histórico. Na primeira leitura de QR Code, gera payloads com dezenas ou centenas de megabytes, que derrubariam as requisições de webhook no cPanel por restrição de tamanho/timeout.
- **`messaging-history.status`**: Status dessa sincronização (eventos de progresso e barra de carga).
- **`newsletter.*`**: Interações e metadados com canais (Channels) do WhatsApp.
- **`labels.*`**: Etiquetas exclusivas do aplicativo WhatsApp Business no celular, que seriam redundantes se a HAXIS for o CRM master.

## 4. Segurança e Privacidade

Para os eventos que **são processados**, são aplicadas rígidas políticas de higienização antes que cheguem a logs técnicos em disco e ao `/ops`:

1. **Mensagens Brutas:** Textos, áudios e mídias nunca são guardados na íntegra no banco de dados SQLite interno (tabela `engine_logs`).
2. **Máscaras:** Telefones e emails são protegidos preventivamente antes de irem para logs visuais (`***`).
3. **Payloads Limpos (Webhooks):** A propriedade `normalized_preview` no webhook envia apenas strings essenciais para que a APIH processe a ação, sem sujar o banco de dados da APIH com a hierarquia confusa da biblioteca padrão Baileys.
4. **Chamadas e Reações:** Salva-se o identificador da interação (ex. qual emoji, quem ligou) para automação, mas nenhum fluxo binário/sensível.
