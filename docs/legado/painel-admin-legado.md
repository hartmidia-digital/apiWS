# Painel Admin Legado (`/admin`)

Este documento mapeia todos os artefatos existentes na pasta `/admin` e suas rotas relacionadas, com o objetivo de preparar uma futura remoção controlada sem quebrar as dependências do atual Console Operacional (`/ops`).

## 1. Mapeamento de Arquivos em `/admin`

A pasta `admin/` no diretório raiz contém os seguintes arquivos principais:

- `login.html`: **Transicional (Essencial)** - Atualmente a única porta de entrada para autenticação no sistema. O `/ops` depende deste login. Precisa ser migrado/preservado.
- `dashboard.html`: **Legado** - Dashboard antigo comercial. Substituído por `/ops/`. Pode ser removido futuramente.
- `activities.html`: **Legado** - Interface antiga de logs de atividades. Substituído por logs no `/ops`. Pode ser removido.
- `campaigns.html`: **Legado** - Funcionalidade de disparos e campanhas que foge ao escopo "Dumb Engine" do ApiWS. Pode ser removida.
- `users.html`: **Legado** - Interface de gestão de usuários. Funções administrativas devem ser enxutas no ApiWS; painel legível pode ser removido, mas a rota de DB precisa de validação de dependência.
- `js/`: **Legado/Transicional** - Contém scripts estáticos para essas telas. Os scripts de login precisarão ser movidos.

## 2. Rotas e Dependências

### O que `/ops` ainda usa do `/admin`
- **Fluxo de Login**: `req.session.adminAuthed` é gerado via `POST /admin/login`.
- **Validação de Role**: O `/ops` exige o usuário criado e gerido pelos endpoints `/admin/users` (ao menos o Admin Root).
- O middleware de autenticação verifica essa sessão configurada via rotas de auth (`src/routes/auth.js`).

### O que já foi substituído pelo `/ops`
- O monitoramento técnico de instâncias que antes existia no `dashboard.html` e `activities.html` foi movido para o painel `/ops`.
- Geração de QR Code e status de sessões.
- Logs em tempo real via WebSocket.

## 3. Riscos de Remoção Sem Planejamento

Se a pasta `/admin` ou suas rotas forem deletadas imediatamente, o seguinte irá quebrar:
1. **Quebra de Login no `/ops`**: Não haverá página HTML para digitar credenciais.
2. **Quebra de Autenticação na API**: O endpoint `POST /admin/login` deixaria de existir, impedindo o fluxo da sessão e consequentemente bloqueando qualquer requisição ao `/ops`.
3. **Quebra de Middleware**: Dependendo de como os redirecionamentos estão amarrados no Express (`res.redirect('/admin/login.html')`), usuários não autenticados receberiam 404 em vez de irem para a tela de auth.

## 4. Classificação das Partes

| Componente | Classificação para Futuro |
|---|---|
| `/admin/login.html` | Precisa migrar para `/ops/login.html` ou `/auth/login.html`. |
| Rotas `auth.js` | Precisa preservar a lógica de login/logout/session. |
| Páginas HTML Legadas | Pode ser removido na limpeza final. |
| Rotas de Campanhas/Usuários | Precisam de aprovação para remoção (se não são usadas pelo Gateway). |

## Importante
A pasta `/admin` e suas lógicas **NÃO** devem ser removidas na tarefa atual. Este documento atua apenas como mapa de riscos e plano de ação futuro.
