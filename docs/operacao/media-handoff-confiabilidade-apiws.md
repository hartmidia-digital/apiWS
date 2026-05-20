# Confiabilidade do Media Handoff (ApiWS)

O Media Handoff do ApiWS atua como ponte para entrega de mídias baixadas. A sua arquitetura garante retenção, disponibilidade em endpoints locais e exclusão temporária segura (\`MEDIA_HANDOFF_TEMP_ROOT\`).

## Status e Observabilidade
O uso da pasta de arquivos temporários é uma métrica que precisa ser supervisionada para evitar o esgotamento do disco. Você pode rodar um relatório:

\`\`\`bash
npm run media-handoff:health
\`\`\`

Este comando revela os contadores globais agrupados por status (detected, queued, downloading, ready_for_apih, etc.), relata erros recentes e indica também o uso estimado em MB na pasta temporária.

## Configuração Mais Conservadora
Por padrão, nós adotamos tempos de permanência estendidos de 72 horas para a retenção do motor (antes 24h) e o TTL do Link subiu para 48 horas (antes 2h), assegurando margem maior caso o servidor secundário APIH demore a processar o link.

\`\`\`env
MEDIA_HANDOFF_URL_TTL_MINUTES=2880
MEDIA_HANDOFF_RETENTION_HOURS=72
\`\`\`
Essas medidas dão um respiro maior para a base e reduzem as falhas operacionais devido a eventuais perdas e indisponibilidade do webhook no ecossistema central.
