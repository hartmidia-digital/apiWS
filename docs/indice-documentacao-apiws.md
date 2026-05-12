# Índice da Documentação — ApiWS

## Visão Geral
Bem-vindo à documentação oficial da Instância ApiWS (WhatsApp Engine baseada em Baileys para o HAXIS). Esta pasta serve como a principal referência documental para operação, parte técnica e deploy da camada técnica do WhatsApp.

**A documentação oficial está organizada em `/docs` e deve refletir fielmente o código da branch main. O código da branch main é a fonte definitiva da verdade técnica.**

Aqui documentamos tudo sobre a aplicação cujo papel é conectar, persistir e gerenciar números de WhatsApp via WebSockets, atuando como motor cego (dumb engine) para enviar webhooks limpos e normalizados à APIH.

## Status dos Documentos
Os documentos nesta base utilizam tags de status para indicar sua relevância atual:
- `[Oficial]`: Documentação atual e alinhada com o código de produção.
- `[Transicional]`: Refere-se a sistemas ou fluxos que estão ativos mas programados para serem migrados ou atualizados em breve.
- `[Legado]`: Refere-se a funcionalidades ou painéis obsoletos (como o `/admin`) que ainda existem mas não recebem manutenção e serão removidos no futuro.
- `[Histórico]`: Documentos antigos mantidos por razões de histórico.
- `[Auditoria]`: Relatórios de verificações de consistência entre código e documentação.

## Ordem Recomendada de Leitura

1. **[Padrões de Documentação](padroes-documentacao-apiws.md)**
   *(Para entender como adicionar ou alterar guias desta pasta e manter o controle de qualidade)*
2. **[Visão Geral Arquitetural](arquitetura/visao-geral-apiws-whatsapp.md)**
   *(Para entender como o ApiWS se isola do resto do HAXIS e de onde vem e para onde vão os dados)*
3. **[Instância WhatsApp](instancia/instancia-apiws-whatsapp.md)**
   *(Endpoints, stack real e domínios)*
4. **[Console Operacional](operacao/console-operacional-apiws.md)**
   *(Interface oficial atual para observabilidade e controle técnico)*
5. **[Segurança](seguranca/seguranca-apiws.md)**
   *(Proteção em produção e limites)*
6. **[Webhooks ApiWS → APIH](webhooks/webhooks-apiws-para-apih.md)**
   *(Fluxo reativo de dados para o cérebro da HAXIS)*
7. **[Deploy Produção](deploy/deploy-producao-apiws.md)**
   *(Como empurrar este código da branch Main para rodar no cPanel)*

---

## Lista de Documentos por Categoria

### API e Código
- `[Oficial]` [Rotas e Endpoints ApiWS](api/rotas-apiws.md)
- `[Oficial]` [WebSocket e Transmissão de Eventos](api/websocket-apiws.md)

### Arquitetura
- `[Oficial]` [Visão Geral Arquitetural ApiWS ↔ WhatsApp](arquitetura/visao-geral-apiws-whatsapp.md)

### Configuração e Banco
- `[Oficial]` [Variáveis de Ambiente](configuracao/variaveis-ambiente-apiws.md)
- `[Oficial]` [Banco de Dados SQLite](banco/sqlite-apiws.md)

### Instância
- `[Oficial]` [Instância ApiWS — WhatsApp](instancia/instancia-apiws-whatsapp.md)

### Operação e Observabilidade
- `[Oficial]` [Console Operacional ApiWS](operacao/console-operacional-apiws.md)
- `[Oficial]` [Logs e Observabilidade Técnica](operacao/logs-observabilidade-apiws.md)
- `[Oficial]` [Operação de Sessões WhatsApp ApiWS](operacao/operacao-sessoes-whatsapp-apiws.md)

### Legado e Planejamento
- `[Transicional]` [Painel Admin Legado e Dependências](legado/painel-admin-legado.md)
- `[Planejamento]` [Plano de Remoção do Admin Legado](planejamento/plano-remocao-admin-legado-apiws.md)

### Webhooks
- `[Oficial]` [Webhooks ApiWS para APIH](webhooks/webhooks-apiws-para-apih.md)
- `[Oficial]` [Integração HAXIS APIH: Identidade Operacional e Engine ID](webhooks/integracao-apih-engine-id.md)

### Deploy
- `[Oficial]` [Deploy de Produção ApiWS](deploy/deploy-producao-apiws.md)
- `[Histórico]` [Checklist de Production (Legado)](deploy/checklist-production-apiws.md)
- `[Histórico]` [Deployment Genérico Base (Legado)](deploy/deployment-legacy-apiws.md)

### Segurança
- `[Oficial]` [Segurança ApiWS](seguranca/seguranca-apiws.md)

### Auditorias
- `[Auditoria]` [Relatório Refinado de Consistência (Pré-Remoção Admin)](auditorias/relatorio-refinado-consistencia-apiws.md)
- `[Auditoria]` [Matriz de Prontidão para Remoção do Admin](auditorias/matriz-prontidao-remocao-admin.md)
- `[Histórico]` [Relatório de Consistência entre Documentação e Código (Antigo)](auditorias/relatorio-consistencia-documentacao-codigo-apiws.md)

### Sprints e Decisões Técnicas
- `[Histórico]` [Sprint de Estabilização Operacional ApiWS](sprints/sprint-estabilizacao-operacional-apiws.md)
