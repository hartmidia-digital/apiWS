
async function checkOpsAuth() {
    try {
        const response = await fetch('/admin/me');
        if (!response.ok) { window.location.href = '/admin/login.html'; return null; }
        const data = await response.json();
        if (data.status === 'success' && data.data && data.data.role === 'admin') {
            document.getElementById('userEmailDisplay').textContent = data.data.email;
            return data.data;
        } else {
            document.body.innerHTML = '<h1>Acesso Negado</h1><p>Somente administradores.</p><a href="/admin/dashboard.html">Voltar</a>';
            return null;
        }
    } catch (e) { window.location.href = '/admin/login.html'; return null; }
}
async function doLogout() {
    try {
        await fetch('/admin/logout', { method: 'POST' });
        window.location.href = '/admin/login.html';
    } catch (e) { console.error('Logout error', e); }
}
