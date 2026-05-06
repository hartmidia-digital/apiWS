# Segurança — ApiWS

## 1. Endpoints Sensíveis e Autenticação
Quase todas as operações no motor são restritas e expostas sob rotas da API versão 1 (`/api/v1/`).

- **Criação de Sessão** (`POST /api/v1/sessions`): Protegida exclusivamente pela chave mestra (`MASTER_API_KEY`) passada através do header `X-Master-Key`, ou pela sessão via cookie logado no Dashboard de Admin.
- **Operação de Mensagens e Mídia**: Protegidas por **Bearer Tokens**. Quando uma sessão é criada, ela gera um token no formato JWT/Hex. Esse token deve estar no cabeçalho de todas as requisições que operam em nome daquela sessão (`Authorization: Bearer <token>`).
- **Dashboard Técnico**: A interface web em `/admin` e gerida através de sessão de cookie firmada com login. A senha exigida no login equivale a variável de ambiente `ADMIN_DASHBOARD_PASSWORD`.

## 2. Risco de Exposição de QR Code
Um QR Code de WhatsApp exposto na web pode permitir que um invasor tome controle do número celular como se fosse um dispositivo oficial vinculado (WhatsApp Web).
- O QR Code só é fornecido se a requisição provir de uma API logada via Master Key, Bearer ou via socket logado no dashboard técnico (onde o administrador tem a visão do QR Code).
- Nunca expor o endpoint de QR Code sem middleware de autenticação.

## 3. Risco de Envio de Mensagens por Endpoint Público
As rotas como `/legacy/send-message` e `/api/v1/messages` têm um rate limiter mais agressivo. Um vazamento do token Bearer permitiria um envio não autorizado.
- É mandatório manter o token JWT isolado do lado cliente (frontend). Ele deve apenas ser custodiado pelo HAXIS/APIH, que assinará e baterá no ApiWS pelo backend (server-to-server).

## 4. Risco de Vazamento de Sessão e Tokens em Disco
- O ApiWS salva tokens num arquivo serializado/encriptado em disco para persistência entre reboots (no `database/whatsapp.db` ou `.enc`). Para isso, usa encriptação simétrica via `AES-256-CBC`.
- Essa encriptação requer a `TOKEN_ENCRYPTION_KEY` definida no `.env`.
- As subpastas de sessão do `@whiskeysockets/baileys` (`auth_info_baileys`) devem sempre ficar **fora do public_html** e serem bloqueadas por regras de webserver (ex. `.htaccess`).

## 5. Regras do .env
1. O `.env` nunca deve ser versão. Existe apenas `.env.example` no git.
2. Em produção via cPanel (setup preferido do HAXIS), as variáveis de ambiente não são postas via arquivo `.env`, mas sim cadastradas pela **Interface Gráfica do "Setup Node.js App"**. Isso evita leitura local se um LFI (Local File Inclusion) acontecer no docroot.

## 6. Regras para Logs
O logger base (`Pino`) guarda dumps e logs.
- Nenhum webhook payload inteiro deve conter dump do *Auth State* (Keys, AES, Mac).
- Se for preciso realizar logs de debug das chaves para trouble shooting, remova assim que resolvido.

## 7. Versionamento
1. Nunca suba o diretório de dados para o GIT (`node_modules/`, `logs/`, `auth_info_baileys/`, `database/`, etc). Eles devem constar rigorosamente no `.gitignore`.
2. Caso por engano um folder de credencial vá para um commit público do GitHub, a chave mestra das credenciais precisará ser girada (logoff do dispositivo no aparelho) na mesma hora.

## 8. Disparador em Massa (Spam) e Rate Limiting
- Use os mecanismos `SEND_RATE_LIMIT_MAX_REQUESTS` e limites similares.
- O motor não possui validação de conteúdo. Enviar mil mensagens iguais por minuto acarretará um banimento do número feito diretamente pelas heurísticas nativas do WhatsApp/Meta, não pelo sistema. A moderação das filas (`Rate Limiting` comportamental) deve ocorrer na camada de **APIH/HAXIS**, e não no engine.

## 9. Recomendações Futuras (Backlog de Segurança)
- Implementar checagens de integridade contra injeções XSS nos dados vindos pelo Baileys antes do display no Dashboard.
- Revezamento automático (rotate) dos Segredos do JWT de sessões se ficarem obsoletos.
- Firewall restritivo no nível do WHM/cPanel apenas permitindo os IPs do APIH de acessar a porta/domínio do ApiWS.