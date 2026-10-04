'use strict';
// ARGOS · Formularios y detalle de incidentes en lenguaje sencillo.
// Sustituye a las versiones anteriores de index.html (openCrearIncidente, saveIncidente,
// renderIncidentes, openDetalleIncidente, renderDetalleIncidente, eliminarIncidente).
// Todo el contenido variable se inserta con textContent/atributos, nunca con innerHTML.
// Las herramientas avanzadas se conservan dentro de «Herramientas avanzadas».

const INC_TIPOS = [
  { value: 'Violencia',       help: 'Agresiones, amenazas o disturbios' },
  { value: 'Compra de votos', help: 'Ofrecer dinero o bienes a cambio del voto' },
  { value: 'Acarreo',         help: 'Traslado organizado de votantes' },
  { value: 'Fraude',          help: 'Alteración de actas, padrones o resultados' },
  { value: 'Irregularidad',   help: 'Fallas en el local o en el procedimiento' },
  { value: 'Otro',            help: 'Otro hecho, o no estás seguro' },
];
const INC_ESTADOS = {
  detectado:  { label: 'Por verificar', help: 'Se recibió el reporte. Falta confirmar que el hecho ocurrió.' },
  verificado: { label: 'Verificado',    help: 'Se confirmó el hecho. Falta decidir si necesita intervención.' },
  escalado:   { label: 'Escalado',      help: 'Se derivó para intervención. Ciérralo cuando esté resuelto.' },
  cerrado:    { label: 'Cerrado',       help: 'El caso fue resuelto o descartado.' },
};
const INC_SIGUIENTE = {
  detectado:  { estado: 'verificado', label: 'Marcar como verificado', short: 'Verificar',
                help: 'Hazlo cuando confirmes que el hecho ocurrió (por ejemplo, con una segunda fuente o un contacto en el lugar).' },
  verificado: { estado: 'escalado', label: 'Escalar para intervención', short: 'Escalar',
                help: 'Hazlo si el hecho requiere la intervención de otra unidad o del mando.' },
  escalado:   { estado: 'cerrado', label: 'Cerrar incidente', short: 'Cerrar',
                help: 'Hazlo cuando el caso esté resuelto.' },
};
const INC_GRAVEDAD = { critico: 'Gravedad crítica', alto: 'Gravedad alta', medio: 'Gravedad media', info: 'Gravedad baja' };
const INC_PRIORIDADES = [['critica', 'Crítica'], ['alta', 'Alta'], ['media', 'Media'], ['baja', 'Baja']];
const INC_EV_TIPOS = { foto: 'Foto', video: 'Video', link: 'Enlace', captura: 'Captura', nota: 'Nota', rss: 'Noticia', web: 'Sitio web', social: 'Red social', red_social: 'Red social', oficial: 'Fuente oficial' };

let incSearch = '';
let detalleAdvancedOpen = false;
let detalleCambios = false;
let detalleRequest = 0;
let detalleOpener = null;
let crearOpener = null;
let crearEnviando = false;
let crearImagenes = [];

const incCanEdit = () => ['admin', 'operador'].includes(userRole);

// ── Utilidades DOM ────────────────────────────────────────────────────────
function incNode(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'value') node.value = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else if (key in node && typeof value !== 'string') node[key] = value;
    else node.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat()) if (child !== null && child !== undefined && child !== false) node.append(child);
  return node;
}
function incLugar(inc) {
  return [inc.local_votacion, inc.municipio || inc.lugar, inc.departamento].filter(Boolean).join(' · ');
}
function incFecha(iso) {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return 'Fecha desconocida';
  return date.toLocaleString('es-PY', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Asuncion' }) + ' · ' + formatTimeAgo(iso);
}
function incEstadoChip(estado) {
  const info = INC_ESTADOS[estado] || { label: estado || 'Sin estado' };
  return incNode('span', { class: 'incx-chip incx-estado-' + (INC_ESTADOS[estado] ? estado : 'otro'), text: info.label });
}
function incGravedadChip(inc) {
  const level = ArgosDomain.incidentLevel(inc);
  return incNode('span', { class: 'incx-chip incx-nivel-' + level, text: INC_GRAVEDAD[level] });
}
function nombreOperador(username) {
  if (!username) return 'Sin asignar';
  const op = (operadoresList || []).find(o => o.username === username);
  return op ? op.name : username;
}
async function leerJson(res) {
  try { return await res.json(); } catch { return {}; }
}

// ── Lista de incidentes ──────────────────────────────────────────────────
function incVisiblePorAntiguedad(inc, incluirAntiguos, now = Date.now()) {
  if (incluirAntiguos) return true;
  const fecha = new Date(inc.created_at).getTime();
  return !Number.isFinite(fecha) || fecha >= now - 48 * 3600000;
}
// Filtro de detenidos: estado '' (todos) | con | sin | por_confirmar; con «con», mínimo opcional (1-999).
// Un mínimo vacío o inválido se ignora en la lista y no se envía al servidor.
function incFiltroDetenidos() {
  const estado = document.getElementById('inc-filter-detenidos')?.value || '';
  const texto = (document.getElementById('inc-filter-min-detenidos')?.value || '').trim();
  const minimo = estado === 'con' && /^[1-9][0-9]{0,2}$/.test(texto) ? Number(texto) : null;
  return { estado, minimo };
}
function incCumpleDetenidos(inc, { estado, minimo }) {
  if (estado === 'sin') return inc.hubo_detenidos === false;
  if (estado === 'por_confirmar') return inc.hubo_detenidos !== true && inc.hubo_detenidos !== false;
  if (estado === 'con') return inc.hubo_detenidos === true && (Number(inc.cantidad_detenidos) || 0) >= (minimo || 1);
  return true;
}
function incDetenidosTexto(inc) {
  if (inc.hubo_detenidos !== true) return '';
  const n = Number(inc.cantidad_detenidos) || 0;
  return ` · ${n} detenido${n !== 1 ? 's' : ''}`;
}
function syncFiltroDetenidos() {
  const con = document.getElementById('inc-filter-detenidos')?.value === 'con';
  const min = document.getElementById('inc-filter-min-detenidos');
  if (min) { min.hidden = !con; if (!con) min.value = ''; }
  renderIncidentes();
}
function renderIncidentes() {
  const list = document.getElementById('inc-list');
  if (!list) return;
  const fDetenidos = incFiltroDetenidos();
  const fDept = (document.getElementById('inc-filter-dept')?.value || '').toLowerCase();
  const fTipo = (document.getElementById('inc-filter-tipo')?.value || '').toLowerCase();
  const q = ArgosText(incSearch);
  const incluirAntiguos = document.getElementById('inc-filter-periodo')?.value === 'todos';
  const filtered = incidentesData.filter(i =>
    incVisiblePorAntiguedad(i, incluirAntiguos) &&
    (incFiltroEstado === 'todos' || i.estado === incFiltroEstado) &&
    (!fDept || (i.departamento || '').toLowerCase() === fDept) &&
    (!fTipo || (i.tipo || '').toLowerCase() === fTipo) &&
    incCumpleDetenidos(i, fDetenidos) &&
    (!q || ArgosText([i.codigo, i.tipo, i.descripcion, i.lugar, i.municipio, i.departamento, i.local_votacion].join(' ')).includes(q))
  );
  const label = document.getElementById('inc-total-label');
  if (label) label.textContent = filtered.length === incidentesData.length
    ? `${incidentesData.length} incidente${incidentesData.length !== 1 ? 's' : ''}`
    : `Mostrando ${filtered.length} de ${incidentesData.length}`;

  list.replaceChildren();
  if (!filtered.length) {
    const hayFiltros = !incluirAntiguos || incFiltroEstado !== 'todos' || fDept || fTipo || fDetenidos.estado || q;
    list.append(incNode('div', { class: 'incx-empty' },
      incNode('strong', { text: hayFiltros ? 'No hay incidentes con estos filtros.' : 'Todavía no hay incidentes registrados.' }),
      hayFiltros ? incNode('button', { type: 'button', class: 'incx-link', text: 'Quitar filtros', onclick: limpiarFiltrosIncidentes }) : null));
    return;
  }
  const editor = incCanEdit();
  for (const inc of filtered) {
    const siguiente = INC_SIGUIENTE[inc.estado];
    const evCount = (Array.isArray(inc.fuentes) ? inc.fuentes.length : 0) + (Array.isArray(inc.evidencias) ? inc.evidencias.length : 0) + (Number(inc.attachment_count) || 0);
    const card = incNode('article', { class: 'incx-card incx-card-' + (inc.estado || 'otro') },
      incNode('button', { type: 'button', class: 'incx-card-main', 'aria-label': `Ver ${inc.codigo}: ${inc.tipo || 'incidente'}`,
          onclick: e => openDetalleIncidente(inc.codigo, e.currentTarget) },
        incNode('span', { class: 'incx-card-meta', text: `${inc.codigo} · ${formatTimeAgo(inc.created_at)}` }),
        incNode('strong', { class: 'incx-card-title', text: inc.tipo || 'Incidente reportado' }),
        incNode('span', { class: 'incx-card-desc', text: inc.descripcion || 'Sin descripción' }),
        incNode('span', { class: 'incx-card-place', text: incLugar(inc) || 'Ubicación por confirmar' })),
      incNode('div', { class: 'incx-card-side' },
        incNode('div', { class: 'incx-chips' }, incEstadoChip(inc.estado), incGravedadChip(inc)),
        incNode('span', { class: 'incx-card-small', text: `${evCount} prueba${evCount !== 1 ? 's' : ''} o fuente${evCount !== 1 ? 's' : ''} · ${nombreOperador(inc.responsable)}${incDetenidosTexto(inc)}` }),
        incNode('div', { class: 'incx-card-actions' },
          editor && siguiente && siguiente.estado !== 'cerrado'
            ? incNode('button', { type: 'button', class: 'incx-btn incx-btn-soft', text: siguiente.short, title: siguiente.label,
                onclick: () => cambiarEstadoIncidente(inc.codigo, siguiente.estado) })
            : null,
          incNode('button', { type: 'button', class: 'incx-btn', text: 'Ver detalle', onclick: e => openDetalleIncidente(inc.codigo, e.currentTarget) }))));
    list.append(card);
  }
}
function ArgosText(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
function limpiarFiltrosIncidentes() {
  incSearch = '';
  const search = document.getElementById('inc-search'); if (search) search.value = '';
  const periodo = document.getElementById('inc-filter-periodo'); if (periodo) periodo.value = 'todos';
  ['inc-filter-dept', 'inc-filter-tipo', 'inc-filter-detenidos', 'inc-filter-min-detenidos'].forEach(id => { const s = document.getElementById(id); if (s) s.value = ''; });
  const minDetenidos = document.getElementById('inc-filter-min-detenidos'); if (minDetenidos) minDetenidos.hidden = true;
  setIncFiltroEstado('todos');
}

// ── Formulario «Reportar incidente» ──────────────────────────────────────
function crearForm() { return document.getElementById('cinc-form'); }
function buildCrearIncidenteForm() {
  const tipos = document.getElementById('cinc-tipos');
  if (tipos && !tipos.childElementCount) {
    for (const t of INC_TIPOS) {
      tipos.append(incNode('label', { class: 'incx-option' },
        incNode('input', { type: 'radio', name: 'cinc-tipo', value: t.value }),
        incNode('span', {}, incNode('strong', { text: t.value === 'Otro' ? 'Otro / No sé' : t.value }), incNode('small', { text: t.help }))));
    }
  }
  const dept = document.getElementById('cinc-dept');
  if (dept && dept.options.length <= 1) for (const d of DEPARTAMENTOS_PY) dept.append(incNode('option', { value: d, text: d }));
}
function setFieldError(id, message) {
  const input = document.getElementById(id);
  const error = document.getElementById(id + '-error');
  if (input) { input.toggleAttribute('aria-invalid', !!message); if (message) input.setAttribute('aria-invalid', 'true'); }
  if (error) { error.textContent = message || ''; error.hidden = !message; }
}
function resetCrearIncidente() {
  const form = crearForm(); if (!form) return;
  limpiarCrearImagenes();
  form.reset();
  document.getElementById('cinc-confianza').value = '2';
  ['cinc-desc', 'cinc-evidencia', 'cinc-evidencias', 'cinc-fuentes', 'cinc-tipos', 'cinc-images', 'cinc-cantidad-detenidos'].forEach(id => setFieldError(id, ''));
  syncCrearDetenidos();
  updateDescCounter();
}
function openCrearIncidente(prefill = {}) {
  buildCrearIncidenteForm();
  const isPrefill = prefill && Object.keys(prefill).length > 0;
  const form = crearForm();
  const draft = form.dataset.draft === '1';
  if (isPrefill || !draft) resetCrearIncidente();
  if (isPrefill) {
    const tipo = [...form.querySelectorAll('input[name="cinc-tipo"]')].find(r => r.value === prefill.tipo);
    if (tipo) tipo.checked = true;
    if (prefill.descripcion) document.getElementById('cinc-desc').value = prefill.descripcion;
    if (prefill.lugar) document.getElementById('cinc-lugar').value = prefill.lugar;
    if (prefill.evidencia) document.getElementById('cinc-evidencia').value = prefill.evidencia;
  }
  const isViz = userRole === 'visualizador';
  document.getElementById('cinc-advanced').hidden = isViz;
  document.getElementById('cinc-viz-msg').hidden = !isViz;
  document.getElementById('cinc-draft-msg').hidden = !(draft && !isPrefill);
  document.getElementById('cinc-msg').textContent = '';
  document.getElementById('cinc-form-view').hidden = false;
  document.getElementById('cinc-done').hidden = true;
  setCrearEnviando(false);
  updateDescCounter();
  crearOpener = document.activeElement;
  document.getElementById('modal-crear-inc').classList.add('open');
  setTimeout(() => {
    const first = form.querySelector('input[name="cinc-tipo"]:checked') ? document.getElementById('cinc-desc') : form.querySelector('input[name="cinc-tipo"]');
    first?.focus();
  }, 30);
}
function closeCrearIncidente() {
  if (crearEnviando) return;
  const form = crearForm();
  const hasContent = form && !document.getElementById('cinc-form-view').hidden &&
    (['cinc-desc', 'cinc-lugar', 'cinc-evidencia'].some(id => document.getElementById(id).value.trim()) || crearImagenes.length > 0);
  if (form) form.dataset.draft = hasContent ? '1' : '';
  document.getElementById('modal-crear-inc').classList.remove('open');
  if (crearOpener && document.contains(crearOpener)) crearOpener.focus();
}
function descartarBorrador() {
  const form = crearForm(); form.dataset.draft = '';
  resetCrearIncidente();
  document.getElementById('cinc-draft-msg').hidden = true;
  form.querySelector('input[name="cinc-tipo"]')?.focus();
}
function updateDescCounter() {
  const desc = document.getElementById('cinc-desc'), counter = document.getElementById('cinc-desc-count');
  if (desc && counter) counter.textContent = `${desc.value.length} / 5000`;
}
function setCrearEnviando(sending) {
  crearEnviando = sending;
  const btn = document.getElementById('btn-save-inc');
  btn.disabled = sending;
  btn.textContent = sending ? 'Enviando…' : 'Enviar reporte';
  document.getElementById('cinc-cancel').disabled = sending;
  crearForm().setAttribute('aria-busy', sending ? 'true' : 'false');
}
function linksDesde(texto) {
  return String(texto || '').split('\n').map(s => s.trim()).filter(Boolean);
}
function syncCrearDetenidos() {
  const si=document.getElementById('cinc-hubo-detenidos')?.value==='si';
  const cantidad=document.getElementById('cinc-cantidad-detenidos');
  const datos=document.getElementById('cinc-datos-detenidos-row');
  if(cantidad)cantidad.disabled=!si;
  if(datos)datos.hidden=!si;
  if(!si)setFieldError('cinc-cantidad-detenidos','');
}
function limpiarCrearImagenes() {
  crearImagenes.forEach(image => { if (image.preview) URL.revokeObjectURL(image.preview); });
  crearImagenes = [];
  const input=document.getElementById('cinc-images');if(input)input.value='';
  renderCrearImagenes();
}
function renderCrearImagenes() {
  const preview=document.getElementById('cinc-image-preview');if(!preview)return;
  preview.replaceChildren(...crearImagenes.map((image,index)=>incNode('figure',{class:'incx-image-item'},
    incNode('img',{src:image.preview,alt:`Vista previa ${index+1}: ${image.file.name}`}),
    incNode('figcaption',{},incNode('span',{text:image.file.name}),incNode('button',{type:'button',class:'incx-image-remove','aria-label':`Quitar ${image.file.name}`,text:'Quitar',onclick:()=>{
      URL.revokeObjectURL(image.preview);crearImagenes.splice(index,1);renderCrearImagenes();
    }})))));
}
async function seleccionarCrearImagenes(event) {
  setFieldError('cinc-images','');
  const files=[...(event.target.files||[])];
  if(files.length>5){setFieldError('cinc-images','Puedes adjuntar hasta 5 imágenes.');event.target.value='';return;}
  const valid=[];
  for(const file of files){
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>5*1024*1024){setFieldError('cinc-images',`${file.name}: usa JPG, PNG o WebP de hasta 5 MB.`);event.target.value='';return;}
    try{const bitmap=await createImageBitmap(file);if(bitmap.width*bitmap.height>40000000){bitmap.close();throw Error('La imagen supera 40 megapíxeles.');}bitmap.close();}
    catch(error){setFieldError('cinc-images',`${file.name}: ${error.message||'no se pudo leer la imagen.'}`);event.target.value='';return;}
    valid.push({file,preview:URL.createObjectURL(file)});
  }
  crearImagenes.forEach(image=>URL.revokeObjectURL(image.preview));crearImagenes=valid;renderCrearImagenes();
}
function archivoBase64(file){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onerror=()=>reject(Error(`No se pudo leer ${file.name}`));reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.readAsDataURL(file);});}
function validarCrearIncidente() {
  const errores = [];
  const desc = document.getElementById('cinc-desc').value.trim();
  const descError = !desc ? 'Escribe qué pasó.' : desc.length < 10 ? 'Agrega un poco más de detalle (al menos 10 caracteres).' : desc.length > 5000 ? 'La descripción supera los 5000 caracteres.' : '';
  setFieldError('cinc-desc', descError); if (descError) errores.push('cinc-desc');
  const urlError = (value) => value && !ArgosDomain.safeUrl(value) ? 'El enlace debe empezar con http:// o https://' : '';
  const ev = document.getElementById('cinc-evidencia').value.trim();
  setFieldError('cinc-evidencia', urlError(ev)); if (urlError(ev)) errores.push('cinc-evidencia');
  const detenidos=document.getElementById('cinc-hubo-detenidos').value;
  const cantidad=document.getElementById('cinc-cantidad-detenidos').value.trim();
  const cantidadError=detenidos==='si'&&!/^[1-9][0-9]{0,2}$/.test(cantidad)?'Indica una cantidad entre 1 y 999.':'';
  setFieldError('cinc-cantidad-detenidos',cantidadError);if(cantidadError)errores.push('cinc-cantidad-detenidos');
  if (incCanEdit()) {
    for (const id of ['cinc-evidencias', 'cinc-fuentes']) {
      const lines = linksDesde(document.getElementById(id).value);
      const bad = lines.find(u => !ArgosDomain.safeUrl(u));
      const tooMany = lines.length > 29;
      const msg = bad ? `Este enlace no es válido: ${bad.slice(0, 80)}` : tooMany ? 'Máximo 29 enlaces.' : '';
      setFieldError(id, msg);
      if (msg) { errores.push(id); document.getElementById('cinc-advanced').open = true; }
    }
  }
  return errores;
}
async function saveIncidente(event) {
  event?.preventDefault?.();
  if (crearEnviando) return;
  const msg = document.getElementById('cinc-msg');
  msg.textContent = '';
  const errores = validarCrearIncidente();
  if (errores.length) {
    msg.textContent = errores.length === 1 ? 'Revisa el campo marcado.' : `Revisa los ${errores.length} campos marcados.`;
    document.getElementById(errores[0])?.focus();
    return;
  }
  const form = crearForm();
  const tipo = form.querySelector('input[name="cinc-tipo"]:checked')?.value || 'Otro';
  const descripcion = document.getElementById('cinc-desc').value.trim();
  const lugar = document.getElementById('cinc-lugar').value.trim();
  const departamento = document.getElementById('cinc-dept').value;
  const isViz = userRole === 'visualizador';
  const evPrincipal = ArgosDomain.safeUrl(document.getElementById('cinc-evidencia').value.trim());
  const huboDetenidos=document.getElementById('cinc-hubo-detenidos').value;
  const body = { tipo, descripcion, lugar, departamento, huboDetenidos };
  if(huboDetenidos==='si'){
    body.cantidadDetenidos=parseInt(document.getElementById('cinc-cantidad-detenidos').value,10);
    body.datosDetenidos=document.getElementById('cinc-datos-detenidos').value.trim();
  }
  if (evPrincipal) body.urlEvidencia = evPrincipal; // el backend lo usa para visualizadores
  if (!isViz) {
    body.confianza = parseInt(document.getElementById('cinc-confianza').value, 10);
    body.fuentes = linksDesde(document.getElementById('cinc-fuentes').value).map(u => ({ tipo: 'link', url: ArgosDomain.safeUrl(u), titulo: '' }));
    body.evidencias = [evPrincipal, ...linksDesde(document.getElementById('cinc-evidencias').value).map(u => ArgosDomain.safeUrl(u))]
      .filter(Boolean).map(u => ({ tipo: 'link', url: u, descripcion: '' }));
  }
  setCrearEnviando(true);
  try {
    body.images = await Promise.all(crearImagenes.map(async image=>({filename:image.file.name,mime:image.file.type,data:await archivoBase64(image.file)})));
    const res = await fetch(`${BACKEND_URL}/incidentes/crear`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    const data = await leerJson(res);
    if (!res.ok || !data.ok) throw new Error(res.status === 401 ? 'Tu sesión expiró. Vuelve a ingresar; tu texto sigue aquí.' : (data.error || 'No se pudo enviar el reporte. Tu texto sigue aquí; intenta de nuevo.'));
    form.dataset.draft = '';
    mostrarReporteEnviado(data.codigo, isViz);
    if (!isViz) addCronoEvent(`Nuevo incidente: ${tipo}`, lugar || departamento || '—', body.confianza >= 4 ? 'alto' : 'medio');
    if (departamento && typeof glowDept === 'function') { try { glowDept(departamento, body.confianza >= 4 ? 'critico' : 'alto'); } catch {} }
    loadIncidentes();
  } catch (e) {
    msg.textContent = e.message === 'Failed to fetch' ? 'Sin conexión con el servidor. Tu texto sigue aquí; intenta de nuevo.' : e.message;
  } finally {
    setCrearEnviando(false);
  }
}
function mostrarReporteEnviado(codigo, isViz) {
  document.getElementById('cinc-form-view').hidden = true;
  const done = document.getElementById('cinc-done');
  done.hidden = false;
  document.getElementById('cinc-done-title').textContent = codigo ? `Reporte ${codigo} enviado` : 'Reporte enviado';
  document.getElementById('cinc-done-text').textContent = isViz
    ? 'Gracias. Un operador lo revisará y confirmará si corresponde registrarlo oficialmente.'
    : 'El incidente quedó registrado como «Por verificar». El siguiente paso es confirmarlo.';
  const ver = document.getElementById('cinc-done-ver');
  ver.hidden = !codigo;
  ver.onclick = () => { document.getElementById('modal-crear-inc').classList.remove('open'); openDetalleIncidente(codigo, crearOpener); };
  document.getElementById('cinc-done-title').focus();
  resetCrearIncidente();
}
function reportarOtro() {
  document.getElementById('cinc-done').hidden = true;
  document.getElementById('cinc-form-view').hidden = false;
  document.getElementById('cinc-draft-msg').hidden = true;
  crearForm().querySelector('input[name="cinc-tipo"]')?.focus();
}

// ── Detalle de incidente ─────────────────────────────────────────────────
function detalleCargando(text) {
  return incNode('div', { class: 'incx-loading', role: 'status' }, incNode('span', { class: 'incx-spinner', 'aria-hidden': 'true' }), text);
}
async function openDetalleIncidente(codigo, opener) {
  const modal = document.getElementById('modal-detalle-inc');
  const body = document.getElementById('dm-body');
  const mismo = modal.classList.contains('open') && detalleIncidenteCodigo === codigo && body.dataset.loaded === codigo;
  if (!modal.classList.contains('open')) detalleOpener = opener instanceof Element ? opener : document.activeElement;
  if (mismo) detalleCambios = true; else detalleAdvancedOpen = false;
  detalleIncidenteCodigo = codigo;
  const request = ++detalleRequest;
  document.getElementById('dm-codigo').textContent = codigo;
  if (mismo) {
    body.setAttribute('aria-busy', 'true');
    document.getElementById('dm-refresh').hidden = false;
  } else {
    document.getElementById('dm-title').textContent = 'Cargando incidente…';
    document.getElementById('dm-tipo-lugar').textContent = '';
    const badge = document.getElementById('dm-estado-badge'); badge.replaceChildren(); badge.hidden = true;
    document.getElementById('dm-tools-btn').hidden = true;
    body.dataset.loaded = '';
    body.replaceChildren(detalleCargando('Cargando información del incidente…'));
  }
  if (!modal.classList.contains('open')) {
    modal.classList.add('open');
    setTimeout(() => document.getElementById('dm-close')?.focus(), 30);
  }
  try {
    const res = await fetch(`${BACKEND_URL}/incidentes/${encodeURIComponent(codigo)}`, { headers: { 'Authorization': `Bearer ${token}` } });
    const inc = await leerJson(res);
    if (request !== detalleRequest) return;
    if (!res.ok) throw new Error(res.status === 404 ? 'Este incidente ya no existe o fue eliminado.' : res.status === 401 ? 'Tu sesión expiró. Vuelve a ingresar.' : (inc.error || 'No se pudo cargar el incidente.'));
    if (!inc || inc.codigo !== codigo) throw new Error('El servidor devolvió una respuesta inesperada.');
    const idx = incidentesData.findIndex(i => i.codigo === codigo);
    if (idx >= 0) { incidentesData[idx] = { ...incidentesData[idx], ...inc }; renderIncidentes(); }
    renderDetalleIncidente(inc);
  } catch (e) {
    if (request !== detalleRequest) return;
    const message = e.message === 'Failed to fetch' ? 'Sin conexión con el servidor.' : e.message;
    if (mismo) { showToast(message + ' Se muestra la última información cargada.', 'error'); return; }
    document.getElementById('dm-title').textContent = 'No se pudo abrir el incidente';
    body.replaceChildren(incNode('div', { class: 'incx-error', role: 'alert' },
      incNode('strong', { text: message }),
      incNode('p', { text: 'Puedes intentarlo de nuevo. Si el problema continúa, avisa al administrador.' }),
      incNode('button', { type: 'button', class: 'incx-btn incx-btn-primary', text: 'Reintentar', onclick: () => openDetalleIncidente(codigo) })));
  } finally {
    if (request === detalleRequest) {
      body.removeAttribute('aria-busy');
      document.getElementById('dm-refresh').hidden = true;
    }
  }
}
function closeDetalleIncidente() {
  const modal = document.getElementById('modal-detalle-inc');
  if (!modal || !modal.classList.contains('open')) { detalleIncidenteCodigo = null; return; }
  modal.classList.remove('open');
  detalleIncidenteCodigo = null;
  detalleRequest++;
  if (detalleCambios) { detalleCambios = false; loadIncidentes(); }
  if (detalleOpener && document.contains(detalleOpener)) detalleOpener.focus();
  detalleOpener = null;
}
function seccion(title, ...children) {
  return incNode('section', { class: 'incx-section' }, incNode('h3', { text: title }), ...children);
}
function confirmButton(label, confirmLabel, onConfirm, cls = 'incx-btn') {
  // Confirmación en la misma pantalla (sin ventanas emergentes del navegador).
  const wrap = incNode('span', { class: 'incx-confirm' });
  const ask = incNode('button', { type: 'button', class: cls, text: label, onclick: () => {
    wrap.replaceChildren(
      incNode('span', { class: 'incx-confirm-q', text: confirmLabel }),
      incNode('button', { type: 'button', class: 'incx-btn incx-btn-danger', text: 'Sí, confirmar', onclick: onConfirm }),
      incNode('button', { type: 'button', class: 'incx-btn', text: 'No', onclick: () => { wrap.replaceChildren(ask); ask.focus(); } }));
    wrap.querySelector('.incx-btn-danger').focus();
  } });
  wrap.append(ask);
  return wrap;
}
function linkList(items, emptyText) {
  if (!items.length) return incNode('p', { class: 'incx-muted', text: emptyText });
  return incNode('ul', { class: 'incx-links' }, items.map(item => {
    const url = ArgosDomain.safeUrl(item.url);
    const label = item.titulo || item.descripcion || item.fuente || item.url || 'Enlace';
    const kind = INC_EV_TIPOS[item.tipo] || 'Enlace';
    return incNode('li', {},
      incNode('span', { class: 'incx-link-kind', text: kind }),
      url ? incNode('a', { href: url, target: '_blank', rel: 'noopener noreferrer', text: label, 'aria-label': label + ' (abre otra pestaña)' })
          : incNode('span', { text: label + ' (enlace no válido)' }));
  }));
}
function renderDetalleIncidente(inc) {
  const editor = incCanEdit();
  const estado = INC_ESTADOS[inc.estado] ? inc.estado : 'detectado';
  const body = document.getElementById('dm-body');
  const fuentes = Array.isArray(inc.fuentes) ? inc.fuentes : [];
  const evidencias = Array.isArray(inc.evidencias) ? inc.evidencias : [];
  const adjuntos = Array.isArray(inc.adjuntos) ? inc.adjuntos : [];
  const historial = Array.isArray(inc.historial) ? inc.historial : [];
  const relacionados = Array.isArray(inc.relacionados) ? inc.relacionados : [];
  const conf = Math.min(5, Math.max(1, Number(inc.confianza) || 1));

  document.getElementById('dm-title').textContent = inc.tipo || 'Incidente reportado';
  document.getElementById('dm-tipo-lugar').textContent = incLugar(inc) || 'Ubicación por confirmar';
  const badge = document.getElementById('dm-estado-badge');
  badge.replaceChildren(incEstadoChip(inc.estado), incGravedadChip(inc)); badge.hidden = false;

  // 1. Progreso y siguiente paso
  const idx = ESTADO_IDX[estado];
  const pasos = incNode('ol', { class: 'incx-steps', 'aria-label': 'Progreso del incidente' },
    ESTADO_LIST.map((s, i) => incNode('li', { class: i < idx ? 'done' : i === idx ? 'current' : '', 'aria-current': i === idx ? 'step' : null },
      incNode('span', { class: 'incx-step-dot', 'aria-hidden': 'true', text: i < idx ? '✓' : String(i + 1) }),
      incNode('span', { text: INC_ESTADOS[s].label }))));
  const siguiente = INC_SIGUIENTE[estado];
  let accion;
  if (estado === 'cerrado') accion = incNode('p', { class: 'incx-next-text', text: 'Este incidente está cerrado. No requiere más acciones.' });
  else if (!editor) accion = incNode('p', { class: 'incx-next-text', text: 'Un operador dará seguimiento a este incidente. Puedes revisar aquí su avance.' });
  else accion = incNode('div', { class: 'incx-next' },
    incNode('div', {}, incNode('strong', { text: 'Siguiente paso: ' + siguiente.label.toLowerCase() }), incNode('p', { text: siguiente.help })),
    incNode('div', { class: 'incx-next-actions' },
      siguiente.estado === 'cerrado'
        ? confirmButton(siguiente.label, '¿Cerrar el incidente?', () => cambiarEstadoIncidente(inc.codigo, 'cerrado'), 'incx-btn incx-btn-primary')
        : incNode('button', { type: 'button', class: 'incx-btn incx-btn-primary', text: siguiente.label, onclick: () => cambiarEstadoIncidente(inc.codigo, siguiente.estado) }),
      siguiente.estado !== 'cerrado'
        ? confirmButton('Cerrar o descartar', '¿Cerrar sin completar los pasos?', () => cambiarEstadoIncidente(inc.codigo, 'cerrado'))
        : null));
  const progreso = incNode('section', { class: 'incx-section incx-progress' },
    pasos, incNode('p', { class: 'incx-muted', text: INC_ESTADOS[estado].help }), accion);

  // 2. Datos clave
  const datos = incNode('dl', { class: 'incx-facts' },
    [['Reportado', incFecha(inc.created_at)],
     ['Lugar', [inc.municipio || inc.lugar, inc.departamento].filter(Boolean).join(' · ') || 'Por confirmar'],
     ['Local de votación', inc.local_votacion || '—'],
     ['Detenidos', inc.hubo_detenidos===true?`Sí · Cantidad: ${inc.cantidad_detenidos}`:inc.hubo_detenidos===false?'No · Cantidad: 0':'Por confirmar'],
     ...(inc.hubo_detenidos===true?[['Datos de detenidos',inc.datos_detenidos||'Pendientes de confirmar']]:[]),
     ['Responsable', nombreOperador(inc.responsable)],
     ['Confianza', `${CONF_LABELS[conf]} (${conf} de 5)`],
     ['Gravedad', (INC_PRIORIDADES.find(p => p[0] === inc.prioridad) || [, 'Media'])[1]]]
      .map(([k, v]) => incNode('div', {}, incNode('dt', { text: k }), incNode('dd', { text: v }))));

  // 3. Descripción, pruebas y observaciones
  const descripcion = seccion('Qué pasó', incNode('p', { class: 'incx-desc', text: inc.descripcion || 'Sin descripción.' }));
  const imagenes = adjuntos.length ? incNode('div',{class:'incx-detail-images'},adjuntos.map((image,index)=>
    incNode('figure',{class:'incx-detail-image'},incNode('img',{src:`data:${image.mime};base64,${image.data}`,alt:`Imagen adjunta ${index+1}: ${image.filename}`}),incNode('figcaption',{text:image.filename})))) : null;
  const pruebas = seccion(`Pruebas y fuentes (${fuentes.length + evidencias.length + adjuntos.length})`,
    linkList([...evidencias, ...fuentes], 'Todavía no se agregaron enlaces, fotos ni fuentes.'),
    imagenes,
    editor ? incNode('p', { class: 'incx-muted', text: 'Para agregar enlaces, abre «Herramientas avanzadas».' }) : null);
  const obs = editor
    ? seccion('Observaciones',
        incNode('label', { class: 'incx-sr', for: 'obs-textarea', text: 'Observaciones del incidente' }),
        incNode('textarea', { id: 'obs-textarea', class: 'incx-input', rows: 3, maxlength: 5000, placeholder: 'Notas internas para el equipo…', value: inc.observaciones || '' }),
        incNode('button', { type: 'button', class: 'incx-btn', text: 'Guardar observación', onclick: () => guardarObservacion(inc.codigo) }))
    : seccion('Observaciones', incNode('p', { class: 'incx-desc', text: inc.observaciones || 'Sin observaciones.' }));

  // 4. Historial
  const hist = incNode('details', { class: 'incx-details' },
    incNode('summary', { text: `Historial de cambios (${historial.length})` }),
    historial.length
      ? incNode('ol', { class: 'incx-history' }, historial.map(h => incNode('li', {},
          incNode('time', { datetime: h.timestamp, text: incFecha(h.timestamp).split(' · ')[0] }),
          incNode('span', { text: h.accion || '' }),
          incNode('small', { text: h.usuario || '' }))))
      : incNode('p', { class: 'incx-muted', text: 'Sin cambios registrados.' }));

  // 5. Herramientas avanzadas
  const relList = relacionados.length
    ? incNode('ul', { class: 'incx-rel' }, relacionados.map(r => {
        const rel = incidentesData.find(i => i.codigo === r);
        return incNode('li', {},
          incNode('button', { type: 'button', class: 'incx-link', text: r, onclick: () => openDetalleIncidente(r) }),
          rel ? incNode('span', { class: 'incx-muted', text: [rel.tipo, rel.municipio || rel.lugar].filter(Boolean).join(' · ') }) : null,
          editor ? incNode('button', { type: 'button', class: 'incx-btn incx-btn-small', text: 'Quitar', 'aria-label': 'Quitar relación con ' + r, onclick: () => desrelacionarIncidente(inc.codigo, r) }) : null);
      }))
    : incNode('p', { class: 'incx-muted', text: 'Sin incidentes relacionados.' });

  const field = (label, control) => incNode('label', { class: 'incx-field' }, incNode('span', { text: label }), control);
  const advanced = incNode('details', { class: 'incx-details incx-advanced', open: detalleAdvancedOpen, ontoggle: e => { detalleAdvancedOpen = e.currentTarget.open; } },
    incNode('summary', { text: 'Herramientas avanzadas' }),
    editor ? incNode('div', { class: 'incx-adv-grid' },
      incNode('div', { class: 'incx-adv-block' }, incNode('h4', { text: 'Gravedad' }),
        incNode('div', { class: 'incx-seg', role: 'group', 'aria-label': 'Gravedad' }, INC_PRIORIDADES.map(([v, l]) =>
          incNode('button', { type: 'button', class: 'incx-seg-btn incx-prio-' + v, 'aria-pressed': String((inc.prioridad || 'media') === v), text: l,
            onclick: () => { if ((inc.prioridad || 'media') !== v) setPrioridad(inc.codigo, v); } })))),
      incNode('div', { class: 'incx-adv-block' }, incNode('h4', { text: 'Confianza en la información' }),
        incNode('div', { class: 'incx-seg', role: 'group', 'aria-label': 'Confianza' }, [1, 2, 3, 4, 5].map(n =>
          incNode('button', { type: 'button', class: 'incx-seg-btn', 'aria-pressed': String(conf === n), text: String(n), title: CONF_LABELS[n],
            onclick: () => { if (conf !== n) setConfianza(inc.codigo, n); } }))),
        incNode('small', { class: 'incx-muted', text: '1 = rumor · 3 = dos fuentes · 5 = confirmado oficialmente' })),
      incNode('div', { class: 'incx-adv-block' }, incNode('h4', { text: 'Responsable' }),
        field('Asignar a', incNode('select', { class: 'incx-input', onchange: e => asignarIncidente(inc.codigo, e.target.value) },
          incNode('option', { value: '', text: '— Sin asignar —' }),
          (operadoresList || []).map(o => incNode('option', { value: o.username, text: o.name, selected: inc.responsable === o.username }))))),
      incNode('div', { class: 'incx-adv-block incx-wide' }, incNode('h4', { text: 'Ubicación' }),
        incNode('div', { class: 'incx-row' },
          field('Departamento', incNode('select', { id: 'ub-dpto', class: 'incx-input' }, incNode('option', { value: '', text: '— Departamento —' }),
            DEPARTAMENTOS_PY.map(d => incNode('option', { value: d, text: d, selected: inc.departamento === d })))),
          field('Ciudad o municipio', incNode('input', { id: 'ub-municipio', class: 'incx-input', type: 'text', maxlength: 200, value: inc.municipio || inc.lugar || '' })),
          field('Local de votación', incNode('input', { id: 'ub-local', class: 'incx-input', type: 'text', maxlength: 200, value: inc.local_votacion || '' }))),
        incNode('button', { type: 'button', class: 'incx-btn', text: 'Guardar ubicación', onclick: () => guardarUbicacion(inc.codigo) })),
      incNode('div', { class: 'incx-adv-block incx-wide' }, incNode('h4', { text: 'Agregar prueba (foto, video o enlace)' }),
        incNode('div', { class: 'incx-row' },
          field('Enlace', incNode('input', { id: 'ev-url', class: 'incx-input', type: 'url', placeholder: 'https://…' })),
          field('Descripción', incNode('input', { id: 'ev-desc', class: 'incx-input', type: 'text', maxlength: 300 })),
          field('Tipo', incNode('select', { id: 'ev-tipo', class: 'incx-input' }, ['link', 'foto', 'video', 'captura'].map(t => incNode('option', { value: t, text: INC_EV_TIPOS[t] }))))),
        incNode('button', { type: 'button', class: 'incx-btn', text: 'Agregar prueba', onclick: () => validarYAgregar('ev-url', () => agregarEvidencia(inc.codigo)) })),
      incNode('div', { class: 'incx-adv-block incx-wide' }, incNode('h4', { text: 'Agregar fuente' }),
        incNode('div', { class: 'incx-row' },
          field('Enlace', incNode('input', { id: 'fuente-url', class: 'incx-input', type: 'url', placeholder: 'https://…' })),
          field('Título (opcional)', incNode('input', { id: 'fuente-titulo', class: 'incx-input', type: 'text', maxlength: 300 })),
          field('Tipo', incNode('select', { id: 'fuente-tipo', class: 'incx-input' }, [['web', 'Sitio web'], ['rss', 'Noticia'], ['social', 'Red social'], ['oficial', 'Fuente oficial']].map(([v, l]) => incNode('option', { value: v, text: l }))))),
        incNode('button', { type: 'button', class: 'incx-btn', text: 'Agregar fuente', onclick: () => validarYAgregar('fuente-url', () => agregarFuente(inc.codigo)) })),
      incNode('div', { class: 'incx-adv-block incx-wide' }, incNode('h4', { text: `Incidentes relacionados (${relacionados.length})` }), relList,
        incNode('div', { class: 'incx-row incx-row-inline' },
          field('Código', incNode('input', { id: 'rel-input', class: 'incx-input', type: 'text', placeholder: 'Ej.: INC-012', maxlength: 40 })),
          incNode('button', { type: 'button', class: 'incx-btn', text: 'Relacionar', onclick: () => relacionarIncidente(inc.codigo) }))))
      : incNode('div', { class: 'incx-adv-grid' },
          incNode('div', { class: 'incx-adv-block incx-wide' }, incNode('h4', { text: `Incidentes relacionados (${relacionados.length})` }), relList)),
    incNode('div', { class: 'incx-adv-footer' },
      incNode('button', { type: 'button', class: 'incx-btn', text: 'Exportar informe (DOCX)', onclick: () => exportarDocx(inc.codigo) }),
      userRole === 'admin'
        ? confirmButton('Eliminar incidente', `¿Eliminar ${inc.codigo}? No se puede deshacer.`, () => eliminarIncidente(inc.codigo, true), 'incx-btn incx-btn-danger-soft')
        : null));

  const prepararInforme = editor ? incNode('button', { type: 'button', class: 'incx-btn', text: 'Preparar informe con imágenes', onclick: () => { location.href = 'reporte.html?incidente=' + encodeURIComponent(inc.codigo); } }) : null;
  body.replaceChildren(...(prepararInforme ? [prepararInforme] : []), progreso, incNode('section', { class: 'incx-section' }, datos), descripcion, pruebas, obs, hist, advanced);
  body.dataset.loaded = inc.codigo;
  document.getElementById('dm-tools-btn').hidden = false;
}
function abrirHerramientasAvanzadas() {
  const adv = document.querySelector('#dm-body .incx-advanced');
  if (!adv) return;
  adv.open = true; detalleAdvancedOpen = true;
  adv.scrollIntoView({ behavior: 'smooth', block: 'start' });
  adv.querySelector('summary')?.focus({ preventScroll: true });
}
function validarYAgregar(inputId, action) {
  const input = document.getElementById(inputId);
  const value = input?.value.trim();
  if (!value) { showToast('Escribe el enlace primero.', 'info'); input?.focus(); return; }
  if (!ArgosDomain.safeUrl(value)) { showToast('El enlace debe empezar con http:// o https://', 'error'); input.setAttribute('aria-invalid', 'true'); input.focus(); return; }
  input.removeAttribute('aria-invalid');
  action();
}
async function eliminarIncidente(codigo, confirmado = false) {
  if (!confirmado && !confirm(`¿Eliminar el incidente ${codigo}? Esta acción no se puede deshacer.`)) return;
  try {
    const res = await fetch(`${BACKEND_URL}/incidentes/${encodeURIComponent(codigo)}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
    if (res.ok) { showToast(`${codigo} eliminado`, 'info'); detalleCambios = true; closeDetalleIncidente(); }
    else { const d = await leerJson(res); showToast(d.error || 'No se pudo eliminar', 'error'); }
  } catch (e) { showToast('Error: ' + e.message, 'error'); }
}

// ── Eventos ───────────────────────────────────────────────────────────────
(function initIncidentesUI() {
  buildCrearIncidenteForm();
  crearForm()?.addEventListener('submit', saveIncidente);
  document.getElementById('cinc-desc')?.addEventListener('input', () => { updateDescCounter(); setFieldError('cinc-desc', ''); });
  document.getElementById('cinc-evidencia')?.addEventListener('input', () => setFieldError('cinc-evidencia', ''));
  document.getElementById('cinc-hubo-detenidos')?.addEventListener('change', syncCrearDetenidos);
  document.getElementById('cinc-cantidad-detenidos')?.addEventListener('input', () => setFieldError('cinc-cantidad-detenidos', ''));
  document.getElementById('cinc-images')?.addEventListener('change', seleccionarCrearImagenes);
  for (const [id, fn] of [['modal-crear-inc', closeCrearIncidente], ['modal-detalle-inc', closeDetalleIncidente]]) {
    document.getElementById(id)?.addEventListener('mousedown', e => { if (e.target === e.currentTarget) fn(); });
  }
  const search = document.getElementById('inc-search');
  search?.addEventListener('input', () => { incSearch = search.value; renderIncidentes(); });
  document.getElementById('inc-filter-detenidos')?.addEventListener('change', syncFiltroDetenidos);
  document.getElementById('inc-filter-min-detenidos')?.addEventListener('input', renderIncidentes);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && document.getElementById('modal-crear-inc')?.classList.contains('open')) closeCrearIncidente();
  });
})();
