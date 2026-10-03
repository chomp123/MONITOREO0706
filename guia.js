'use strict';
// ARGOS · Guía «¿Cómo se usa?» (vista de prueba).
// Sustituye al recorrido antiguo de 15 pasos (TOUR_STEPS_BASE/startTour), que apuntaba a la pantalla anterior.
// No se abre sola: en el primer ingreso se muestra una invitación en la portada y la guía se abre desde
// el botón «¿Cómo se usa?». La marca de «vista» usa la misma clave que el backend ya reinicia
// (`argos_tour_<usuario>`, ver verifyToken/resetTour), así que «Mostrar de nuevo el recorrido guiado»
// de Usuarios vuelve a mostrar la invitación.

const GUIA_VISTA = 'visto-v2';
const guiaEditor = () => ['admin', 'operador'].includes(userRole);
const GUIA_PASOS = [
  { titulo: 'Bienvenido a ARGOS',
    texto: () => 'En un minuto te mostramos lo esencial: ver la situación, reportar un hecho y darle seguimiento. Puedes salir cuando quieras con «Saltar guía» o la tecla Esc.' },
  { panel: 'monitor', sel: '.home-metrics', titulo: 'Lo importante, en un vistazo',
    texto: () => '«Situación actual» resume la gravedad de los incidentes abiertos. «Incidentes pendientes» te lleva a la lista. «Noticias de hoy» cuenta noticias de fuentes externas: no son incidentes confirmados.' },
  { panel: 'monitor', sel: '.home-primary', titulo: 'Reportar un incidente',
    texto: () => guiaEditor()
      ? 'Registra aquí cualquier hecho. Solo la descripción es obligatoria. En «Opciones avanzadas» puedes indicar la confianza y las fuentes.'
      : 'Si ves algo, repórtalo aquí. Solo la descripción es obligatoria. Un operador revisará tu reporte.' },
  { panel: 'incidentes', sel: '#inc-list .incx-card', alt: '#inc-list', titulo: 'Lista de incidentes',
    texto: () => 'Cada tarjeta muestra el estado («Por verificar», «Verificado», «Escalado» o «Cerrado») y la gravedad. Toca «Ver detalle» para ver el avance.' +
      (guiaEditor() ? ' El botón «Verificar» o «Escalar» avanza el incidente al siguiente paso.' : '') },
  { panel: 'incidentes', sel: '.inc-filter-bar', titulo: 'Buscar y filtrar',
    texto: () => 'Escribe un código, un tipo o un lugar, o filtra por estado, departamento y tipo.' },
  { panel: 'incidentes', sel: '#inc-list .incx-card .incx-card-actions', alt: '#inc-list', soloEditor: true, titulo: 'El detalle de un incidente',
    texto: () => 'En el detalle verás el progreso en 4 pasos y el «Siguiente paso», con una explicación de cuándo usarlo. Gravedad, responsable, ubicación, pruebas y fuentes están en «Herramientas avanzadas», arriba a la derecha del detalle.' },
  { panel: 'monitor', sel: '#nav-admin', soloAdmin: true, titulo: 'Usuarios',
    texto: () => 'Agrega personas, decide qué puede hacer cada una y genera contraseñas temporales. También puedes ver la actividad y quién está conectado.' },
  { panel: 'monitor', sel: '#btn-ops-mode', titulo: 'Vista detallada',
    texto: () => 'Mapa, cronología, redes y herramientas de análisis para la operación. Con «Volver al resumen» regresas a esta pantalla.' },
  { panel: 'monitor', sel: '#btn-guide', titulo: 'Si necesitas ayuda',
    texto: () => 'Repite esta guía cuando quieras con «¿Cómo se usa?». Con el botón de la llave cambias tu contraseña.' },
];

let guiaPasos = [], guiaIdx = 0, guiaAbierta = false, guiaOpener = null;

function guiaClave() { return `argos_tour_${userName || 'anon'}`; }
function guiaVista() { try { return localStorage.getItem(guiaClave()) === GUIA_VISTA; } catch { return false; } }
function guiaMarcarVista() { try { localStorage.setItem(guiaClave(), GUIA_VISTA); } catch {} }
function guiaActualizarInvitacion() {
  const invite = document.getElementById('guide-invite');
  if (invite) invite.hidden = !token || mustChangePassword || guiaVista();
}
function cerrarInvitacionGuia() { guiaMarcarVista(); guiaActualizarInvitacion(); }

function guiaVisible(el) {
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
}
function guiaObjetivo(paso) {
  if (!paso.sel) return null;
  const a = document.querySelector(paso.sel);
  if (guiaVisible(a)) return a;
  const b = paso.alt && document.querySelector(paso.alt);
  return guiaVisible(b) ? b : null;
}

function abrirGuia() {
  if (guiaAbierta || !token) return;
  guiaOpener = document.activeElement;
  // Cerrar lo que pueda tapar los pasos.
  ['modal-crear-inc', 'modal-detalle-inc', 'modal-user', 'modal-sitrep', 'modal-reporte-social'].forEach(id => document.getElementById(id)?.classList.remove('open'));
  if (document.body.classList.contains('detailed-view') && typeof toggleDetailedView === 'function') toggleDetailedView(false);
  guiaPasos = GUIA_PASOS.filter(p => (!p.soloEditor || guiaEditor()) && (!p.soloAdmin || userRole === 'admin'));
  guiaIdx = 0; guiaAbierta = true;
  const capa = document.getElementById('guide-layer');
  capa.hidden = false;
  document.addEventListener('keydown', guiaTeclas, true);
  window.addEventListener('resize', guiaReubicar);
  guiaMostrar(0);
}
function cerrarGuia(completa) {
  if (!guiaAbierta) return;
  guiaAbierta = false;
  guiaMarcarVista(); guiaActualizarInvitacion();
  document.getElementById('guide-layer').hidden = true;
  document.removeEventListener('keydown', guiaTeclas, true);
  window.removeEventListener('resize', guiaReubicar);
  if (typeof showPanel === 'function') showPanel('monitor');
  if (completa) showToast('Guía terminada. Puedes repetirla con «¿Cómo se usa?».', 'success');
  const btn = document.getElementById('btn-guide');
  (guiaOpener && document.contains(guiaOpener) && guiaOpener !== document.body ? guiaOpener : btn)?.focus();
}
async function guiaMostrar(idx) {
  if (idx < 0) return;
  if (idx >= guiaPasos.length) { cerrarGuia(true); return; }
  guiaIdx = idx;
  const paso = guiaPasos[idx];
  const panelActual = ['monitor', 'incidentes', 'admin'].find(p => document.getElementById('panel-' + p)?.style.display === 'flex');
  if (paso.panel && paso.panel !== panelActual) {
    showPanel(paso.panel);
    await new Promise(r => setTimeout(r, paso.panel === 'incidentes' ? 450 : 150));
    if (!guiaAbierta || guiaIdx !== idx) return;
  }
  const objetivo = guiaObjetivo(paso);
  if (objetivo) objetivo.scrollIntoView({ block: 'center', inline: 'nearest' });
  document.getElementById('guide-step').textContent = `Paso ${idx + 1} de ${guiaPasos.length}`;
  document.getElementById('guide-title').textContent = paso.titulo;
  document.getElementById('guide-text').textContent = paso.texto();
  document.getElementById('guide-progress-bar').style.width = `${Math.round((idx + 1) / guiaPasos.length * 100)}%`;
  document.getElementById('guide-prev').hidden = idx === 0;
  const next = document.getElementById('guide-next');
  next.textContent = idx === guiaPasos.length - 1 ? 'Terminar' : 'Siguiente';
  requestAnimationFrame(() => { guiaReubicar(); next.focus(); });
}
function guiaReubicar() {
  if (!guiaAbierta) return;
  const paso = guiaPasos[guiaIdx];
  const objetivo = guiaObjetivo(paso);
  const luz = document.getElementById('guide-spotlight');
  const card = document.getElementById('guide-card');
  const vw = window.innerWidth, vh = window.innerHeight, m = 12;
  card.classList.toggle('guide-card-sheet', vw < 600);
  if (!objetivo) {
    luz.hidden = true;
    card.classList.add('guide-card-center');
    card.style.left = card.style.top = '';
    return;
  }
  card.classList.remove('guide-card-center');
  const r = objetivo.getBoundingClientRect(), pad = 6;
  luz.hidden = false;
  Object.assign(luz.style, { left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px` });
  if (vw < 600) { card.style.left = card.style.top = ''; return; } // hoja fija abajo en celulares
  const cw = card.offsetWidth, ch = card.offsetHeight;
  let top = r.bottom + pad + 12;
  if (top + ch > vh - m) top = r.top - pad - 12 - ch;
  if (top < m) top = Math.max(m, Math.min(vh - ch - m, r.top + r.height / 2 - ch / 2));
  let left = Math.min(Math.max(m, r.left), vw - cw - m);
  if (top < r.bottom && top + ch > r.top) { // se superpone: colocar al lado
    left = r.right + 16 + cw < vw - m ? r.right + 16 : Math.max(m, r.left - 16 - cw);
  }
  card.style.left = `${left}px`; card.style.top = `${top}px`;
}
function guiaTeclas(e) {
  if (!guiaAbierta) return;
  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cerrarGuia(false); return; }
  if (e.key === 'ArrowRight') { e.preventDefault(); guiaMostrar(guiaIdx + 1); return; }
  if (e.key === 'ArrowLeft') { e.preventDefault(); guiaMostrar(guiaIdx - 1); return; }
  if (e.key === 'Tab') { // mantener el foco dentro de la guía
    const f = [...document.querySelectorAll('#guide-card button:not([hidden])')];
    const i = f.indexOf(document.activeElement);
    e.preventDefault();
    f[(i + (e.shiftKey ? -1 : 1) + f.length) % f.length]?.focus();
  }
}

(function initGuia() {
  document.getElementById('guide-next')?.addEventListener('click', () => guiaMostrar(guiaIdx + 1));
  document.getElementById('guide-prev')?.addEventListener('click', () => guiaMostrar(guiaIdx - 1));
  document.getElementById('guide-skip')?.addEventListener('click', () => cerrarGuia(false));
  // Mostrar la invitación (no la guía) al entrar. initApp está definida en index.html.
  if (typeof initApp === 'function') {
    const initAppOriginal = initApp;
    initApp = function () { const r = initAppOriginal.apply(this, arguments); guiaActualizarInvitacion(); return r; };
  }
  guiaActualizarInvitacion();
})();
