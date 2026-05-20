# Operação e Comandos do History Sync (ApiWS)

Este guia prático fornece os comandos disponíveis para monitoramento e controle dos fluxos do histórico.

## Status e Health
Verifique o estado geral das sincronizações de histórico usando o script npm.

\`\`\`bash
npm run history-sync:health
\`\`\`
Retorna a quantidade de batches, o status da fila de itens e eventuais alertas se algum item ficar travado no estado \`processing\`.

## Tratamento de Falhas (Retry)
Caso ocorram erros pontuais e os \`items\` fiquem presos no banco com \`status = 'failed'\`, você pode reenfileirá-los com:

\`\`\`bash
npm run history-sync:retry-failed
\`\`\`
*(Nota: Para testar a quantidade sem alterar o banco, adicione a opção \`--dry-run\` no final do comando direto via node: \`node scripts/history-sync-retry-failed.js --dry-run\`)*

## Processamento Avulso (Process Once)
Para disparar apenas um único ciclo do Worker (útil para testes em homologação):
\`\`\`bash
npm run history-sync:process-once
\`\`\`

## Limpeza da Fila (Cleanup)
Batches que já foram completados e items enviados (ou skipados) ainda ocupam espaço na base local. A base mantém dados por \`HISTORY_SYNC_RETENTION_DAYS\` dias (padrão: 7). Você pode usar o script:

\`\`\`bash
npm run history-sync:cleanup
\`\`\`
Isso vai expurgar logs passados sem interferir com items pendentes ou processando.
