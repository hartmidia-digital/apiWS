# ApiWS Media Handoff

## 1. Objetivo
Implementar a camada de Media Handoff no ApiWS, permitindo que o ApiWS atue como ponte segura e temporária para entrega de mídias originais do WhatsApp ao APIH, sem converter, comprimir, transcrever, interpretar ou armazenar arquivos por longo prazo.

## 2. Responsabilidade do ApiWS
- Detectar mensagens com mídia.
- Criar registro local de handoff.
- Baixar/descriptografar a mídia original em worker separado.
- Salvar temporariamente em storage privado fora do repositório Git.
- Emitir evento leve para o APIH quando a mídia estiver pronta.
- Fornecer endpoint seguro para o APIH baixar o original.
- Receber confirmação do APIH após transferência.
- Apagar sua cópia local após confirmação ou expiração.

## 3. O que o ApiWS NÃO faz
- Converter imagem (para WebP).
- Converter áudio (para MP3).
- Comprimir vídeo.
- Transcrever áudio/vídeo.
- Fazer OCR em imagens/documentos.
- Resumir mensagens.
- Interpretar arquivo (payload parsing complexo).
- Salvar base64 no banco de dados.
- Guardar arquivo permanentemente.
- Entregar arquivo ao HAXIS diretamente.

## 4. Relação com APIH Media Pipeline
O ApiWS informa o APIH que uma mídia está disponível via webhook (`message.media_update`). O webhook contém a URL `source_url` apontando para o endpoint seguro do ApiWS. O APIH deve baixar o arquivo dessa URL passando o `download_token` fornecido no payload através do header de autenticação, processá-lo e então notificar o ApiWS para apagar a mídia usando o endpoint `confirm-transferred`.

## 5. Relação futura com HAXIS
O HAXIS consumirá a mídia final pré-processada pelo APIH, não interagindo diretamente com os endpoints de media handoff do ApiWS, mantendo a arquitetura limpa e focada.

## 6. Fluxo completo
1. **Mídia detectada:** ApiWS intercepta `messages.upsert` com anexo, registra na tabela `media_handoffs` com status `detected`. O processamento original não é bloqueado.
2. **Worker baixa:** Um `MediaHandoffWorker` assíncrono busca os `detected`, marca como `queued`/`downloading`, e baixa o arquivo do Baileys para o `MEDIA_HANDOFF_TEMP_ROOT`.
3. **Mídia Pronta:** Status muda para `ready_for_apih`. Um token seguro temporal é gerado e encodado com Hash SHA256 na DB local para validação sem riscos.
4. **Source_url emitida:** O webhook `message.media_update` é disparado contendo a `source_url` e o respectivo `download_token` isolado da URI para segurança em proxy logs.
5. **APIH baixa:** APIH acessa `GET /internal/media-handoff/:id/download`, enviando o token no header. ApiWS streama o arquivo.
6. **APIH confirma:** APIH avisa `POST /internal/media-handoff/:id/confirm-transferred`.
7. **ApiWS apaga:** ApiWS deleta o arquivo físico e marca o status como `transferred`.

## 7. Variáveis de ambiente
- `MEDIA_HANDOFF_ENABLED`: Ativa a feature (default `false`).
- `MEDIA_HANDOFF_TEMP_ROOT`: Path fora do Git para o storage.
- `MEDIA_HANDOFF_MAX_FILE_SIZE_MB`: Limite (ex: `2048`).
- `MEDIA_HANDOFF_URL_TTL_MINUTES`: Validade do token (ex: `120`).
- `MEDIA_HANDOFF_RETENTION_HOURS`: Tempo antes de expirar localmente (ex: `24`).
- `MEDIA_HANDOFF_DOWNLOAD_CONCURRENCY`: Limite de downloads simultâneos (ex: `1`).
- `MEDIA_HANDOFF_CLEANUP_DRY_RUN`: Simulação da limpeza (`false`).
- `MEDIA_HANDOFF_SECRET`: Chave obrigatória para autorizar requests nos endpoints `/internal`.
- `MEDIA_HANDOFF_PUBLIC_BASE_URL`: Base URL usada para a `source_url`.

## 8. Tabela media_handoffs
Controla metadados no SQLite, evitando armazenar arquivos binários ou base64 no banco.

## 9. Estados
- `detected`: Mídia interceptada.
- `queued`: Adicionado na fila do worker.
- `downloading`: Sendo baixado do Baileys.
- `ready_for_apih`: Disponível para download pelo APIH.
- `transferred`: APIH baixou e confirmou (arquivo local removido).
- `expired`: Tempo expirou antes de ser processado (arquivo removido pela limpeza).
- `deleted`: Arquivo removido localmente.
- `failed`: Erro durante download ou processamento.

## 10. Endpoints internos
- `GET /api/v1/internal/media-handoff/:handoffId/download`
- `POST /api/v1/internal/media-handoff/:handoffId/confirm-transferred`

**Requisitos de Autenticação:**
A arquitetura falha fechada. É **Obrigatório** ter o ambiente configurado com `MEDIA_HANDOFF_SECRET`. Sem esta chave, os requests retornam código de erro e os webhooks não começam. A chave deve ser passada no header `x-haxis-media-secret` ou `Authorization: Bearer <SECRET>`. Para o endpoint GET, o token de uso provido no Webhook entra exclusivamente no header `X-Haxis-Media-Token`.

## 11. Segurança
- O sistema "Fail Closed" garante que o arquivo nem baixe localmente se as chaves da API de acesso (MEDIA_HANDOFF_SECRET) não estiverem em stand-by e injetadas no .env.
- Path dinâmico gerado seguro para evitar Path Traversal.
- Link de download não possui token explícito na URI Query protegendo contra Access Logs expostos no Gateway ou Cloudflare.
- O token temporal é validado com restrição contra os Hashes SHA256 embutidos de forma one-way na Base SQLite para revogações fáceis.
- Sem base64 exposto ou armazenado no db SQLite.

## 12. Limpeza
Comando manual/cron `npm run media-handoff:cleanup` para apagar resíduos e arquivos de status `expired` ou limpar `transferred` cujas remoções síncronas falharam.

## 13. Limitações
Arquivos de mídias são guardados apenas em disco no ApiWS de forma temporária. A garantia de disponibilidade reside na rapidez do APIH consumir a mídia e na estabilidade do disco do node onde o ApiWS roda.

## 14. Próximos passos
- APIH implementar o consumo de `source_url` via HTTP requests anexando os devidos Headers.
- APIH implementar a notificação de confirmação (confirm-transferred) e deleção na ApiWS.
