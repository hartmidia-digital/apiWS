# Integração HAXIS APIH: Identidade Operacional e Engine ID

## 1. O que é APIWS_ENGINE_ID?
`APIWS_ENGINE_ID` é uma variável de ambiente que serve como um identificador único para a instalação do motor ApiWS. Devido à arquitetura da plataforma HAXIS, onde uma única instalação da APIH pode receber requisições de múltiplas instâncias da ApiWS hospedadas em servidores diferentes, esse identificador informa à APIH de onde os webhooks estão sendo disparados.

## 2. O que é APIWS_PUBLIC_URL?
A `APIWS_PUBLIC_URL` é a URL base pública que aponta para aquela instalação específica da ApiWS. Isso provê à APIH e à aplicação HAXIS o caminho correto de retorno (callback/outbound) para acionar envios de mensagens ou gerenciar os nós conectados na referida instalação.

## 3. Por que APIWS_ENGINE_ID identifica a instalação?
Sem um identificador de origem único, a APIH seria incapaz de diferenciar entre webhooks gerados por uma `sessao_haxis_01` hospedada no cliente A (apiws.cliente-a.com) e a mesma `sessao_haxis_01` hospedada no cliente B (apiws.cliente-b.com). A combinação da origem (`engine_id`) e da sessão interna (`engine_session_id`) resolve conflitos entre múltiplas instâncias e separa contextos entre locatários (tenants) no APIH.

## 4. Por que o domínio público é o valor recomendado?
Utilizar o domínio em que a APIWS está instalada (exemplo: `apiws.hartmidia.com`) é a maneira mais simples e universal de garantir unicidade sem necessidade de gerar UUIDs complexos, mantendo um formato legível por humanos em dashboards, logs, e registros do sistema HAXIS.

## 5. Como configurar as variáveis no .env?
Estas variáveis devem ser definidas explicitamente e exclusivamente no `.env` do servidor de produção:

```env
APIWS_ENGINE_ID=apiws.hartmidia.com
APIWS_PUBLIC_URL=https://apiws.hartmidia.com
```

**ATENÇÃO:** O motor NUNCA deduz automaticamente a sua própria URL ou ID de origem através de headers de requisições HTTP como `Host`, `Origin` ou `Referer`, evitando ataques de *Host Header Injection* (falsificação do header do host).

## 6. Como engine_id + engine_session_id formam a identidade no APIH
No banco de dados do APIH/HAXIS, um nó ou ChannelAccount passa a ser obrigatoriamente referenciado como uma chave composta: `[engine_id] + [engine_session_id]`.
Se o webhook trouxer o `engine_id: "apiws.hartmidia.com"` e o `engine_session_id: "vendas-01"`, o APIH resolve e vincula ao canal correspondente, processando com segurança os retornos do WhatsApp daquele número de telefone em particular.

## 7. Exemplo de Payload enviado ao APIH
Os webhooks disparados a partir do `src/utils/webhookHaxis.js` agora incluem `engine_id` e `engine_base_url` no corpo principal da requisição:

```json
{
  "event_id": "550e8400-e29b-41d4-a716-446655440000",
  "event_type": "message.received",
  "engine_id": "apiws.hartmidia.com",
  "engine_base_url": "https://apiws.hartmidia.com",
  "engine_session_id": "vendas-01",
  "timestamp": "2026-05-05T00:00:00.000Z",
  "raw_payload": { ... },
  "normalized_preview": { ... }
}
```

## 8. Impacto no HMAC e Assinatura
O hash criptográfico HMAC (usando a chave `WEBHOOK_SECRET`) continuará sendo calculado sobre o corpo JSON integral do payload. Ou seja, como o `engine_id` e o `engine_base_url` passam a ser componentes do payload, eles são **automaticamente assinados e protegidos** contra falsificações (tampering). O segredo não é exposto.

## 9. Riscos se APIWS_ENGINE_ID não estiver configurado
Se a variável `APIWS_ENGINE_ID` for ignorada em ambientes de produção, existe o sério risco de enviar dados de clientes para o APIH sem origem clara, resultando em:
- Erros de roteamento de fluxos.
- Mesclagem indevida de contas que compartilham o mesmo nome de `engine_session_id`.
- Rejeição das requisições pelo APIH.

## 10. Comportamento esperado em produção
Para combater o risco listado no item acima, o inicializador principal do sistema (`index.js`) implementa um bloqueio forte. **Se a variável `NODE_ENV` for "production" e `APIWS_ENGINE_ID` for vazia, o ApiWS lançará um erro fatal explícito em português no terminal e a aplicação abortará com o código `process.exit(1)`.**
Isso garante que a aplicação não rodará num estado inconsistente. Por outro lado, `APIWS_PUBLIC_URL` enviará apenas um alerta ou `warn` caso esteja ausente, oferecendo um *fallback* temporário seguro (resultando em `engine_base_url: null`), o qual deve ser corrigido logo depois.

## 11. Healthcheck e Monitoramento
Foi disponibilizado um endpoint público e seguro em `GET /health` que retorna um payload JSON contendo o status, app e environment. Recomenda-se o uso deste endpoint para facilitar o deploy e monitoramento da estabilidade do motor na infraestrutura. Nenhuma informação sensível ou segredos são expostos.

## 12. Limite de Sessões (MAX_SESSIONS)
Ao homologar, certifique-se de respeitar a capacidade do seu ambiente em relação à criação de múltiplas sessões do Baileys.
A variável `MAX_SESSIONS` estipula um teto seguro para evitar sobrecarga (OOM). Por padrão, iniciamos de forma conservadora com `MAX_SESSIONS=5`.
- Se o número de sessões no banco de dados chegar ou ultrapassar 5, não será possível adicionar mais (a APIWS emitirá uma resposta HTTP 403 com a mensagem "*Limite máximo de sessões atingido. Ajuste MAX_SESSIONS no ambiente se precisar ampliar a capacidade.*").
- Pode ser aumentado depois com monitoramento adequado (via endpoint de healthcheck e análise de log).
- O limite real de cada instalação depende puramente de RAM, CPU, estabilidade do Baileys, volume de mensagens e mídia transacionada. Cada instalação deve ser monitorada individualmente.

## 13. Checklist de Homologação com APIH
Antes de subir uma nova instalação ou instanciar para múltiplos clientes:
1. [ ] Garantir que o APIH e o HAXIS Core estão publicados na sua versão que suporta a chave composta (`engine_id` + `engine_session_id`).
2. [ ] Configurar corretamente o `APIWS_ENGINE_ID`, `APIWS_PUBLIC_URL` e `MAX_SESSIONS` (recomendado: `5`) no `.env` do ApiWS.
3. [ ] Realizar um deploy da apiWS configurada.
4. [ ] Consultar o endpoint `GET /health` para verificar a subida do servidor.
5. [ ] Realizar um teste (disparar evento `message.received`).
6. [ ] Confirmar no banco de dados e logs do APIH que a *ChannelAccount* foi criada/resolvida corretamente pela identidade dupla.
7. [ ] Responder à mensagem via HAXIS (outbound) usando a origem correta.
