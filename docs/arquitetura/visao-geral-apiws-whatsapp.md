# API Contract: HAXIS Gateway ↔ Engine

## 1. Visão Geral da Arquitetura

O ecossistema HAXIS comunica-se com o WhatsApp através de uma arquitetura em camadas para garantir escalabilidade e segurança:

`WhatsApp Web/Baileys` → `api.useb.ws engine` (Este repositório) → `api.hartmidia.com ou api.hartmidia.digital gateway` (API Limpa) → `HAXIS`

A API limpa atua como um "Gateway" entre o Motor e o cliente HAXIS final, isolando as complexidades e a carga do servidor Baileys.

## 2. Responsabilidades do Motor (apiWS)

O motor (`api.useb.ws`) é focado exclusivamente em manter conexões persistentes e estáveis com o WhatsApp Web:
- Gerenciar sessões do WhatsApp (via Baileys) e respeitar o limite de `MAX_SESSIONS` (padrão: `5`) configurado para garantir a estabilidade contra sobrecarga (Out Of Memory).
- Identificar-se perante o Gateway via chave composta (`APIWS_ENGINE_ID` + `APIWS_PUBLIC_URL` e `sessionId`) contida nos webhooks.
- Gerar QR Codes para autenticação.
- Persistir o estado da sessão localmente.
- Enviar mensagens para o WhatsApp.
- Receber mensagens brutas do WhatsApp.
- Emitir webhooks não-bloqueantes para o Gateway.
- Expor uma API interna protegida e um painel técnico isolado.
- Expor um endpoint de monitoramento de saúde não sensível (`/health`).
- **Não** ser consumido diretamente pelo HAXIS final.

## 3. Responsabilidades da API Limpa (Gateway)

A futura API Limpa será a verdadeira "inteligência" de roteamento e negócio:
- Receber webhooks emitidos pelo motor.
- Validar as assinaturas HMAC-SHA256 (`X-Haxis-Signature`).
- Normalizar payloads brutos provenientes do Baileys.
- Salvar contatos, conversas e mensagens em banco de dados escalável.
- Controlar permissões e acessos de usuários do HAXIS.
- Gerenciar filas de envio de mensagens e throttling.
- Chamar comandos do motor (apiWS) autenticando-se com a `MASTER_API_KEY`.
- Expor endpoints RESTful limpos e documentados para os clientes e o frontend HAXIS.
- Preparar a camada futura de IA e automação.

## 4. Endpoints Internos do Motor

Os endpoints expostos pelo motor em `/api/v1/` são protegidos pela `MASTER_API_KEY` (usada no header `X-Master-Key`) ou Bearer tokens (para operações de sessão).

| Método | URL | Autenticação | Função | Request | Response |
|---|---|---|---|---|---|
| `POST` | `/api/v1/sessions` | `X-Master-Key` | Criar sessão | `{ "sessionId": "string" }` | `{ status, sessionId, session: { id, token } }` |
| `GET` | `/api/v1/sessions` | Nenhuma | Listar sessões | N/A | `{ status, data: [...] }` |
| `DELETE` | `/api/v1/sessions/:id` | Bearer Token | Deletar sessão | N/A | `{ status, message }` |
| `POST` | `/api/v1/messages?sessionId=...` | Bearer Token | Enviar texto | `{ "to": "123...", "type": "text", "text": { "body": "..." } }` | `{ status, message: "...", results: [...] }` |
| `POST` | `/api/v1/messages?sessionId=...` | Bearer Token | Enviar mídia | `{ "to": "123...", "type": "image", "image": { "id": "...", "caption": "..." } }` | `{ status, message: "...", results: [...] }` |
| `POST` | `/api/v1/media` | Bearer Token | Fazer upload de mídia | Form-data (file) | `{ status, mediaId, url }` |

*O painel técnico opera de forma independente usando sessão/cookie baseados na `ADMIN_DASHBOARD_PASSWORD`.*

Observações operacionais:
- O endpoint `/api/v1/messages` também aceita destinatário individual em formato JID `...@s.whatsapp.net` e normaliza para número antes do envio.
- Ao enviar com sucesso pela rota principal, o motor emite webhook `message.sent` para a URL configurada em `WEBHOOK_URL`.

## 5. Webhooks

O Motor emite requisições POST para a URL configurada em `WEBHOOK_URL` contendo um JSON padrão.

**Headers de Validação:**
- `X-Haxis-Event-Id`: UUID único.
- `X-Haxis-Event-Type`: Tipo do evento.
- `X-Haxis-Timestamp`: ISO 8601 Timestamp.
- `X-Haxis-Signature`: Assinatura HMAC-SHA256 do corpo do JSON usando a chave `WEBHOOK_SECRET`.

**Validação de Idempotência:** A API Limpa deve usar o `X-Haxis-Event-Id` para evitar duplicação em caso de retry ou reenvios indesejados.

## 6. Ciclo de Vida de Sessão

1. **Criada:** A sessão foi inicializada mas ainda não autenticada.
2. **Aguardando QR:** O motor gera o QR code; a API Limpa deve obtê-lo.
3. **Conectada:** O aparelho leu o QR e estabeleceu comunicação (`session.connected`).
4. **Desconectada:** O aparelho perdeu sinal ou o motor reiniciou (`session.disconnected`).
5. **Reconectada:** O motor restaurou a conexão automaticamente com as credenciais salvas.
6. **Removida:** A sessão foi explicitamente deletada (`session.deleted`), invalidando o token.

## 7. Fluxos Operacionais

### 7.1 Fluxo de Recebimento de Mensagem
`WhatsApp` → (WebSocket) → `api.useb.ws Engine` → (Webhook `message.received`) → `API Limpa` → (Normalização & DB) → `HAXIS Frontend`

### 7.2 Fluxo de Envio
`HAXIS Frontend` → (REST) → `API Limpa` → (Fila/Rate Limit) → (POST `/api/v1/messages`) → `api.useb.ws Engine` → `WhatsApp` → (Webhook `message.sent` / `message.status`) → `API Limpa`

### 7.3 Fluxo de Mídia
1. **Recebimento:** Mídia recebida do WhatsApp é parseada pelo Baileys e extraída pelo motor, ou exposta através de endpoints nativos/parciais do webhook (Dependendo do suporte de extração do Baileys).
2. **Envio:** A API Limpa faz um POST Multipart para `/api/v1/media`, recebe um `mediaId`, e usa este ID num POST `/api/v1/messages` com tipo `image`, `document`, etc.
3. **Persistência:** A mídia nunca deve ficar publicamente acessível. Fica em `apiws-data/media/` e o acesso deve ser mediado através do Gateway.

## 8. Segurança
- **MASTER_API_KEY:** Protege a criação de sessões do motor via API.
- **WEBHOOK_SECRET:** Garante que a API Limpa saiba que os eventos vieram de fato do motor HAXIS.
- **ADMIN_DASHBOARD_PASSWORD:** Protege o acesso web humano ao painel técnico.
- **TOKEN_ENCRYPTION_KEY / SESSION_SECRET:** Encriptam e gerenciam estados das sessões.
- **Isolamento de Arquivos:** Todo o banco SQLite, chaves do Baileys e logs devem obrigatoriamente estar fora do diretório web (`public_html`), geralmente em `apiws-data/`.
- O Motor e a API Limpa usam **Rate Limiting** rigoroso.

## 9. Checklist para Implementar a API Limpa
- [ ] Tabela de Sessões (Mapeamento Engine-ID x Usuário HAXIS).
- [ ] Tabela de Contatos.
- [ ] Tabela de Conversas.
- [ ] Tabela de Mensagens.
- [ ] Tabela de Fila de Envio (Jobs assíncronos e rate control).
- [ ] Tabela de Eventos Webhook (Garantir idempotência por `event_id`).
- [ ] Tabela de Erros / Logs Seguros.
- [ ] Middleware para validação HMAC-SHA256 do `X-Haxis-Signature`.
- [ ] Mapeamento de permissões de Tenants/Usuários no HAXIS final.
- [ ] Conectores e integração futura com a camada de Inteligência Artificial.
