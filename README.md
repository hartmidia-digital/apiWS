# Instância ApiWS — WhatsApp Engine

O **ApiWS** atua como a camada técnica de conexão com o WhatsApp para o ecossistema HAXIS. Baseado na biblioteca `@whiskeysockets/baileys`, seu papel único é abstrair a comunicação direta de Sockets do WhatsApp e repassar eventos limpos para o cérebro principal via webhooks (APIH).

A fonte de verdade técnica, operacional e arquitetural deste projeto foi auditada e movida completamente para o repositório de documentação.

👉 **Por favor, antes de operar, codificar ou inspecionar o servidor, inicie a leitura pelo Índice da Documentação Oficial:**
🔗 **[Ler Documentação Oficial do ApiWS (Acessar o Índice)](docs/indice-documentacao-apiws.md)**

## Estrutura Rápida da Documentação (/docs)
- **[Padrões de Documentação](docs/padroes-documentacao-apiws.md)**: Regras vitais antes de comitar.
- **[Instância WhatsApp](docs/instancia/instancia-apiws-whatsapp.md)**: Como o serviço se isola da regra de negócio (HAXIS).
- **[Operação de Sessão](docs/operacao/operacao-sessoes-whatsapp-apiws.md)**: Como agir para resetar e checar saúdes de QRs Code.
- **[Deploy Produção](docs/deploy/deploy-producao-apiws.md)**: O processo de envio contínuo para o painel cPanel via `.cpanel.yml`.
- **[Webhooks ApiWS → APIH](docs/webhooks/webhooks-apiws-para-apih.md)**: Os headers e contratos entre o Motor e o Gateways (APIH).
- **[Segurança](docs/seguranca/seguranca-apiws.md)**: A proteção via `MASTER_API_KEY` e encriptação AES.
- **[Relatório de Consistência](docs/auditorias/relatorio-consistencia-documentacao-codigo-apiws.md)**: Estado atual e análise entre o que o código faz e o que a doc afirma.

*(Este README age puramente como mapa. Não injete lógica de tutoriais ou explicações estendidas aqui, use a pasta `/docs/`.)*
