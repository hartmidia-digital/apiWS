# Padrões de Documentação — ApiWS

## 1. Pasta oficial
A pasta oficial de documentação do ApiWS é `/docs`.

## 2. Idioma
Toda documentação deve ser escrita em português do Brasil.
Inglês deve ser usado somente quando tecnicamente necessário.

## 3. Nomenclatura
Arquivos devem usar kebab-case, nomes claros e descritivos.

## 4. Documentos aprovados
Nenhum documento aprovado deve ser removido, renomeado ou substituído sem justificativa explícita.

## 5. Fonte de verdade
A documentação em `/docs` deve ser tratada como fonte oficial da verdade sobre:
- instância WhatsApp;
- endpoints;
- webhooks;
- variáveis de ambiente;
- operação;
- deploy;
- segurança;
- logs;
- limites conhecidos;
- pendências técnicas;
- integração com APIH.

## 6. Regra antes de qualquer tarefa
Antes de iniciar qualquer tarefa de implementação, correção ou refatoração, o Jules deve:
- Ler a documentação relacionada em `/docs`.
- Verificar o estado real do código.
- Identificar divergências entre documentação e implementação.
- Informar claramente o que já existe, o que está pendente e o que não deve ser alterado naquela tarefa.

## 7. Regra ao finalizar qualquer tarefa
Ao finalizar qualquer tarefa, o Jules deve:
- Atualizar a documentação afetada.
- Atualizar o `CHANGELOG.md`, quando aplicável.
- Registrar arquivos criados e alterados.
- Informar comandos executados e resultados.
- Informar pendências, riscos e como testar.
- Confirmar que não alterou escopos fora da tarefa.

## 8. Regra de conclusão
Nenhuma entrega deve ser considerada concluída se a documentação relacionada estiver desatualizada.

## 9. Alterações em documentação
Sempre que um arquivo de documentação for criado, removido, renomeado ou reorganizado, o PR deve informar:
- motivo da mudança;
- arquivo antigo;
- arquivo novo;
- referências atualizadas;
- impacto na documentação existente.

## 10. Segurança documental
Nunca registrar em documentação:
- tokens reais;
- secrets reais;
- sessão WhatsApp real;
- QR Code real;
- credenciais;
- senhas;
- chaves privadas;
- dados sensíveis de clientes;
- payloads contendo dados reais sem anonimização.