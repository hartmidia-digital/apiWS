# Índice da Documentação — ApiWS

## Visão Geral
Bem-vindo à documentação oficial da Instância ApiWS (WhatsApp Engine baseada em Baileys para o HAXIS). Esta pasta serve como a única fonte da verdade operacional, técnica e de deploy da camada técnica do WhatsApp.

Aqui documentamos tudo sobre a aplicação cujo papel é conectar, persistir e gerenciar números de WhatsApp via WebSockets, atuando como motor cego (dumb engine) para enviar webhooks limpos e normalizados à APIH.

## Ordem Recomendada de Leitura

1. **[Padrões de Documentação](padroes-documentacao-apiws.md)**
   *(Para entender como adicionar ou alterar guias desta pasta e manter o controle de qualidade)*
2. **[Visão Geral Arquitetural](arquitetura/visao-geral-apiws-whatsapp.md)**
   *(Para entender como o ApiWS se isola do resto do HAXIS e de onde vem e para onde vão os dados)*
3. **[Instância WhatsApp](instancia/instancia-apiws-whatsapp.md)**
   *(A fonte da verdade técnica da aplicação. Endpoints, stack real e domínios)*
4. **[Operação de Sessão](operacao/operacao-sessoes-whatsapp-apiws.md)**
   *(O guia prático e rápido para sysadmins ou CS resolverem falhas de QR Code, quedas de servidor e reinício de sessões)*
5. **[Segurança](seguranca/seguranca-apiws.md)**
   *(O que você nunca deve fazer com chaves em ambiente de produção, e como a instância está segura)*
6. **[Webhooks ApiWS → APIH](webhooks/webhooks-apiws-para-apih.md)**
   *(Explicação do fluxo reativo e fire-and-forget dos dados que entram via chat para alimentar o cérebro da HAXIS)*
7. **[Deploy Produção](deploy/deploy-producao-apiws.md)**
   *(Como empurrar este código da branch Main para rodar no cPanel real via git push)*

---

## Lista de Documentos Oficiais por Categoria

### Auditorias
- `[Em Auditoria]` [Relatório de Consistência entre Documentação e Código](auditorias/relatorio-consistencia-documentacao-codigo-apiws.md)
  *Uma análise técnica que atesta se o código faz o que a documentação diz (Sincronizado).*

### Arquitetura
- `[Oficial]` [Visão Geral Arquitetural ApiWS ↔ WhatsApp](arquitetura/visao-geral-apiws-whatsapp.md)

### Instância
- `[Oficial]` [Instância ApiWS — WhatsApp](instancia/instancia-apiws-whatsapp.md)

### Operação
- `[Oficial]` [Operação de Sessões WhatsApp ApiWS](operacao/operacao-sessoes-whatsapp-apiws.md)

### Webhooks
- `[Oficial]` [Webhooks ApiWS para APIH](webhooks/webhooks-apiws-para-apih.md)

### Deploy
- `[Oficial]` [Deploy de Produção ApiWS](deploy/deploy-producao-apiws.md)
- `[Histórico]` [Checklist de Production (Legado)](deploy/checklist-production-apiws.md)
- `[Histórico]` [Deployment Genérico Base (Legado)](deploy/deployment-legacy-apiws.md)

### Segurança
- `[Oficial]` [Segurança ApiWS](seguranca/seguranca-apiws.md)

### Testes
- *(Vazio)* `[Pendente de Atualização]` Documentação específica de execução local E2E será adicionada conforme scripts no Jest sejam aprofundados.

### Sprints e Decisões Técnicas
- `[Futuro]` [Sprint de Estabilização Operacional ApiWS](sprints/sprint-estabilizacao-operacional-apiws.md)