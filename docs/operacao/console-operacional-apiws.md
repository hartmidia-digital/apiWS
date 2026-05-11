# Console Operacional ApiWS

## Objetivo
O Console Operacional (`/ops`) foi criado com o propósito de oferecer uma visão estritamente técnica sobre o motor do ApiWS. Ele substitui a necessidade de utilizar o painel antigo (`/admin`) para fins técnicos.

## Diferença entre `/admin` (Antigo) e `/ops` (Novo)
- **`/admin`:** Continha lógicas mistas entre gestão de conexões e envio de campanhas, contatos e listas. Era focado em operação comercial/disparos em massa.
- **`/ops`:** Focado inteiramente na observabilidade, saúde das sessões WhatsApp, logs em tempo real e estabilidade da comunicação com o ecossistema HAXIS (via APIH). Não contém módulos de disparo em massa ou contatos.

## O que o ApiWS deve fazer (Escopo Operacional)
- Conectar e manter sessões do WhatsApp através do Baileys.
- Receber os eventos brutos de Socket.
- Higienizar (sanitizar) esses eventos.
- Repassá-los ao APIH de forma segura.
- Oferecer observabilidade técnica e registro de logs da sua própria operação.

## O que o ApiWS NÃO deve fazer
- O ApiWS não é um CRM.
- Não deve gerenciar listas de contatos ou agendamentos.
- Não deve enviar mensagens em massa através de campanhas próprias.

## Acesso e Segurança
O painel está acessível pela rota `/ops`. O acesso exige:
1. Autenticação prévia via fluxo atual em `/admin/login.html`.
2. O usuário logado **deve** possuir a role `admin`. Caso contrário, será barrado do painel.

## Funcionalidades
1. **Visão Geral:** Métricas de hardware, status do processo Node e contagem de sessões.
2. **Sessões WhatsApp (`/ops/sessions.html`):** Criação, Deleção, Geração de QR Code e Reset de Autenticação (purga da pasta `auth_info_baileys`).
3. **Logs ao Vivo (`/ops/live-logs.html`):** Terminal com websocket transmitindo os logs sanitizados do motor em tempo real.
4. **Histórico de Eventos (`/ops/events.html`):** Tabela consultável em SQLite dos últimos eventos.
5. **Saúde (`/ops/health.html`):** Status de Permissões e integridade de variáveis `.env` críticas (Nunca exibe `MASTER_API_KEY` ou `SESSION_SECRET`).
6. **Integração (`/ops/integration.html`):** Permite disparar um webhook neutro (`webhook.test`) contra o APIH para avaliar o tempo de resposta e integridade da conexão.

## Regras de Logs e Privacidade
Por segurança e performance:
- Nenhum QR Code é persistido em logs de disco ou banco. O QR transita em memória apenas durante o pareamento, via WebSocket de forma efêmera.
- Nenhum conteúdo inteiro de mensagem (`messageContent`) ou mídia trafegada deve ser salvo nos logs operacionais. Eles são repassados ao webhook e ignorados.
- Números de telefone (JIDs) são mascarados.
- Endereços de Email e Tokens visíveis sofrem supressão por regex de segurança nos painéis.
