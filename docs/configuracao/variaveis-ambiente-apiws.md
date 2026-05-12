# Variáveis de Ambiente e Configuração (.env)

O ApiWS depende de variáveis de ambiente obrigatórias e opcionais para sua inicialização. Em produção (cPanel), elas devem ser definidas no Setup Node.js App e não em um arquivo de texto para maior segurança.

Abaixo, a documentação de todas as variáveis atuantes no código real (`main`).

## 1. Variáveis de Identidade e Operação (Core)

| Variável | Obrigatoriedade | Exemplo Seguro | Descrição e Risco se Ausente | Onde é Usada |
|---|---|---|---|---|
| `APIWS_ENGINE_ID` | **Obrigatória** (em prod) | `apiws.hartmidia.com` | Identificador único do motor perante a APIH. Se ausente e `NODE_ENV=production`, força saída com erro. | `index.js`, `webhookHaxis.js`, `.env.example` |
| `APIWS_PUBLIC_URL` | Opcional (Recomendada)| `https://apiws.hartmidia.com` | URL base. Usada pela APIH para montar retornos. Se ausente, gera Warning no log. | `index.js`, Painel `Ops` (`/integration`) |
| `MAX_SESSIONS` | Opcional | `5` | Limite de sessões simultâneas permitidas. Se inválido ou nulo, o fallback seguro é 5. Protege o motor contra Out-Of-Memory. | `src/routes/ops.js`, `index.js` |
| `PORT` | Opcional | `3000` | Porta onde o Express e WebSocket operam. | `index.js`, `nodemon.json` |
| `NODE_ENV` | Opcional | `production` | Define o comportamento do Express, logging (cPanel) e regras de startup do `APIWS_ENGINE_ID`. | Global, `index.js` |

## 2. Variáveis de Webhook e Comunicação HAXIS

| Variável | Obrigatoriedade | Exemplo Seguro | Descrição e Risco se Ausente | Onde é Usada |
|---|---|---|---|---|
| `WEBHOOK_URL` | Obrigatória | `https://api.hartmidia.com/webhook` | URL destino para onde o ApiWS dispara webhooks (`message.received`, `session.status`, etc.). | `src/utils/webhookHaxis.js`, `/ops/integration` |
| `WEBHOOK_SECRET` | Opcional (Recomendada)| `(UUID ou Hex Gerado)` | Segredo usado para assinar via HMAC-SHA256 (`X-Haxis-Signature`). Se vazia, os eventos fluem sem assinatura, permitindo fraudes por terceiros. | `webhookHaxis.js`, `/ops/webhooks/test` |
| `WEBHOOK_TIMEOUT_MS`| Opcional | `5000` | Timeout do disparo Axios. Previne gargalos se o Gateway HAXIS cair. | `webhookHaxis.js` |
| `APIH_MEDIA_UPLOAD_URL` | Opcional | `(URL de Upload)` | URL de roteamento futuro (caso a APIH processe media). | *(Não ativamente implementada nas rotas base, mas prevista)* |
| `APIH_MEDIA_UPLOAD_TIMEOUT_MS`| Opcional | `15000` | Timeout de upload de mídia. | *(Prevista)* |

## 3. Variáveis de Segurança e Acesso

| Variável | Obrigatoriedade | Exemplo Seguro | Descrição e Risco se Ausente | Onde é Usada |
|---|---|---|---|---|
| `MASTER_API_KEY` | **Obrigatória** | `123-senha-forte-uuid` | Protege as rotas sensíveis (`/api/v1/sessions`). Sem ela, a API interna estaria pública. | Middlewares `requireAuth` |
| `ADMIN_DASHBOARD_PASSWORD`| **Obrigatória** | `(Senha Segura)` | Senha humana para acessar o `/admin/login` e, consequentemente, o Console `/ops`. | `User.ensureAdmin()`, `index.js` |
| `TOKEN_ENCRYPTION_KEY` | **Obrigatória** | `(Chave AES-256 de 32 bytes)` | Usada para criptografar tokens seriais gravados no SQLite/arquivos. Se exposta, tokens podem ser vazados. | Utilitários de criptografia nativos |
| `SESSION_SECRET` | **Obrigatória** | `(Hex Longo)` | Usada pelo Express Session para assinar o cookie do admin. Se alterada, destrói todos os logins ativos. | `index.js` (Express `session()`) |
| `COOKIE_SECURE` | Opcional | `true` | Define se o cookie só deve trafegar em HTTPS. Recomendado `true` em produção. | `index.js` |

## 4. Variáveis de Infraestrutura e Diretórios

| Variável | Obrigatoriedade | Exemplo Seguro | Descrição e Risco se Ausente | Onde é Usada |
|---|---|---|---|---|
| `DATA_PATH` | Opcional | `/home/user/apiws-data` | Caminho absoluto de onde o ApiWS salvará bancos, sessões Baileys e logs. Proteção contra o `public_html`. | `src/config/paths.js` |
| `LOG_LEVEL` | Opcional | `info` | Define o quão verboso o terminal será (`debug`, `info`, `warn`, `error`). | `engineLogger.js` |

*(Atenção: Nenhuma chave secreta em documentação, prints ou repositório deve conter valores reais.)*
