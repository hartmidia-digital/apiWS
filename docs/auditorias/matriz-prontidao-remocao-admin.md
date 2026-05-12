# Matriz de Prontidão: Remoção do Admin Legado

Esta tabela compara as lógicas e interfaces atualmente existentes no `/admin` e as cruza com a capacidade do `/ops`, indicando o que pode ser removido, o que deve ser migrado e o risco associado para uma futura Sprint de limpeza técnica.

| Funcionalidade / Item | Existe no `/admin` | Coberto pelo `/ops` | Ação Recomendada | Risco | Observações Técnicas |
|---|---|---|---|---|---|
| **Tela de Login** (`login.html`) | Sim | Parcial (Usa a mesma tela) | **Precisa Migrar** | Alto | O `/ops` quebra sem ela. Deve ser movida para `/ops/login.html` ou `/auth`. |
| **Rotas de Auth** (`POST /admin/login`, `logout`, `me`) | Sim | Sim (Sessão Global) | **Precisa Migrar** | Alto | Renomear rotas tirando o `/admin/` para proteger o fluxo de cookie (`adminAuthed`). |
| **Geração Token WS** (`ws-token`) | Sim | Não (Ops usa cookie direto) | **Pode Remover** | Baixo | Socket raiz precisa ser desativado junto; `/ops/ws` é o atual. |
| **Dashboard** (`dashboard.html`) | Sim | Sim | **Pode Remover** | Baixo | O `/ops/` index.html já provê os dados operacionais necessários. |
| **Lista de Sessões / QR** | Sim | Sim (`sessions.html`) | **Pode Remover** | Baixo | Totalmente assumido pelo `/ops` via endpoints `/api/v1/ops/sessions`. |
| **Envio Manual de Mensagem** | Sim (via API/UI) | Não | Decisão Humana | Médio | Foge do escopo "dumb engine", HAXIS Gateway deve prover isso. |
| **Campanhas e Disparo Massa** | Sim | Não | **Pode Remover** | Baixo | Interface e APIs relacionadas deverão ser expurgadas caso o APIH centralize. |
| **Contatos e Listas** | Sim | Não | **Pode Remover** | Baixo | Não pertencem a um engine puro. |
| **Gestão de Usuários** (`users.html`) | Sim | Não | Decisão Humana | Médio | Precisa existir um usuário Admin ativo. O ideal é manter só via CLI ou seed no BD, sem interface legada. |
| **Logs Antigos** (`activities.html`) | Sim | Não (Ops usa `engine_logs`)| **Pode Remover** | Baixo | Tabela `activity_logs` pode ser congelada/deletada em favor do log sanitizado. |
| **Live Logs do Motor** | Não | Sim | N/A | N/A | Já operante no `/ops`. |
| **Teste de Integração (Webhooks)**| Não | Sim | N/A | N/A | Já operante no `/ops`. |
| **Health Check e Status** | Não | Sim | N/A | N/A | Já operante no `/ops`. |
| **Assets do Admin** (`css`, `js`) | Sim | Não (Ops usa Tailwind/próprio)| **Precisa Migrar / Pode Remover** | Médio | Extrair JS necessário para o Login, deletar o restante. |
| **Rotas da API V1 Legadas** (`/api/v1/campaigns` etc.) | Sim | Não | **Pode Remover** | Médio | Remoção apenas quando o APIH for a única fonte e não depender destas URLs. |

**Conclusão da Matriz:**
O painel `/ops` já cobre quase **100% do escopo operacional focado em infraestrutura (engine)**. O que impede a remoção sumária imediata da pasta `/admin` são os **fluxos e middlewares de Autenticação (Login e Usuários)**.
