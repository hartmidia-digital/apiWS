# Operação de Sessões WhatsApp — ApiWS

## Como verificar se a instância está conectada
1. Acesse o endpoint `GET /api/v1/sessions`.
2. Se estiver utilizando o Dashboard Técnico (`/admin/dashboard.html`), verifique se o status do dispositivo está listado como `CONNECTED`.

## Como identificar desconexão
1. O motor enviará um webhook de evento `session.status` com payload de `status` alterado para `DISCONNECTED` e a razão na propriedade `detail`.
2. No Dashboard Técnico, o alerta visual da sessão mudará e os logs do terminal emitirão `Disconnected: [statusCode] - [reason]`.

## Como gerar novo QR Code
1. No Dashboard Técnico, existe um botão de conexão ("Connect" / "Get QR") na sessão.
2. Via API (autenticada com admin cookie ou token válido), dispare `GET /api/v1/sessions/:sessionId/qr`. O novo evento de status será emitido com o QR gerado na resposta.

## Como reiniciar a aplicação sem perder sessão
1. O processo de restart de Node em produção (via botão do cPanel Node.js App ou tocando no `tmp/restart.txt`) irá fechar graciosamente o WebSocket (evento `SIGINT`).
2. Como a sessão inteira do Baileys fica salva em disco (`AUTH_INFO_PATH`), no próximo "Start" o ApiWS lerá o disco e reestabelecerá os sockets, pulando o estágio de leitura de QR code.
3. Não apague nenhuma pasta para um restart comum.

## O que não apagar
- **Pasta:** `/home/usebws/apiws-data/auth_info_baileys` (Onde residem os segredos de chave do dispositivo).
- **Pasta:** `/home/usebws/apiws-data/database` (Os metadados das sessões e o status de tokens).

## Onde olhar logs
- Em `/home/usebws/apiws-data/logs` há rotação diária de logs do Pino/Winston.
- Via SSH cPanel, se rodado `npm run dev` local, a saída padrão no console.
- A página do Dashboard `/admin/dashboard.html` possui uma aba de logs transmitidos ao vivo (via WebSocket do painel).

## Como agir em caso de falha de conexão persistente
1. Verifique se o aparelho celular tem bateria e conectividade com a internet.
2. Certifique-se de que a sessão não foi "Desconectada" ativamente de dentro do próprio aplicativo WhatsApp no celular. Se sim, ocorrerá a exclusão automática dos tokens e será necessário escanear outro QR.
3. Se estiver "preso", limpe a sessão (`DELETE /api/v1/sessions/:sessionId`), crie-a novamente e gere o QR.

## Como agir em caso de troca de número
1. Delete a sessão antiga pelo painel técnico (isso purgará o `auth_info_baileys`).
2. Crie uma nova sessão e escaneie o QR com o novo aparelho.
3. Atualize o HAXIS, se houver um vínculo duro entre a identificação do número e o fluxo interno do ERP.

## Como agir em caso de bloqueio ou risco de banimento
1. Suspenda imediatamente a geração de tráfego a partir da HAXIS (Pausar campanhas/envios de notificação em massa).
2. O ApiWS não consegue recuperar números banidos pelo Meta. Caso seja desbanido via suporte Meta, a sessão anterior provavelmente terá sido invalidada (status de Logout `401`). Necessitará uma limpeza (`DELETE`) e re-vinculação (novo QR).

## Limites operacionais recomendados para evitar comportamento de spam
- O ApiWS possui variáveis `SEND_RATE_LIMIT_MAX_REQUESTS` e `SEND_RATE_LIMIT_WINDOW_MS` para limitar os calls da API externa. Recomenda-se configurá-lo.
- Cadências e throttling inteligente (delays aleatórios) devem ser geridos exclusivamente pela API Limpa (APIH) / HAXIS, entregando as mensagens ao ApiWS em um fluxo natural e humano.

## Checklist de recuperação
- O aplicativo NodeJS está `Running` no painel.
- O endpoint `/api/v1/sessions` responde com status correto.
- Não existem erros de permissão de escrita em `apiws-data`.