# Banco de Dados SQLite (`whatsapp.db`)

O ApiWS utiliza o SQLite (`better-sqlite3`) para persistência relacional leve. O banco está localizado no caminho resolvido via `DATA_PATH` (ver `src/config/paths.js`), operando com `journal_mode = WAL` para concorrência eficiente em ambiente Node.js.

## 1. Escopo e Propósito
O banco **não** é o cérebro das regras de negócios ou contatos do HAXIS. Seu propósito principal é atuar como uma camada de observabilidade, registro de metadados das sessões ativas e logs.
- Todo dado armazenado no SQLite deve ser considerado *transiente ou operacional*, com backup focado em restaurar conexões.
- Os dados reais de contatos, funis e conversas pertencem ao banco de dados do Gateway (APIH).

## 2. Estrutura de Tabelas (Baseada no `src/config/database.js`)

| Tabela | Finalidade | Status/Classificação | Observações e Retenção |
|---|---|---|---|
| `users` | Registra e-mail, senha (hash) e role (`admin`, `user`). Usado para o login no Console. | **Oficial (Core)** | Contém o usuário "root" padrão criado via `ADMIN_DASHBOARD_PASSWORD`. |
| `whatsapp_sessions` | Metadados da sessão (id, status e token serial). Os dados brutos da conta ficam no disco, na pasta `auth_info_baileys`. | **Oficial (Core)** | Limite máximo no DB deve espelhar o `MAX_SESSIONS` na criação. |
| `engine_logs` | Tabela focada na operação técnica (`engineLogger`). Logs de sanidade, webhooks enviados e erros sistêmicos do Node. | **Oficial (Ops)** | **Risco de Crescimento:** Não há rotina de purge automático. Futuramente necessitará de política de retenção (ex: deletar logs mais velhos que 30 dias). |
| `activity_logs` | Tabela antiga focada nas ações do usuário logado no painel legado. | **Legado** | Pode ser removida ou consolidada no `engine_logs` quando a interface legado for desativada. |
| `campaigns` | Dados da campanha de envio em massa (texto/delay). | **Legado** | Relíquia do painel antigo. Fora do escopo do "dumb engine". |
| `campaign_recipients` | Relaciona o contato à campanha para disparo. | **Legado** | Foge da proposta de engine. Destinada à futura remoção. |
| `recipient_lists` | Lista manual ou CSV de contatos do `/admin`. | **Legado** | Foge da proposta de engine. Destinada à futura remoção. |

## 3. Alerta Importante: Crescimento da `engine_logs`
A tabela `engine_logs` é gravada em alta frequência a cada status do WebSocket, hook disparado e erro do sistema.
- Por se tratar do SQLite sem paginação paginada de limpeza assíncrona, a longo prazo, se o sistema processar milhões de hooks, o banco pode inchar (`bloat`), travando o disco do cPanel.
- **Ação Recomendada em Futura Tarefa:** Criar job (`cron` ou script) em Node.js que apague logs com `created_at` superior a 30 dias na tabela `engine_logs`.

## 4. Diferença entre Arquivos em Disco e o Banco
É essencial compreender a diferença de estado para sessões:
- `whatsapp_sessions` (SQLite): Sabe que a sessão de nome "oficial" existe, quem é o dono e seu token de API (`Bearer`).
- `auth_info_baileys/` (Disco): Contém as chaves criptográficas (Mac, PreKeys, Signal) vitais para o WhatsApp reconectar. Sem esses arquivos, a sessão no SQLite constará como "DISCONNECTED" permanentemente exigindo leitura de novo QR Code (Reset Auth).
