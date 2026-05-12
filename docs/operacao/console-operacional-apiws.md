# Console Operacional ApiWS

## Objetivo
O Console Operacional (`/ops`) é a interface recomendada e oficial para a operação técnica do motor ApiWS. Ele oferece uma visão estritamente técnica sobre conexões, limites e fluxos, atuando como o painel central definitivo.

## Status do Console (`/ops`) vs Painel Legado (`/admin`)
- **`/ops` (Operacional Oficial):** Focado inteiramente na observabilidade, saúde das sessões WhatsApp, logs em tempo real e estabilidade da comunicação com o ecossistema HAXIS (via APIH). Não contém módulos de disparo em massa ou contatos.
- **`/admin` (Legado/Transicional):** Contém lógicas mistas entre gestão de conexões e campanhas/contatos, focado em uma operação que foge do escopo de um "dumb engine". Este painel permanece ativo temporariamente (transicional) mas não recebe manutenções, com sua remoção planejada para o futuro. O `/ops` não o "removeu" ainda, mas atua como seu substituto operacional.

## O que o ApiWS deve fazer (Escopo Operacional)
- Conectar e manter sessões do WhatsApp através do Baileys.
- Receber os eventos brutos de Socket.
- Higienizar (sanitizar) esses eventos.
- Repassá-los ao APIH de forma segura via Webhooks (`fire-and-forget`).
- Oferecer observabilidade técnica e registro de logs da sua própria operação.

## O que o ApiWS NÃO deve fazer
- O ApiWS não é um CRM.
- Não deve gerenciar listas de contatos ou agendamentos.
- Não deve enviar mensagens em massa através de campanhas próprias.
(Estas responsabilidades são do APIH/HAXIS).

## Acesso e Segurança
O painel está acessível pela rota `/ops`. O acesso exige:
1. Autenticação prévia. O fluxo atual utiliza a rota transicional `/admin/login.html` (que configura `req.session.adminAuthed`).
2. Validação de Middleware (`requireAuth` e `requireAdmin`). O usuário logado **deve** possuir a role `admin`. Caso contrário, será barrado do painel.

## Funcionalidades e Telas (`/ops/`)
O front-end do Console interage primariamente com as rotas REST em `/api/v1/ops`:
1. **Visão Geral (`/ops/` ou dashboard):** Métricas de hardware, status do processo Node, diretórios críticos e contagem de sessões.
2. **Sessões WhatsApp (`/ops/sessions.html`):** Criação, Deleção (delete), Reconexão (restart), Disconnect, Geração de QR Code efêmero via socket, e Reset de Autenticação (purga da pasta `auth_info_baileys`).
3. **Logs ao Vivo (`/ops/live-logs.html`):** Terminal conectado via WebSocket em `/ops/ws` transmitindo os logs sanitizados (via `engineLogger`) do motor em tempo real.
4. **Histórico de Eventos (`/ops/events.html`):** Tabela consultável extraindo dados diretamente da tabela SQLite `engine_logs`.
5. **Saúde (`/ops/health.html`):** Status de permissões de caminhos seguros e integridade de variáveis `.env` críticas.
6. **Integração (`/ops/integration.html`):** Monitoramento do fluxo de envio ao Gateway e disparo de um webhook neutro de teste (`webhook.test`).

## Regras de Logs e Privacidade
Por segurança e performance:
- Nenhum QR Code é persistido em logs de disco ou na tabela `engine_logs`. O QR transita em memória e é enviado apenas durante o pareamento, via WebSocket de forma efêmera (`qr.generated`).
- Nenhum conteúdo inteiro de mensagem (`messageContent`) ou mídia trafegada deve ser salvo nos logs operacionais. Eles são repassados ao webhook e descartados da memória/banco do motor.
- Números de telefone (JIDs) são mascarados antes de chegarem à tela de logs.
- Endereços de e-mail e tokens visíveis sofrem supressão por regex de segurança.
