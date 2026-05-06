# Instância ApiWS — WhatsApp

## 1. Objetivo da instância
Explicar que a instância ApiWS é responsável pela camada técnica de comunicação direta com o WhatsApp Web (usando a biblioteca `@whiskeysockets/baileys`).

## 2. Papel no ecossistema
O fluxo isola as complexidades da API WhatsApp do sistema final:
HAXIS → APIH → ApiWS → WhatsApp
WhatsApp → ApiWS → APIH → HAXIS

## 3. O que o ApiWS é
- Serviço técnico de WhatsApp.
- Ponte operacional e gerenciador de WebSockets.
- Responsável por conexão, envio, recebimento, download/upload de mídia Baileys, e repasse de eventos (webhooks).

## 4. O que o ApiWS não é
- Não é ERP.
- Não é CRM.
- Não é cérebro operacional do negócio.
- Não é dono das regras de negócio do produto final.
- Não é módulo de atendimento humano direto (embora tenha um painel técnico simples).
- Não é motor de IA.
- Não é plataforma omnichannel completa neste momento (suporta estritamente WhatsApp).

## 5. Domínio
Em produção: `https://api.useb.ws`

## 6. Stack real
- Engine: `Node.js` v16/v18.
- Framework Web: `Express`.
- WhatsApp Core: `@whiskeysockets/baileys`.
- Banco de Dados (Metadados locais/admin): `better-sqlite3`.
- Ambiente: Deploy customizado via `cPanel` (Git Version Control + Passenger Node App).

## 7. Sessão WhatsApp
- **Onde a sessão fica salva**: Em disco, na pasta configurada pela variável `AUTH_INFO_PATH` (em produção, fora da pasta web: `/home/usebws/apiws-data/auth_info_baileys`).
- **Como a sessão é criada**: Via endpoint POST em `/api/v1/sessions` (enviando a Master Key) ou pelo painel técnico.
- **Como o QR Code é gerado**: Após criar a sessão, o QR code é servido pelo WebSocket interno ao Dashboard ou recarregado via GET em `/api/v1/sessions/:sessionId/qr`.
- **Como verificar conexão**: Observando o status em `/api/v1/sessions` ou via webhook de `session.status`.
- **Como reiniciar com segurança**: Reiniciando o App NodeJS no cPanel. As sessões com status `CONNECTED` tentarão reconectar usando o state em disco.
- **O que não deve ser apagado**: Nunca apague os diretórios de sessão dentro de `auth_info_baileys`, a menos que o objetivo seja forçar um logout daquele número (exigirá escanear novo QR).
- **Riscos operacionais**: Apagar acidentalmente os tokens. Vazamento da URL do dashboard sem senha.

## 8. Variáveis de ambiente

| Variável | Obrigatória? | Exemplo fictício | Finalidade | Observação |
|---|---|---|---|---|
| `NODE_ENV` | Sim | `production` | Modo de ambiente | - |
| `PORT` | Não | `3000` | Porta local | Ignorado se cPanel usar Passenger |
| `ADMIN_DASHBOARD_PASSWORD` | Sim | `senhaAdmin123` | Senha do painel técnico | - |
| `MASTER_API_KEY` | Sim | `chaveSuperSegura99` | Proteção das rotas principais da API | - |
| `TOKEN_ENCRYPTION_KEY` | Sim | `...hex64...` | Chave de encriptação dos tokens em disco | - |
| `WEBHOOK_URL` | Sim | `https://apih.../webhook` | URL da APIH para envio de eventos | - |
| `WEBHOOK_SECRET` | Sim | `segredoHmac` | Usada para assinar o header `X-Haxis-Signature` | - |
| `DATA_PATH` | Sim | `/home/usebws/data` | Caminho seguro para dados (fora public_html) | - |
| `AUTH_INFO_PATH` | Não | `/home/usebws/data/auth` | Subpasta para sessões Baileys | Fallback é gerado auto |

## 9. Endpoints relacionados
- `POST /api/v1/sessions`: Criar nova sessão.
- `GET /api/v1/sessions`: Listar sessões ativas.
- `DELETE /api/v1/sessions/:sessionId`: Apagar sessão (logout).
- `GET /api/v1/sessions/:sessionId/qr`: Regerar e solicitar QR para leitura.
- `POST /api/v1/messages`: Enviar mensagem (Texto/Midia).
- `POST /api/v1/media`: Upload prévio de mídia.

## 10. Webhooks relacionados
- **Saída (Eventos do Engine para APIH):**
  - `session.status`
  - `message.received`
  - `message.status` (sent, read, etc)
  - `message.deleted`
  - `message.edited`
  - `contact.update`
  - `group.update`
  - `group.participants.update`

## 11. Riscos conhecidos
- **Perda de sessão**: Ocorre se o disco sofrer wipe ou se a pasta `auth_info_baileys` for deletada indevidamente.
- **QR Code exposto**: Evitado pelo `.htaccess` e proteção via senha no dashboard `/admin`.
- **Envio não autorizado**: Apenas usuários que possuam um Token Válido da sessão ou a `MASTER_API_KEY` conseguem postar `/api/v1/messages`.
- **Bloqueio da conta WhatsApp**: Depende do tipo de uso; o motor não previne banimentos por conteúdo.
- **Uso indevido como disparador em massa**: Pode ser atenuado através do rate limiter nas rotas Express (`SEND_RATE_LIMIT_MAX_REQUESTS`).
- **Falha de webhook**: Se a APIH cair e der timeout, o webhook falha e loga, não há política de reenvios massivos hoje (fire-and-forget).
- **Duplicidade**: O motor envia `event_id` único para mitigar processamento duplo na APIH.
- **Ausência de monitoramento**: Falta integração de APM profunda, depende dos logs gerados.

## 12. Pendências conhecidas
- Definir estritamente se o painel interno de "Campanhas" será depreciado, pois conflita com a finalidade de "API de comunicação neutra".