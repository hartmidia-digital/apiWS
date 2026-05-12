# Instância ApiWS — WhatsApp Engine

O **ApiWS** atua como a camada técnica de conexão com o WhatsApp para o ecossistema HAXIS. Baseado na biblioteca `@whiskeysockets/baileys`, seu papel único é abstrair a comunicação direta de Sockets do WhatsApp e repassar eventos limpos para o cérebro principal via webhooks (APIH).

A documentação oficial está organizada em `/docs` e deve refletir fielmente o código da branch main. O código da branch main é a fonte definitiva da verdade técnica.

👉 **Por favor, antes de operar, codificar ou inspecionar o servidor, inicie a leitura pelo Índice da Documentação Oficial:**
🔗 **[Ler Documentação Oficial do ApiWS (Acessar o Índice)](docs/indice-documentacao-apiws.md)**

## Console Operacional e Painel Legado
- O **Console Operacional (`/ops`)** é a interface oficial e atual para operação técnica, monitoramento de sessões e observabilidade de logs.
- O **Painel Legado (`/admin`)** ainda existe e permanece funcional, porém está em fase transicional e será arquivado/removido em momento futuro, não devendo receber novas implementações.

## Configurações e Variáveis Críticas de Ambiente (.env)
* `APIWS_ENGINE_ID`: Identificador único da instalação (ex: `apiws.hartmidia.com`). Essencial para a identificação perante a APIH. Obrigatório em produção.
* `APIWS_PUBLIC_URL`: A URL pública/base da instalação para retorno de webhooks (ex: `https://apiws.hartmidia.com`).
* `MAX_SESSIONS`: Limite de sessões simultâneas que podem ser criadas no banco de dados. O recomendado inicial é `5` para evitar Out of Memory em ambientes restritos (cPanel). Deve ser um inteiro positivo (valores inválidos caem para o fallback seguro de 5).
* `sessionId`: Identificador da sessão WhatsApp gerada. Deve ser único dentro desta instalação e, junto com o `APIWS_ENGINE_ID`, garante unicidade global na APIH.

## Estrutura Rápida da Documentação (/docs)
- **[Padrões de Documentação](docs/padroes-documentacao-apiws.md)**: Regras vitais antes de comitar.
- **[Instância WhatsApp](docs/instancia/instancia-apiws-whatsapp.md)**: Como o serviço se isola da regra de negócio (HAXIS).
- **[Operação de Sessão](docs/operacao/operacao-sessoes-whatsapp-apiws.md)**: Como agir para resetar e checar saúdes de QRs Code.
- **[Console Operacional](docs/operacao/console-operacional-apiws.md)**: Visão geral e recursos do painel /ops.
- **[Deploy Produção](docs/deploy/deploy-producao-apiws.md)**: O processo de envio contínuo para o painel cPanel via `.cpanel.yml`.
- **[Webhooks ApiWS → APIH](docs/webhooks/webhooks-apiws-para-apih.md)**: Os headers e contratos entre o Motor e o Gateways (APIH).
- **[Identidade e Engine ID](docs/webhooks/integracao-apih-engine-id.md)**: Variáveis `APIWS_ENGINE_ID` e `APIWS_PUBLIC_URL` para múltiplos nós em produção.
- **[Segurança](docs/seguranca/seguranca-apiws.md)**: A proteção via `MASTER_API_KEY` e encriptação AES.

*(Este README age puramente como mapa. Não injete lógica de tutoriais ou explicações estendidas aqui, use a pasta `/docs/`.)*
