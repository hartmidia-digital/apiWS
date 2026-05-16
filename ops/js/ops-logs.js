
let ws = null;
let isPaused = false;
const maxLogs = 1000;
window.liveLogsData = [];

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
            window.liveLogsData = data.data.reverse();
            applyFilters();
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
        applyFilters(); // render any logs that came in while paused
    }
}

function clearTerminal() {
    window.liveLogsData = [];
    document.getElementById('terminal').innerHTML = '';
}

function applyFilters() {
    const term = document.getElementById('terminal');
    term.innerHTML = ''; // clear term to re-render

    const filterSessionId = document.getElementById('filterSessionId').value.trim().toLowerCase();
    const filterLevel = document.getElementById('filterLevel').value;
    const filterCategory = document.getElementById('filterCategory').value;
    const filterStatus = document.getElementById('filterStatus').value;
    const filterText = document.getElementById('filterText').value.trim().toLowerCase();

    window.liveLogsData.forEach(log => {
        // filter session (session ID, or maybe inside details phone/name)
        if (filterSessionId) {
            let matchesSession = log.sessionId && log.sessionId.toLowerCase().includes(filterSessionId);
            if (!matchesSession && log.details) {
                const detailsStr = JSON.stringify(log.details).toLowerCase();
                if (detailsStr.includes(filterSessionId)) matchesSession = true;
            }
            if (!matchesSession) return;
        }

        if (filterLevel && log.level !== filterLevel) return;
        if (filterCategory && log.category !== filterCategory) return;

        // filter operational status mapping
        if (filterStatus) {
            const isStatusConnected = filterStatus === 'CONNECTED' && log.event === 'session.status' && log.details?.status === 'CONNECTED';
            const isStatusDisconnected = filterStatus === 'DISCONNECTED' && log.event === 'session.status' && log.details?.status === 'DISCONNECTED';
            const isStatusReconnecting = filterStatus === 'RECONNECTING' && log.event === 'session.status' && log.details?.status === 'RECONNECTING';
            const isStatusGeneratingQr = filterStatus === 'GENERATING_QR' && log.event === 'session.status' && log.details?.status === 'GENERATING_QR';

            const isExactEventMatch = filterStatus === log.event;

            if (!(isStatusConnected || isStatusDisconnected || isStatusReconnecting || isStatusGeneratingQr || isExactEventMatch)) {
                return;
            }
        }

        // filter generic text
        if (filterText) {
            const fullLogText = `${log.event} ${log.message} ${log.category} ${JSON.stringify(log.details || {})}`.toLowerCase();
            if (!fullLogText.includes(filterText)) return;
        }

        renderLogEntry(log, term);
    });

    if (document.getElementById('autoScroll').checked) term.scrollTop = term.scrollHeight;
}

function appendLog(log) {
    if (window.liveLogsData.length >= maxLogs) window.liveLogsData.shift();
    window.liveLogsData.push(log);

    if (isPaused) return;

    // Apply quick filters check
    const filterSessionId = document.getElementById('filterSessionId').value.trim().toLowerCase();
    const filterLevel = document.getElementById('filterLevel').value;
    const filterCategory = document.getElementById('filterCategory').value;
    const filterStatus = document.getElementById('filterStatus').value;
    const filterText = document.getElementById('filterText').value.trim().toLowerCase();

    if (filterSessionId) {
        let matchesSession = log.sessionId && log.sessionId.toLowerCase().includes(filterSessionId);
        if (!matchesSession && log.details) {
            const detailsStr = JSON.stringify(log.details).toLowerCase();
            if (detailsStr.includes(filterSessionId)) matchesSession = true;
        }
        if (!matchesSession) return;
    }
    if (filterLevel && log.level !== filterLevel) return;
    if (filterCategory && log.category !== filterCategory) return;
    if (filterStatus) {
        const isStatusConnected = filterStatus === 'CONNECTED' && log.event === 'session.status' && log.details?.status === 'CONNECTED';
        const isStatusDisconnected = filterStatus === 'DISCONNECTED' && log.event === 'session.status' && log.details?.status === 'DISCONNECTED';
        const isStatusReconnecting = filterStatus === 'RECONNECTING' && log.event === 'session.status' && log.details?.status === 'RECONNECTING';
        const isStatusGeneratingQr = filterStatus === 'GENERATING_QR' && log.event === 'session.status' && log.details?.status === 'GENERATING_QR';

        const isExactEventMatch = filterStatus === log.event;

        if (!(isStatusConnected || isStatusDisconnected || isStatusReconnecting || isStatusGeneratingQr || isExactEventMatch)) {
            return;
        }
    }
    if (filterText) {
        const fullLogText = `${log.event} ${log.message} ${log.category} ${JSON.stringify(log.details || {})}`.toLowerCase();
        if (!fullLogText.includes(filterText)) return;
    }

    const term = document.getElementById('terminal');
    renderLogEntry(log, term);

    while (term.children.length > maxLogs) term.removeChild(term.firstChild);
    if (document.getElementById('autoScroll').checked) term.scrollTop = term.scrollHeight;
}

function renderLogEntry(log, term) {
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
        const sanitizedDetails = sanitizeDetails(log.details);
        html += `<div class="log-details" style="display:none; background:#f9f9f9; padding:5px; margin-top:5px; border-left:3px solid #ccc; color: #333;">
            <strong>Técnico:</strong> ${log.message}<br>
            <strong>Origem:</strong> ${log.event}<br>
            <pre style="margin-top:5px;">${JSON.stringify(sanitizedDetails, null, 2)}</pre>
        </div>`;
    }

    div.innerHTML = html;
    term.appendChild(div);
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
