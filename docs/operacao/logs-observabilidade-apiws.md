# Logs e Observabilidade

O ApiWS possui um sistema rigoroso de observabilidade desenhado para garantir transparência nas operações do motor WhatsApp, sem violar regras de privacidade ou sobrecarregar o I/O do servidor.

## 1. O Componente `engineLogger`
Centralizado em `src/utils/engineLogger.js`, o logger é a ponte entre as rotinas do sistema e a camada de observabilidade do Console Operacional.

- **Níveis de Log:** `INFO`, `WARN`, `ERROR`.
- **Categorias Base:** `system`, `session`, `webhook`, `security`.
- **Transmissão Bidirecional:** Todo log disparado pelo `engineLogger` sofre duas ações quase simultâneas:
  1. Inserção na tabela `engine_logs` (SQLite).
  2. Broadcast via WebSocket (`/ops/ws`) para visualização na tela de "Live Logs".

## 2. Diferença entre `activity_logs` e `engine_logs`
- **`activity_logs` (Legado):** É uma tabela antiga, amarrada às ações do Dashboard `/admin` (ex: usuário clicou para criar uma campanha). Não reflete o motor em si.
- **`engine_logs` (Oficial Atual):** Reflete a execução assíncrona do motor (ex: timeout de webhook, erro de descriptografia do Baileys, falha de limite de memória, conexões encerradas pelo aparelho).

## 3. Sanitização e Mascaramento de Dados
Uma das regras críticas do HAXIS é a isolação e privacidade dos dados de contato. O ApiWS adota as seguintes abordagens no `engineLogger`:

- **JIDs e Telefones:** Números presentes nas strings de sessão (ex: `5511999999999@s.whatsapp.net`) são anonimizados nos logs de tela e banco.
- **Payload Completo:** O conteúdo de mensagens enviadas ou recebidas (`messageContent`), bem como blobs de mídia não passam pelo `engineLogger`. O motor os roteia diretamente para o disparo via Webhook sem "printar" ou salvar seu conteúdo.
- **QR Codes:** Geração de QR Code é um evento notificado, mas a string Base64 **não** compõe a persistência do log, existindo efemeramente no transporte WebSocket.

## 4. Retenção e Risco de Crescimento
A persistência do SQLite é otimizada (`journal_mode=WAL`), mas o crescimento contínuo de logs de motor sem limpeza gera riscos a longo prazo.
- **Risco:** O crescimento do arquivo `whatsapp.db` pode alcançar gigabytes, degradando a performance de leitura do Live Logs.
- **Ação Futura Necessária:** Implementar uma rotina agendada (Cron ou temporizador na inicialização) para excluir linhas em `engine_logs` onde `created_at` seja maior que `X` dias (recomendado: 15 ou 30 dias).

## 5. Console de Logs do Node (Terminal)
Eventos não capturados pelo `engineLogger` (como crashes nativos do Node.js por falta de RAM, erros de permissões do cPanel via Passenger) não estarão na interface web, e sim nos logs físicos providos pelo cPanel App ou stdout (ex: arquivos de log em `DATA_PATH/logs` ou no painel).
