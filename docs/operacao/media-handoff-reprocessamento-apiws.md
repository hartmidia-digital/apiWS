# Reprocessamento e Retry do Media Handoff (ApiWS)

As rotinas e ferramentas abaixo existem para resolver pendências em entregas de arquivos do Media Handoff que encontram erros.

## Retentativa de Falhas (Retry Failed)
Recoloca as tarefas do \`media_handoff\` (status \`failed\`) de volta ao fluxo de download, podendo colocar para \`queued\` se o arquivo estiver ausente ou recuperar para \`ready_for_apih\` caso o arquivo temporário persista.

\`\`\`bash
npm run media-handoff:retry-failed
\`\`\`

*(Nota: Pode-se validar os registros através de dry-run via script Node: \`node scripts/media-handoff-retry-failed.js --dry-run\`)*

## Redispatch para APIH
Caso o status seja \`ready_for_apih\` porém o webhook anterior falhou ou não alcançou a plataforma APIH (timeout ou afins). O comando abaixo re-emite uma requisição de evento de atualização de mídia.

\`\`\`bash
npm run media-handoff:redispatch
\`\`\`
- Importante: Este comando **não utiliza query string** e sim insere o \`authorization_header\` via Header (Bearer) para garantir a segurança no payload original, gerando novas \`download_token_hash\`.
