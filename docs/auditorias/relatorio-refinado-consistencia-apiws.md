# Relatório Refinado de Consistência (Pré-Remoção Admin)

**Data da Auditoria:** Atualização Contínua
**Branch Auditada:** `docs/auditoria-refinada-pre-remocao-admin-apiws`
**Escopo:** Auditoria completa e refinada da documentação e do código atual, preparando terreno para arquivamento ou deleção do `/admin` em tarefas futuras.

## 1. Regra de Fonte da Verdade
Foi corrigido o equívoco anterior em que se considerava a pasta `/docs` como "única fonte da verdade". A regra definitiva adotada em toda a documentação agora é:
> *O código da branch main é a fonte definitiva da verdade técnica. A documentação (`/docs`) deve ser a referência de consulta, devendo refletir e submeter-se ao código.*

## 2. Documentos Inspecionados e Criados
- `README.md` (Refinado)
- `docs/indice-documentacao-apiws.md` (Refinado)
- `docs/api/rotas-apiws.md` (Criado/Mapeado)
- `docs/legado/painel-admin-legado.md` (Criado)
- `docs/planejamento/plano-remocao-admin-legado-apiws.md` (Criado)
- `docs/operacao/console-operacional-apiws.md` (Atualizado)
- `docs/seguranca/seguranca-apiws.md` (Atualizado)
- `docs/banco/sqlite-apiws.md` (Criado)
- `docs/configuracao/variaveis-ambiente-apiws.md` (Criado)
- `docs/api/websocket-apiws.md` (Criado)
- `docs/operacao/logs-observabilidade-apiws.md` (Criado)
- `docs/webhooks/webhooks-apiws-para-apih.md` (Atualizado)
- `docs/deploy/deploy-producao-apiws.md` (Atualizado)
- `docs/auditorias/matriz-prontidao-remocao-admin.md` (Criado em paralelo)

## 3. Inconsistências Encontradas e Corrigidas na Documentação
- **Docs vs Código (Fonte de Verdade):** Corrigido em toda a base de documentação que o repositório `/docs` ditava regras que não refletiam o código em alguns aspectos.
- **JWT:** Removidas menções a "JWT" quando o projeto adota chaves de Bearer baseadas em seriais não formatados em JWT puro.
- **Transicionalidade do `/admin`:** A documentação antiga considerava que o Ops já havia "removido" o Admin. O código mostra que as rotas `/admin/login` e o painel `/admin` ainda existem. A linguagem foi corrigida para "Transicional/Legado".
- **Logs:** Clarificado o fato de que QR Codes são dados apenas efêmeros no WebSocket e não compõem as rotinas de banco (em concordância com o `engineLogger.js`).

## 4. Inconsistências Mantidas e Riscos Existentes (Para Futuro)
Estas questões foram mapeadas e permanecem no código por serem lógicas funcionais que **não devem ser alteradas nesta auditoria**:
- **Dependência de Auth:** O `/ops` quebra se removermos o HTML de login ou as rotas de auth localizadas na raiz de `/admin`. Isso é um risco elevado e precisa da fase 2 do plano de remoção.
- **Engine Logs Crescente:** O banco SQLite não possui rotina de deleção de logs maduros, o que pode engarrafar o disco num cenário de milhares de webhooks por hora.
- **Rotas Comerciais:** Funcionalidades inteiras em `/src/routes/api.js` dedicadas a enviar campanhas continuam expostas, fugindo ao escopo do "dumb engine". Precisam de validação humana para decidir por apagá-las.

## 5. Pontos Pendentes de Validação em Deploy Real
Antes do início da tarefa oficial de exclusão do legado, um sysadmin/HAXIS admin precisa:
- Validar se a aba `/ops/integration.html` está atirando com sucesso no Gateway APIH via webhook e gerando ID de idempotência válido.
- Reconectar uma sessão WhatsApp real do início ao fim usando apenas `/ops/sessions.html`.

## 6. Checklist de Prontidão
- [x] Regra da "Fonte da Verdade" restaurada para o código.
- [x] Dependências legadas mapeadas.
- [x] O papel da aplicação e painéis muito bem diferenciado.
- [x] Nenhuma linha funcional da aplicação foi removida na auditoria.
