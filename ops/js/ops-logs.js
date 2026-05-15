
let ws = null;
let isPaused = false;
const maxLogs = 1000;

document.addEventListener('DOMContentLoaded', async () => {
    const user = await checkOpsAuth();
    if (user) {
        fetchHistoricalLogs();
        setupWebSocket();
    }
});

async function fetchHistoricalLogs() {
    try {
        const res = await fetch('/api/v1/ops/logs');
        const data = await res.json();
        if (data.status === 'success' && data.data && data.data.length > 0) {
            data.data.reverse().forEach(log => appendLog(log));
        }
    } catch (e) {
        console.error('[Ops WS] Erro ao buscar logs historicos', e);
    }
}

function togglePause() {
    isPaused = !isPaused;
    const btn = document.getElementById('btnPause');
    if (isPaused) {
        btn.textContent = 'Retomar';
        btn.classList.replace('btn-secondary', 'btn-primary');
    } else {
        btn.textContent = 'Pausar';
        btn.classList.replace('btn-primary', 'btn-secondary');
    }
}

function clearTerminal() { document.getElementById('terminal').innerHTML = ''; }

function appendLog(log) {
    if (isPaused) return;
    const filterSessionId = document.getElementById('filterSessionId').value.trim();
    const filterLevel = document.getElementById('filterLevel').value;
    const filterCategory = document.getElementById('filterCategory').value;

    if (filterSessionId && log.sessionId !== filterSessionId) return;
    if (filterLevel && log.level !== filterLevel) return;
    if (filterCategory && log.category !== filterCategory) return;

    const term = document.getElementById('terminal');
    const div = document.createElement('div');
    div.className = 'log-entry';

    let logDate = new Date();
    if (log.timestamp) logDate = new Date(log.timestamp);
    else if (log.created_at) logDate = new Date(log.created_at);
    const time = logDate.toLocaleTimeString();

    const levelClass = `log-level-${log.level.toLowerCase()}`;
    const sessionText = log.sessionId ? `<span class="log-session">[${log.sessionId}]</span>` : '';

    let opMessage = log.message;
    if (log.event === 'webhook.dispatch_success') {
        opMessage = `Webhook enviado com sucesso para evento de ${log.details?.eventType || 'desconhecido'}`;
    } else if (log.event === 'message.received') opMessage = 'Mensagem recebida pela sessão';
    else if (log.event === 'session.connected') opMessage = 'Sessão conectada com sucesso';
    else if (log.event === 'session.disconnected') opMessage = 'Sessão desconectada';
    else if (log.event === 'session.reconnecting') opMessage = 'Tentando reconectar sessão';
    else if (log.event === 'session.socket_created') opMessage = 'Socket criado para a sessão';

    let html = `<span class="log-time">${time}</span> `;
    html += `<span class="${levelClass}">${log.level}</span> `;
    html += `<span class="log-category">${log.category}::${log.event}</span> `;
    html += sessionText + ` `;
    html += `<span style="cursor:pointer;" onclick="this.nextElementSibling.style.display = this.nextElementSibling.style.display === 'block' ? 'none' : 'block'">${opMessage}</span>`;

    if (log.details) {
        html += `<div class="log-details" style="display:none; background:#f9f9f9; padding:5px; margin-top:5px; border-left:3px solid #ccc; color: #333;">
            <strong>Técnico:</strong> ${log.message}<br>
            <strong>Origem:</strong> ${log.event}<br>
            <pre style="margin-top:5px;">${JSON.stringify(log.details, null, 2)}</pre>
        </div>`;
    }

    div.innerHTML = html;
    term.appendChild(div);
    while (term.children.length > maxLogs) term.removeChild(term.firstChild);
    if (document.getElementById('autoScroll').checked) term.scrollTop = term.scrollHeight;
}

function setupWebSocket() {
    fetch('/admin/ws-token')
        .then(res => res.json())
        .then(data => {
            if(data.status === 'success') connectWebSocket(data.data.token);
        });
}

function connectWebSocket(token) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${protocol}//${window.location.host}/ops/ws?token=${token}`);

    ws.onopen = () => {
        console.log('[Ops WS] Conectado ao WebSocket');
        const headerTitle = document.querySelector('.topbar h1');
        if (headerTitle) {
            headerTitle.innerHTML = 'Logs ao Vivo <span class="badge badge-success" style="font-size: 0.5em; vertical-align: middle;">WS Online</span>';
        }
    };

    ws.onmessage = (event) => {
        try {
            const payload = JSON.parse(event.data);
            if (payload.event === 'log.created') appendLog(payload.data);
        } catch(e) {
            console.error('[Ops WS] Erro ao processar mensagem do WebSocket', e);
        }
    };
    ws.onclose = () => {
        console.warn('[Ops WS] WebSocket desconectado. Tentando reconectar...');
        const headerTitle = document.querySelector('.topbar h1');
        if (headerTitle) {
            headerTitle.innerHTML = 'Logs ao Vivo <span class="badge badge-danger" style="font-size: 0.5em; vertical-align: middle;">WS Offline</span>';
        }
        setTimeout(() => connectWebSocket(token), 3000);
    };
}
