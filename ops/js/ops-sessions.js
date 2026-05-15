
let currentSessions = [];
let qrCodeObj = null;

document.addEventListener('DOMContentLoaded', async () => {
    const user = await checkOpsAuth();
    if (user) {
        loadSessions();
        setupWebSocket();
    }
});

function getBadgeClass(status) {
    switch(status) {
        case 'CONNECTED': return 'badge-success';
        case 'DISCONNECTED': return 'badge-danger';
        case 'CONNECTING':
        case 'GENERATING_QR':
        case 'RECONNECTING': return 'badge-warning';
        case 'INITIALIZING': return 'badge-info';
        default: return 'badge-neutral';
    }
}

async function loadSessions() {
    try {
        const res = await fetch('/api/v1/ops/sessions');
        const data = await res.json();

        if (data.status === 'success') {
            currentSessions = data.data;
            renderSessionsTable();
        }
    } catch(e) {
        console.error('Error loading sessions', e);
    }
}

function renderSessionsTable() {
    const tbody = document.querySelector('#sessionsTable tbody');
    tbody.innerHTML = '';

    if (currentSessions.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center">Nenhuma sessão encontrada.</td></tr>';
        return;
    }

    currentSessions.forEach(session => {
        const tr = document.createElement('tr');
        tr.setAttribute("data-testid", "ops-session-card");

        let phoneInfo = '<span class="text-muted" style="font-size: 0.85em;">Aguardando...</span>';
        if (session.identity && session.identity.available) {
            let parts = [];
            if (session.identity.displayPhone) parts.push(`<strong>${session.identity.displayPhone}</strong>`);
            if (session.identity.pushName) parts.push(`<span class="text-muted">(${session.identity.pushName})</span>`);

            if (parts.length > 0) {
                phoneInfo = parts.join(' ');
            }
        }

        const dateStr = session.createdAt ? new Date(session.createdAt).toLocaleString() : '-';

        let actions = `<button class="btn btn-sm btn-danger" onclick="deleteSession('${session.id}')">Excluir</button>`;

        if (session.status === 'CONNECTED') {
            actions = `
                <button class="btn btn-sm btn-secondary" onclick="disconnectSession('${session.id}')">Desconectar</button>
                <button class="btn btn-sm btn-secondary" onclick="restartSession('${session.id}')">Reiniciar</button>
                ${actions}
            `;
        } else if (session.status === 'GENERATING_QR') {
            actions = `
                <button class="btn btn-sm btn-primary" onclick="openQrModal('${session.id}')">Ver QR</button>
                <button class="btn btn-sm btn-secondary" onclick="disconnectSession('${session.id}')">Cancelar</button>
                ${actions}
            `;
        } else {
            actions = `
                <button class="btn btn-sm btn-primary" onclick="connectSession('${session.id}')">Conectar</button>
                <button class="btn btn-sm btn-secondary" onclick="resetAuthSession('${session.id}')">Reset Auth</button>
                ${actions}
            `;
        }

        tr.innerHTML = `
            <td><strong>${session.id}</strong></td>
            <td><span class="badge ${getBadgeClass(session.status)}">${session.status}</span></td>
            <td>${phoneInfo}</td>
            <td>${dateStr}</td>
            <td style="display:flex; gap:0.5rem; flex-wrap:wrap;">${actions}</td>
        `;
        tbody.appendChild(tr);
    });
}

async function connectSession(id) {
    await fetch(`/api/v1/ops/sessions/${id}/connect`, { method: 'POST' });
    setTimeout(loadSessions, 500);
}

async function disconnectSession(id) {
    await fetch(`/api/v1/ops/sessions/${id}/disconnect`, { method: 'POST' });
    setTimeout(loadSessions, 500);
}

async function restartSession(id) {
    if(confirm('Tem certeza que deseja reiniciar a conexão desta sessão?')) {
        await fetch(`/api/v1/ops/sessions/${id}/restart`, { method: 'POST' });
        setTimeout(loadSessions, 500);
    }
}

async function resetAuthSession(id) {
    if(confirm('ATENÇÃO: Isto apagará os dados de autenticação (auth_info). Será necessário ler o QR Code novamente. Confirma?')) {
        await fetch(`/api/v1/ops/sessions/${id}/reset-auth`, { method: 'POST' });
        setTimeout(loadSessions, 500);
    }
}

async function deleteSession(id) {
    if(confirm(`Tem certeza que deseja EXCLUIR a sessão ${id}?`)) {
        await fetch(`/api/v1/ops/sessions/${id}`, { method: 'DELETE' });
        setTimeout(loadSessions, 500);
    }
}

function showCreateModal() {
    document.getElementById('createModal').classList.add('active');
    document.getElementById('newSessionId').value = '';
}

function closeCreateModal() {
    document.getElementById('createModal').classList.remove('active');
}

async function createSession() {
    const id = document.getElementById('newSessionId').value.trim();
    if(!id) return alert('Informe um ID.');

    try {
        const res = await fetch('/api/v1/ops/sessions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId: id })
        });
        const data = await res.json();

        if (data.status === 'success') {
            closeCreateModal();
            loadSessions();
            setTimeout(() => { connectSession(id); }, 1000);
        } else {
            alert(data.message || 'Erro ao criar sessão');
        }
    } catch(e) { alert('Erro de rede'); }
}

let activeQrSession = null;
function openQrModal(id) {
    activeQrSession = id;
    document.getElementById('qrSessionId').textContent = `Sessão: ${id}`;
    document.getElementById('qrStatus').textContent = 'Aguardando QR via WebSocket...';
    document.getElementById('qrcode').innerHTML = '<div class="qr-placeholder">Aguardando...</div>';
    document.getElementById('qrModal').classList.add('active');

    // Fallback caso o WebSocket falhe
    setTimeout(async () => {
        if (!qrCodeObj && activeQrSession === id) {
            try {
                const res = await fetch(`/api/v1/ops/sessions/${id}/qr-current`);
                const data = await res.json();

                if (data.status === 'success' && data.data && data.data.qr) {
                    const qrContainer = document.getElementById('qrcode');
                    qrContainer.innerHTML = '';
                    document.getElementById('qrStatus').textContent = 'Escaneie o código (Recuperado via Fallback)';
                    qrCodeObj = new QRCode(qrContainer, {
                        text: data.data.qr,
                        width: 256,
                        height: 256,
                        colorDark : "#000000",
                        colorLight : "#ffffff",
                        correctLevel : QRCode.CorrectLevel.M
                    });
                } else {
                    document.getElementById('qrStatus').textContent = 'QR ainda não gerado, tente reconectar';
                }
            } catch(e) {
                console.error('[Ops WS] Erro ao buscar QR fallback', e);
            }
        }
    }, 3000);
}

function closeQrModal() {
    document.getElementById('qrModal').classList.remove('active');
    activeQrSession = null;
    qrCodeObj = null;
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
    const ws = new WebSocket(`${protocol}//${window.location.host}/ops/ws?token=${token}`);

    ws.onopen = () => {
        console.log('[Ops WS] Conectado ao WebSocket');
        const headerTitle = document.querySelector('.topbar h1');
        if (headerTitle) {
            headerTitle.innerHTML = 'Sessões WhatsApp <span class="badge badge-success" style="font-size: 0.5em; vertical-align: middle;">WS Online</span>';
        }
    };

    ws.onmessage = (event) => {
        try {
            const payload = JSON.parse(event.data);
            if (payload.event && payload.event.startsWith('session.')) {
                loadSessions();
            }
            if (payload.event === 'qr.generated' && activeQrSession === payload.sessionId) {
                const qrContainer = document.getElementById('qrcode');
                qrContainer.innerHTML = '';
                document.getElementById('qrStatus').textContent = 'Escaneie o código';
                try {
                    qrCodeObj = new QRCode(qrContainer, {
                        text: payload.qr,
                        width: 256,
                        height: 256,
                        colorDark : "#000000",
                        colorLight : "#ffffff",
                        correctLevel : QRCode.CorrectLevel.M
                    });
                } catch (qrErr) {
                    console.error('[Ops WS] Erro ao renderizar QR', qrErr);
                    document.getElementById('qrStatus').textContent = 'Erro ao renderizar QR. Verifique o console.';
                }
            }
            if (payload.event === 'session.connected' && activeQrSession === payload.sessionId) {
                document.getElementById('qrStatus').textContent = 'CONECTADO!';
                setTimeout(closeQrModal, 1500);
            }
        } catch(e) {
            console.error('[Ops WS] Erro ao processar mensagem do WebSocket', e);
        }
    };
    ws.onclose = () => {
        console.warn('[Ops WS] WebSocket desconectado. Tentando reconectar...');
        const headerTitle = document.querySelector('.topbar h1');
        if (headerTitle) {
            headerTitle.innerHTML = 'Sessões WhatsApp <span class="badge badge-danger" style="font-size: 0.5em; vertical-align: middle;">WS Offline</span>';
        }
        setTimeout(() => connectWebSocket(token), 3000);
    };
}
