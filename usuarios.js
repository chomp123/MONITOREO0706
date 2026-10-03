'use strict';
// ARGOS · Administración de usuarios en lenguaje sencillo (vista de prueba).
// Sustituye en index.html: loadUsers, openUserModal, closeUserModal, saveUser, adminResetPassword,
// adminToggleUser, adminDeleteUser, adminCloseSession, adminResetTour, loadActivity,
// renderActivityLog, exportActivityCSV y loadSessions.
// Usa incNode/confirmButton de incidentes.js. Sin confirm()/prompt() y sin innerHTML con datos.
// Las reglas definitivas (no modificar la propia cuenta, dejar un administrador activo) las aplica el backend;
// la interfaz solo evita ofrecer acciones que el backend rechazaría.

const USR_ROLES = { visualizador: 'Visualizador', operador: 'Operador', admin: 'Administrador' };
let usrData = [];
let usrFilter = 'todos';
let usrSearch = '';
let usrError = '';
let usrUsernameTouched = false;
let usrOpener = null;
let usrSaving = false;
let editingUsername = null;

function usrFecha(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d : null;
}
function usrRelativo(iso) {
  const d = usrFecha(iso);
  if (!d) return null;
  const min = Math.floor((Date.now() - d.getTime()) / 60000);
  if (min < 1) return 'hace un momento';
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const days = Math.floor(h / 24);
  if (days < 7) return `hace ${days} día${days > 1 ? 's' : ''}`;
  return d.toLocaleDateString('es-PY', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Asuncion' });
}
function usrIniciales(u) {
  const parts = String(u.name || u.username || '?').replace(/\(.*?\)/g, '').trim().split(/\s+/).filter(Boolean);
  return ((parts[0] || '?')[0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}
function usrChip(text, cls) { return incNode('span', { class: 'incx-chip ' + cls, text }); }
function usrMsg(text, type = 'ok') {
  const el = document.getElementById('admin-msg');
  if (!el) return;
  el.textContent = text;
  el.className = 'admin-msg ' + (type === 'ok' ? 'ok' : 'err');
  clearTimeout(usrMsg.t);
  usrMsg.t = setTimeout(() => { el.className = 'admin-msg'; }, 6000);
}
function showAdminMsg(text, type = 'ok') { usrMsg(String(text).replace(/^[✅❌]\s*/u, ''), type); }
async function usrRequest(path, method, body) {
  const res = await fetch(`${BACKEND_URL}${path}`, {
    method, headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await leerJson(res);
  if (!res.ok || data.ok === false) throw new Error(res.status === 401 ? 'Tu sesión expiró. Vuelve a ingresar.' : (data.error || 'No se pudo completar la acción.'));
  return data;
}

// ── Lista de usuarios ─────────────────────────────────────────────────────
async function loadUsers() {
  try {
    const res = await fetch(`${BACKEND_URL}/api/users`, { headers: { 'Authorization': `Bearer ${token}` } });
    const list = await leerJson(res);
    if (!res.ok || !Array.isArray(list)) throw new Error(list.error || 'No se pudo cargar la lista de usuarios.');
    usrData = list; usrError = '';
  } catch (e) {
    usrError = e.message === 'Failed to fetch' ? 'Sin conexión con el servidor.' : e.message;
  }
  renderUsers();
}
function renderUsers() {
  const list = document.getElementById('users-list');
  if (!list) return;
  list.replaceChildren();
  if (usrError) {
    list.append(incNode('div', { class: 'incx-error', role: 'alert' }, incNode('strong', { text: usrError }),
      incNode('button', { type: 'button', class: 'incx-btn incx-btn-primary', text: 'Reintentar', onclick: loadUsers })));
    return;
  }
  const q = ArgosText(usrSearch);
  const shown = usrData
    .filter(u => usrFilter === 'todos' || (usrFilter === 'activos' ? u.activo : !u.activo))
    .filter(u => !q || ArgosText(`${u.name} ${u.username}`).includes(q))
    .sort((a, b) => (b.username === userName) - (a.username === userName) || (b.activo - a.activo) || String(a.name || a.username).localeCompare(String(b.name || b.username), 'es'));
  const count = document.getElementById('usrx-count');
  if (count) count.textContent = shown.length === usrData.length ? `${usrData.length} usuarios` : `Mostrando ${shown.length} de ${usrData.length}`;
  if (!shown.length) {
    list.append(incNode('div', { class: 'incx-empty' }, incNode('strong', { text: usrData.length ? 'Nadie coincide con la búsqueda.' : 'Todavía no hay usuarios.' })));
    return;
  }
  const activeAdmins = usrData.filter(u => u.role === 'admin' && u.activo).length;
  for (const u of shown) list.append(usrCard(u, activeAdmins));
}
function usrCard(u, activeAdmins) {
  const self = u.username === userName;
  const lastAdmin = u.role === 'admin' && u.activo && activeAdmins <= 1;
  const last = usrRelativo(u.lastLogin);
  const chips = incNode('div', { class: 'incx-chips' },
    usrChip(USR_ROLES[u.role] || u.role, 'usrx-role usrx-role-' + (USR_ROLES[u.role] ? u.role : 'otro')),
    u.activo ? (u.enLinea ? usrChip('En línea', 'usrx-online') : usrChip('Activo', 'incx-estado-cerrado')) : usrChip('Desactivado', 'incx-estado-otro'),
    u.mustChangePassword ? usrChip('Debe cambiar su contraseña', 'incx-estado-detectado') : null,
    self ? usrChip('Tu cuenta', 'usrx-self') : null);

  const name = u.name || u.username;
  let actions;
  if (self) {
    actions = incNode('div', { class: 'usrx-actions' },
      incNode('button', { type: 'button', class: 'incx-btn', text: 'Cambiar mi contraseña', onclick: () => openPasswordModal() }),
      incNode('span', { class: 'incx-muted usrx-self-note', text: 'Otro administrador debe cambiar tu nombre, rol o estado.' }));
  } else {
    const menu = incNode('details', { class: 'usrx-menu' },
      incNode('summary', { class: 'incx-btn', 'aria-label': 'Más acciones para ' + name, text: 'Más acciones' }));
    const items = incNode('div', { class: 'usrx-menu-list' },
      confirmButton('Generar contraseña temporal', 'Se cerrarán sus sesiones y deberá cambiarla al ingresar. ¿Continuar?', () => adminResetPassword(u.username, name), 'incx-btn usrx-menu-item'),
      u.enLinea ? confirmButton('Cerrar sus sesiones', `¿Cerrar las sesiones de ${name}?`, () => adminCloseSession(u.username), 'incx-btn usrx-menu-item') : null,
      incNode('button', { type: 'button', class: 'incx-btn usrx-menu-item', text: 'Mostrar de nuevo el recorrido guiado', onclick: () => adminResetTour(u.username) }),
      lastAdmin
        ? incNode('p', { class: 'incx-muted usrx-menu-note', text: 'No se puede desactivar ni eliminar: es el único administrador activo.' })
        : confirmButton(u.activo ? 'Desactivar cuenta' : 'Activar cuenta',
            u.activo ? `${name} no podrá entrar hasta que se reactive. ¿Desactivar?` : `¿Permitir de nuevo el ingreso de ${name}?`,
            () => adminToggleUser(u.username, u.activo), 'incx-btn usrx-menu-item'),
      lastAdmin ? null : confirmButton('Eliminar usuario', `¿Eliminar a ${name}? No se puede deshacer. Si solo debe dejar de entrar, desactívalo.`,
        () => adminDeleteUser(u.username, name), 'incx-btn usrx-menu-item incx-btn-danger-soft'));
    menu.append(items);
    menu.addEventListener('toggle', () => {
      if (menu.open) document.querySelectorAll('.usrx-menu[open]').forEach(m => { if (m !== menu) m.open = false; });
    });
    actions = incNode('div', { class: 'usrx-actions' },
      incNode('button', { type: 'button', class: 'incx-btn', text: 'Editar', 'aria-label': 'Editar a ' + name, onclick: e => openUserModal(u.username, u.name, u.role, e.currentTarget) }),
      menu);
  }
  return incNode('article', { class: 'usrx-card' + (u.activo ? '' : ' usrx-inactive') },
    incNode('span', { class: 'usrx-avatar', 'aria-hidden': 'true', text: usrIniciales(u) }),
    incNode('div', { class: 'usrx-main' },
      incNode('strong', { class: 'usrx-name', text: name }),
      incNode('span', { class: 'usrx-username', text: '@' + u.username }),
      chips,
      incNode('span', { class: 'incx-muted usrx-last', text: last ? `Último ingreso: ${last}` : 'Nunca ingresó' })),
    actions);
}

// ── Contraseña temporal en pantalla (sustituye a window.prompt) ───────────
function mostrarSecreto(titulo, texto, password) {
  const box = document.getElementById('usrx-secret');
  if (!box) return;
  const code = incNode('code', { class: 'usrx-secret-code', text: password, tabindex: '0' });
  const copyBtn = incNode('button', { type: 'button', class: 'incx-btn', text: 'Copiar', onclick: async () => {
    try { await navigator.clipboard.writeText(password); copyBtn.textContent = 'Copiada'; }
    catch { const r = document.createRange(); r.selectNodeContents(code); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); copyBtn.textContent = 'Seleccionada: usa Ctrl+C'; }
  } });
  box.replaceChildren(
    incNode('div', {}, incNode('strong', { text: titulo }), incNode('p', { class: 'incx-muted', text: texto })),
    incNode('div', { class: 'usrx-secret-row' }, code, copyBtn),
    incNode('button', { type: 'button', class: 'incx-btn incx-btn-primary', text: 'Ya la entregué, ocultar', onclick: () => { box.hidden = true; box.replaceChildren(); } }));
  box.hidden = false;
  box.scrollIntoView({ block: 'nearest' });
  code.focus();
}

// ── Acciones ──────────────────────────────────────────────────────────────
async function adminResetPassword(username, nombre) {
  try {
    const data = await usrRequest('/api/reset-password', 'POST', { username });
    if (data.temporaryPassword) mostrarSecreto(`Contraseña temporal de ${nombre}`,
      'Entrégala en persona o por un canal seguro. Se muestra una sola vez; al ingresar deberá cambiarla.', data.temporaryPassword);
    else usrMsg(`Se generó una contraseña temporal para ${nombre}.`);
    loadUsers();
  } catch (e) { usrMsg(e.message, 'err'); }
}
async function adminToggleUser(username, activo) {
  try {
    const data = await usrRequest('/admin/usuarios/toggle', 'PUT', { username });
    const on = data.activo ?? !activo;
    usrMsg(on ? `Cuenta ${username} activada.` : `Cuenta ${username} desactivada. Ya no puede ingresar.`);
    loadUsers();
  } catch (e) { usrMsg(e.message, 'err'); }
}
async function adminDeleteUser(username, nombre) {
  try { await usrRequest('/admin/usuarios/eliminar', 'DELETE', { username }); usrMsg(`${nombre} fue eliminado.`); loadUsers(); }
  catch (e) { usrMsg(e.message, 'err'); }
}
async function adminCloseSession(username) {
  try {
    await usrRequest('/admin/usuarios/cerrar-sesion', 'POST', { username });
    usrMsg(`Se cerraron las sesiones de ${username}.`);
    loadUsers();
    if (document.getElementById('admin-tab-sesiones')?.classList.contains('active')) loadSessions();
  } catch (e) { usrMsg(e.message, 'err'); }
}
async function adminResetTour(username) {
  try { await usrRequest('/admin/reset-tour', 'POST', { username }); usrMsg(`${username} verá el recorrido guiado en su próximo ingreso.`); }
  catch (e) { usrMsg(e.message, 'err'); }
}

// ── Formulario agregar/editar ─────────────────────────────────────────────
function usrSugerirUsuario(nombre) {
  const parts = ArgosText(nombre).replace(/\(.*?\)/g, ' ').replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
  if (!parts.length) return '';
  const base = parts.length > 1 ? parts[0][0] + parts[parts.length - 1] : parts[0];
  let candidate = base.slice(0, 40), n = 2;
  while (usrData.some(u => u.username === candidate)) candidate = base.slice(0, 40) + n++;
  return candidate;
}
function usrGenerarPassword() {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint32Array(16));
  const chars = Array.from(bytes, b => abc[b % abc.length]).join('');
  return chars.match(/.{4}/g).join('-');
}
function usrRol() { return document.querySelector('input[name="mu-role"]:checked')?.value || 'visualizador'; }
function usrModo() { return document.querySelector('input[name="mu-pwd-mode"]:checked')?.value || 'auto'; }
function openUserModal(username, name, role, opener) {
  editingUsername = username || null;
  const isEdit = !!username;
  const form = document.getElementById('usrx-form');
  form.reset();
  ['mu-name', 'mu-username', 'mu-password'].forEach(id => setFieldError(id, ''));
  usrUsernameTouched = isEdit;
  document.getElementById('modal-user-title').textContent = isEdit ? 'Editar usuario' : 'Agregar usuario';
  document.getElementById('mu-subtitle').textContent = isEdit ? 'Cambia el nombre o lo que puede hacer esta persona.' : 'La persona podrá entrar a ARGOS con estos datos.';
  document.getElementById('mu-name').value = name || '';
  const user = document.getElementById('mu-username');
  user.value = username || '';
  user.readOnly = isEdit;
  document.getElementById('mu-username-hint').textContent = isEdit ? 'El usuario para ingresar no se puede cambiar.' : 'Solo minúsculas, números y guion bajo. Se sugiere a partir del nombre.';
  const radio = document.querySelector(`input[name="mu-role"][value="${USR_ROLES[role] ? role : 'visualizador'}"]`);
  if (radio) radio.checked = true;
  document.getElementById('mu-pwd-field').hidden = isEdit;
  document.getElementById('mu-pwd-manual').hidden = true;
  document.getElementById('mu-edit-note').hidden = !isEdit;
  document.getElementById('modal-user-msg').textContent = '';
  usrSetSaving(false);
  usrOpener = opener instanceof Element ? opener : document.activeElement;
  document.getElementById('modal-user').classList.add('open');
  setTimeout(() => document.getElementById('mu-name').focus(), 30);
}
function closeUserModal() {
  if (usrSaving) return;
  document.getElementById('modal-user').classList.remove('open');
  editingUsername = null;
  if (usrOpener && document.contains(usrOpener)) usrOpener.focus();
}
function usrSetSaving(saving) {
  usrSaving = saving;
  const btn = document.getElementById('btn-save-user');
  btn.disabled = saving;
  btn.textContent = saving ? 'Guardando…' : (editingUsername ? 'Guardar cambios' : 'Agregar usuario');
  document.getElementById('mu-cancel').disabled = saving;
}
function usrValidar() {
  const errores = [];
  const nombre = document.getElementById('mu-name').value.trim();
  const nameErr = !nombre ? 'Escribe el nombre de la persona.' : nombre.length > 200 ? 'El nombre es demasiado largo.' : '';
  setFieldError('mu-name', nameErr); if (nameErr) errores.push('mu-name');
  if (!editingUsername) {
    const username = document.getElementById('mu-username').value.trim();
    const userErr = !username ? 'Escribe un usuario.' : !/^[a-z0-9_]+$/.test(username) ? 'Usa solo minúsculas sin tildes, números y guion bajo (_).' :
      username.length > 50 ? 'Máximo 50 caracteres.' : usrData.some(u => u.username === username) ? 'Ese usuario ya existe. Elige otro.' : '';
    setFieldError('mu-username', userErr); if (userErr) errores.push('mu-username');
    if (usrModo() === 'manual') {
      const pw = document.getElementById('mu-password').value;
      const pwErr = pw.length < 12 ? 'La contraseña debe tener al menos 12 caracteres.' : new TextEncoder().encode(pw).length > 72 ? 'La contraseña es demasiado larga.' : '';
      setFieldError('mu-password', pwErr); if (pwErr) errores.push('mu-password');
    }
  }
  return errores;
}
async function saveUser(event) {
  event?.preventDefault?.();
  if (usrSaving) return;
  const msg = document.getElementById('modal-user-msg');
  msg.textContent = '';
  const errores = usrValidar();
  if (errores.length) { msg.textContent = errores.length === 1 ? 'Revisa el campo marcado.' : `Revisa los ${errores.length} campos marcados.`; document.getElementById(errores[0]).focus(); return; }
  const nombre = document.getElementById('mu-name').value.trim();
  const rol = usrRol();
  const isEdit = !!editingUsername;
  const username = isEdit ? editingUsername : document.getElementById('mu-username').value.trim();
  const auto = !isEdit && usrModo() === 'auto';
  const password = isEdit ? null : (auto ? usrGenerarPassword() : document.getElementById('mu-password').value);
  usrSetSaving(true);
  try {
    if (isEdit) await usrRequest('/admin/usuarios/editar', 'PUT', { username, nombre, rol });
    else await usrRequest('/admin/usuarios/crear', 'POST', { username, nombre, rol, password });
    usrSetSaving(false);
    closeUserModal();
    if (isEdit) usrMsg(`Se guardaron los cambios de ${nombre}.`);
    else if (auto) mostrarSecreto(`${nombre} ya puede ingresar como «${username}»`,
      'Esta es su contraseña inicial. Entrégala en persona o por un canal seguro y pídele que la cambie al ingresar. No se volverá a mostrar.', password);
    else usrMsg(`${nombre} ya puede ingresar como «${username}» con la contraseña que escribiste.`);
    loadUsers();
  } catch (e) {
    msg.textContent = e.message === 'Failed to fetch' ? 'Sin conexión con el servidor. Intenta de nuevo.' : e.message;
  } finally {
    if (usrSaving) usrSetSaving(false);
  }
}

// ── Actividad ─────────────────────────────────────────────────────────────
const ACT_LABELS = {
  LOGIN_OK: ['ingreso', 'Ingresó a ARGOS'], LOGIN_FALLIDO: ['alerta', 'Intento de ingreso fallido'], CUENTA_BLOQUEADA: ['alerta', 'Cuenta bloqueada'],
  CREAR_USUARIO: ['usuarios', 'Agregó un usuario'], EDITAR_USUARIO: ['usuarios', 'Editó un usuario'], EDIT_USUARIO: ['usuarios', 'Editó un usuario'],
  TOGGLE_USUARIO: ['usuarios', 'Activó o desactivó una cuenta'], ELIMINAR_USUARIO: ['usuarios', 'Eliminó un usuario'], DELETE_USUARIO: ['usuarios', 'Eliminó un usuario'],
  RESET_PASSWORD: ['usuarios', 'Generó una contraseña temporal'], RESET_USUARIO: ['usuarios', 'Generó una contraseña temporal'],
  CERRAR_SESION_REMOTA: ['usuarios', 'Cerró las sesiones de alguien'], CAMBIO_PASSWORD: ['usuarios', 'Cambió su contraseña'],
  CREAR_INCIDENTE: ['incidentes', 'Registró un incidente'], REPORTAR_INCIDENTE: ['incidentes', 'Envió un reporte'],
};
function actInfo(accion) {
  const a = String(accion || '');
  if (ACT_LABELS[a]) return ACT_LABELS[a];
  if (a.includes('INCIDENTE')) return ['incidentes', a.replace(/_/g, ' ').toLowerCase()];
  if (a.includes('USUARIO')) return ['usuarios', a.replace(/_/g, ' ').toLowerCase()];
  return ['otros', a.replace(/_/g, ' ').toLowerCase() || '—'];
}
async function loadActivity() {
  const tbody = document.getElementById('activity-tbody');
  try {
    const res = await fetch(`${BACKEND_URL}/admin/logs`, { headers: { 'Authorization': `Bearer ${token}` } });
    const data = await leerJson(res);
    if (!res.ok || !Array.isArray(data)) throw new Error(data.error || 'No se pudo cargar la actividad.');
    adminActivityData = data;
    const sel = document.getElementById('act-filter-user');
    const cur = sel.value;
    sel.replaceChildren(incNode('option', { value: '', text: 'Todas las personas' }),
      ...[...new Set(data.map(e => e.usuario))].sort().map(u => incNode('option', { value: u, text: u, selected: u === cur })));
    renderActivityLog();
  } catch (e) {
    if (tbody) tbody.replaceChildren(incNode('tr', {}, incNode('td', { colspan: '4', class: 'usrx-td-error', text: e.message })));
  }
}
function renderActivityLog() {
  const fUser = document.getElementById('act-filter-user')?.value || '';
  const fTipo = document.getElementById('act-filter-tipo')?.value || '';
  const tbody = document.getElementById('activity-tbody');
  if (!tbody) return;
  const rows = adminActivityData.filter(e => (!fUser || e.usuario === fUser) && (!fTipo || actInfo(e.accion)[0] === fTipo)).slice(0, 200);
  tbody.replaceChildren(...rows.map(e => {
    const [cat, label] = actInfo(e.accion);
    const d = usrFecha(e.timestamp);
    return incNode('tr', { class: 'usrx-act-' + cat },
      incNode('td', { class: 'usrx-when', text: d ? d.toLocaleString('es-PY', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Asuncion' }) : '—' }),
      incNode('td', { text: e.usuario || '—' }),
      incNode('td', { title: e.accion || '', text: label }),
      incNode('td', { class: 'incx-muted', text: e.detalle || '' }));
  }));
  if (!rows.length) tbody.append(incNode('tr', {}, incNode('td', { colspan: '4', class: 'incx-muted', text: 'No hay actividad con estos filtros.' })));
}
async function exportActivityCSV() {
  try {
    const res = await fetch(`${BACKEND_URL}/admin/logs/exportar`, { headers: { 'Authorization': `Bearer ${token}` } });
    if (!res.ok) throw new Error((await leerJson(res)).error || 'No se pudo exportar la actividad.');
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `argos-actividad-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  } catch (e) { showToast(e.message, 'error'); }
}

// ── Conectados ahora ──────────────────────────────────────────────────────
async function loadSessions() {
  const wrap = document.getElementById('sessions-wrap');
  if (!wrap) return;
  try {
    const res = await fetch(`${BACKEND_URL}/admin/usuarios/sesiones`, { headers: { 'Authorization': `Bearer ${token}` } });
    const data = await leerJson(res);
    if (!res.ok || !Array.isArray(data)) throw new Error(data.error || 'No se pudieron cargar las sesiones.');
    const online = data.filter(u => u.enLinea);
    if (!online.length) { wrap.replaceChildren(incNode('div', { class: 'incx-empty', text: 'No hay nadie conectado en este momento.' })); return; }
    wrap.replaceChildren(...online.map(u => {
      const name = u.name || u.username;
      const self = u.username === userName;
      return incNode('article', { class: 'usrx-card' },
        incNode('span', { class: 'usrx-avatar', 'aria-hidden': 'true', text: usrIniciales(u) }),
        incNode('div', { class: 'usrx-main' },
          incNode('strong', { class: 'usrx-name', text: name }),
          incNode('div', { class: 'incx-chips' }, usrChip(USR_ROLES[u.role] || u.role, 'usrx-role usrx-role-' + u.role), usrChip('En línea', 'usrx-online'), self ? usrChip('Tú', 'usrx-self') : null),
          incNode('span', { class: 'incx-muted usrx-last', text: 'Última actividad: ' + (usrRelativo(u.lastActivity) || 'sin datos') })),
        self ? incNode('span', { class: 'incx-muted', text: 'Esta sesión' })
             : incNode('div', { class: 'usrx-actions' }, confirmButton('Cerrar sus sesiones', `¿Cerrar las sesiones de ${name}?`, () => adminCloseSession(u.username))));
    }));
  } catch (e) {
    wrap.replaceChildren(incNode('div', { class: 'incx-error', role: 'alert' }, incNode('strong', { text: e.message }),
      incNode('button', { type: 'button', class: 'incx-btn', text: 'Reintentar', onclick: loadSessions })));
  }
}

// ── Eventos ───────────────────────────────────────────────────────────────
(function initUsuariosUI() {
  document.getElementById('usrx-form')?.addEventListener('submit', saveUser);
  const name = document.getElementById('mu-name'), user = document.getElementById('mu-username');
  document.getElementById('usrx-form')?.addEventListener('input', () => { document.getElementById('modal-user-msg').textContent = ''; });
  name?.addEventListener('input', () => {
    setFieldError('mu-name', '');
    if (!editingUsername && !usrUsernameTouched) { user.value = usrSugerirUsuario(name.value); setFieldError('mu-username', ''); }
  });
  user?.addEventListener('input', () => {
    usrUsernameTouched = user.value.trim() !== '';
    const pos = user.selectionStart;
    const clean = user.value.toLowerCase().replace(/\s+/g, '_');
    if (clean !== user.value) { user.value = clean; try { user.setSelectionRange(pos, pos); } catch {} }
    setFieldError('mu-username', '');
  });
  document.querySelectorAll('input[name="mu-pwd-mode"]').forEach(r => r.addEventListener('change', () => {
    const manual = usrModo() === 'manual';
    document.getElementById('mu-pwd-manual').hidden = !manual;
    if (manual) document.getElementById('mu-password').focus();
  }));
  document.getElementById('mu-password')?.addEventListener('input', () => setFieldError('mu-password', ''));
  const toggle = document.getElementById('mu-password-toggle');
  toggle?.addEventListener('click', () => {
    const pw = document.getElementById('mu-password');
    const show = pw.type === 'password';
    pw.type = show ? 'text' : 'password';
    toggle.textContent = show ? 'Ocultar' : 'Mostrar';
    toggle.setAttribute('aria-pressed', String(show));
  });
  document.getElementById('modal-user')?.addEventListener('mousedown', e => { if (e.target === e.currentTarget) closeUserModal(); });
  const search = document.getElementById('usrx-search');
  search?.addEventListener('input', () => { usrSearch = search.value; renderUsers(); });
  document.getElementById('usrx-filter')?.addEventListener('click', e => {
    const btn = e.target.closest('[data-filter]'); if (!btn) return;
    usrFilter = btn.dataset.filter;
    document.querySelectorAll('#usrx-filter [data-filter]').forEach(b => b.setAttribute('aria-pressed', String(b === btn)));
    renderUsers();
  });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    const open = document.querySelector('.usrx-menu[open]');
    if (open) { open.open = false; open.querySelector('summary')?.focus(); return; }
    if (document.getElementById('modal-user')?.classList.contains('open')) closeUserModal();
  });
  document.addEventListener('click', e => {
    const path = e.composedPath();
    document.querySelectorAll('.usrx-menu[open]').forEach(m => { if (!path.includes(m)) m.open = false; });
  });
})();
