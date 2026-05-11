
let ws = null;
let isPaused = false;
const maxLogs = 1000;

document.addEventListener('DOMContentLoaded', async () => {
    const user = await checkOpsAuth();
    if (user) setupWebSocket();
});

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

    const time = new Date(log.timestamp).toLocaleTimeString();
    const levelClass = `log-level-${log.level.toLowerCase()}`;
    const sessionText = log.sessionId ? `<span class="log-session">[${log.sessionId}]</span>` : '';

    let html = `<span class="log-time">${time}</span> `;
    html += `<span class="${levelClass}">${log.level}</span> `;
    html += `<span class="log-category">${log.category}::${log.event}</span> `;
    html += sessionText + ` `;
    html += `<span style="cursor:pointer;" onclick="this.nextElementSibling.style.display = this.nextElementSibling.style.display === 'block' ? 'none' : 'block'">${log.message}</span>`;

    if (log.details) {
        html += `<div class="log-details">${JSON.stringify(log.details, null, 2)}</div>`;
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
    ws.onmessage = (event) => {
        try {
            const payload = JSON.parse(event.data);
            if (payload.event === 'log.created') appendLog(payload.data);
        } catch(e) {}
    };
    ws.onclose = () => { setTimeout(() => connectWebSocket(token), 3000); };
}
