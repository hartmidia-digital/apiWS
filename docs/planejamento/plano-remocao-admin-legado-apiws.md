# Plano de Remoção do Admin Legado

Este documento estabelece as fases e procedimentos seguros para a futura remoção do painel `/admin` legado do projeto ApiWS.

A execução deste plano garante que o motor técnico não sofrerá quebras de autenticação, roteamento ou perda de operabilidade durante a transição final para o Console Operacional (`/ops`).

---

## Fase 1 — Validação real do `/ops` em deploy
Antes de qualquer remoção do legado, as seguintes operações do novo console devem estar validadas e em pleno uso no ambiente de produção:
- [ ] Login (atual via `/admin/login.html` com redirecionamento correto para `/ops`).
- [ ] Criação de sessão.
- [ ] Geração do QR Code.
- [ ] Conexão e sincronização inicial.
- [ ] Transmissão de logs em tempo real (`live-logs.html`).
- [ ] Persistência de logs no `engine_logs`.
- [ ] Painel Health sem falhas de permissão de pasta.
- [ ] Painel Integration com sucesso no envio de webhooks ao APIH (`webhook.test`).
- [ ] Comandos de *Disconnect* e *Reset-Auth*.
- [ ] Delete de Sessões.
- [ ] Reconexão automática após reboot do motor.

## Fase 2 — Separar autenticação do `/admin`
A principal dependência estrutural do `/admin` é o fluxo de autenticação via sessão.

- **Migrar Front-end**: Mover e adaptar o `login.html` (e dependências de CSS/JS associadas a ele) de `/admin/login.html` para um caminho independente (ex: `/ops/login.html` ou `/auth/login.html`).
- **Migrar Back-end**: Alterar os caminhos nos redirecionamentos em `src/routes/auth.js` e em middlewares que utilizam `res.redirect('/admin/login.html')`.
- **Manter Roles**: Assegurar que as lógicas de sessão `requireAuth` e `requireAdmin` continuem operantes sem o visual do antigo painel de usuários.

## Fase 3 — Desativar visualmente o `/admin`
Esta fase é uma verificação de dependência sem destruição dos arquivos.
- Desativar temporariamente o roteamento dos HTMLs legados no `index.js`. Em vez de servir o arquivo HTML, retornar uma mensagem simples: `Este painel foi substituído pelo Console Operacional /ops.`.
- Observar os logs em produção. Se a APIH ou outro sistema vital apresentar 404 por tentar acessar uma rota legada não identificada, é possível executar rollback imediato reativando a rota.

## Fase 4 — Remoção e Limpeza
Após comprovação de estabilidade:
- **Excluir arquivos estáticos legados**:
  - `/admin/dashboard.html`
  - `/admin/activities.html`
  - `/admin/campaigns.html`
  - `/admin/users.html`
  - Limpar `/admin/js/` de lógicas inativas.
- **Limpeza de Rotas**:
  - Remover rotas e funções de campanhas de envio em massa se não forem mais exigidas pelo Gateway (APIH).
- **Consolidação**: Manter no repositório apenas endpoints REST focados na operação do Baileys e webhooks.

## Fase 5 — Limpeza documental
- Atualizar este plano de remoção para `[Concluído]`.
- Remover as referências a `Transicional/Legado` da documentação atual.
- Registrar os eventos de deleção no `CHANGELOG.md`.

---

## Checklist de Rollback (Em caso de falhas na migração de Auth)
Se a separação da autenticação quebrar o acesso ao `/ops`:
1. Reverter o commit que mudou `src/routes/auth.js`.
2. Restaurar o arquivo `/admin/login.html`.
3. Validar se o middleware voltou a setar `req.session.adminAuthed = true` e liberar o painel Ops.
4. Reiniciar a aplicação (`pm2 restart` ou equivalente via cPanel Node.js App).
