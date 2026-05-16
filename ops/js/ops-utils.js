/**
 * Utilitários compartilhados para o Console Operacional.
 */

/**
 * Sanitiza objetos de detalhes técnicos (payloads), mascarando informações sensíveis
 * como números de telefone, chaves, senhas e conteúdo textual de mensagens.
 *
 * @param {Object|String} detailsObj Objeto ou string JSON a ser sanitizada
 * @returns {Object} Novo objeto sanitizado e seguro para exibição na UI
 */
function sanitizeDetails(detailsObj) {
    if (!detailsObj) return {};
    let obj = typeof detailsObj === 'string' ? JSON.parse(detailsObj) : JSON.parse(JSON.stringify(detailsObj));

    function maskNode(node) {
        if (!node || typeof node !== 'object') return;
        for (const key in node) {
            if (['text', 'message', 'conversation', 'body', 'caption', 'captionMessage', 'vcard'].includes(key)) {
                node[key] = '[CONTEÚDO TEXTUAL OMITIDO]';
            } else if (['secret', 'token', 'authorization', 'cookie', 'password'].includes(key)) {
                node[key] = '[OMITIDO]';
            } else if (['headers', 'requestHeaders'].includes(key)) {
                node[key] = '[CABEÇALHOS OMITIDOS]';
            } else if (typeof node[key] === 'string') {
                const phoneRegex = /\b(\d{4})(\d{4,5})(\d{4})\b/g;
                node[key] = node[key].replace(phoneRegex, '$1****$3');
            } else if (typeof node[key] === 'object') {
                maskNode(node[key]);
            }
        }
    }
    maskNode(obj);
    return obj;
}
