# History Sync Controlado (ApiWS)

Este documento detalha o funcionamento da sincronização de histórico controlada na engine WhatsApp HAXIS.

## Arquitetura
A sincronização do histórico do Baileys é um processo pesado (muitos bytes de dados) que, se não for gerenciado, pode travar o serviço ou estourar a capacidade de webhook devido ao volume imenso e instantâneo de mensagens.
O ApiWS implementa uma abordagem "Controlada":
- Desligado por padrão (\`HISTORY_SYNC_ENABLED=false\`).
- Apenas mensagens notificadas em tempo real fluem naturalmente.
- Mensagens do tipo \`append\` são ignoradas, a menos que explicitamente configuradas para salvar.
- Eventos da carga de \`messaging-history.set\` são interceptados, convertidos em 'batches', armazenados no banco SQLite local, divididos e distribuídos por meio de uma fila cadenciada.

## Funcionalidades Chave
1. **Deduplicação**: Baseada em \`source_event_key\` gerada de maneira determinística, minimizando a re-emissão da mesma mensagem antiga em caso de reinício de socket.
2. **Metadata-only para Mídia**: Mensagens históricas não provocam downloads pesados no motor. Eles repassam metadados como tamanho e tipo.
3. **Queue Controlada**: A liberação de webhook para as mensagens ocorre no seu próprio ritmo, que pode ser ajustado na variável de ambiente.

## Como habilitar em produção (Homologação)
1. Certifique-se de que o webhook do ecossistema suporta os eventos \`message.history_sync\` (a partir de HAXIS APIH #21).
2. Configure o \`.env\` do motor.

\`\`\`env
HISTORY_SYNC_ENABLED=true
HISTORY_SYNC_DISPATCH_PER_MINUTE=60
HISTORY_SYNC_PROCESS_INTERVAL_MS=5000
\`\`\`

Não se esqueça de reiniciar o pm2 para recarregar as novas flags do \`.env\`.
