# Próxima Sprint: Estabilização Operacional — ApiWS

## Objetivo da Sprint
Após a solidificação da documentação e arquitetura (a fonte da verdade sobre como o ApiWS atua sendo um gateway técnico), a próxima sprint deve focar na "Estabilização Operacional". O objetivo é mitigar pequenos pontos de dor operacionais e garantir total visibilidade da saúde da conexão com o WhatsApp.

## O que já existe
- Deploy validado no cPanel (`.cpanel.yml`, fora do `public_html`).
- Fluxo central (receber e enviar, webhook, Baileys update).
- Persistência e reboots tolerantes a falha (SQLite db + auth file config).
- Padrões de documentação e auditoria feitos.

## O que ficou pendente
- Limpeza sistemática e robusta de arquivos obsoletos (`media` expirada, `logs` rotacionados a ponto de entupimento de disco local da VPS/cPanel).
- Healthcheck real (A API precisa de um status limpo e sem autorização rígida ou com chave de monitoria para apontar se o Node está vivo e saudável - Uptime Kuma/Pingdom).
- Decisão sobre os scripts em `src/services/campaigns.js`. (Eles ferem a arquitetura de APIH gerenciar envios, eles deveriam ser migrados ou documentados para depreciação).

## Escopo Permitido
- Criação/adequação de scripts CRON ou de PM2 de auto-limpeza (Cleanups temporários).
- Inserção de uma rota limpa `GET /api/v1/health` retornando o estado do Node process (memória/cpu usage, sessions conectadas) sem vazar tokens.
- Otimização do timeout das requisições via webhook (Axios).
- Testes E2E leves em rotas de status.

## Escopo Proibido
- Adicionar ou implementar qualquer fluxo de IA ou Agentes. (Pertence à APIH ou HAXIS).
- Implementar canais extras (Facebook, Instagram). (O escopo é WhatsApp).
- Modificar o engine de core WhatsApp para Venom ou WPPConnect (A biblioteca se mantém `@whiskeysockets/baileys`).
- Refatoração gigante alterando o schema do banco que faria as instâncias ativas do cliente caírem.

## Checklist Esperado da Futura Sprint
- [ ] Rota `/api/v1/health` exposta, testada e adicionada no Postman Collection/Documentos se aplicável.
- [ ] Mecanismo/script limpo que possa ser invocado para purgar arquivos da subpasta `/media` velhos.
- [ ] Validar e registrar os mecanismos de tratamento se a APIH/Webhook Endpoint retornar falhas prolongadas (Ex: 500 interno da APIH não travar ou sobrecarregar memória do ApiWS).

## Testes Esperados
- Disparo de centenas de requisições mockadas contra `/api/v1/health` para validar se ele não cria memory leaks.
- Teste injetando payloads gigantescos de webhook forçados contra um servidor de teste.

## Riscos
- O motor já processa WebSockets intensamente. Colocar excesso de processamento num CRON do mesmo Node pode criar interrupções no evento assíncrono (lag na entrega do WhatsApp). Recomendado agendar rotinas de disco em horários mortos (3am).

## Status Atual
**Pendente/Planejado**