'use strict';
function toggleDetailedView(force) {
  const detailed=typeof force==='boolean'?force:!document.body.classList.contains('detailed-view');
  document.body.classList.toggle('detailed-view',detailed);
  document.body.classList.toggle('simple-view',!detailed);
  document.getElementById('btn-ops-mode').textContent=detailed?'Volver al resumen':'Vista detallada';
  showPanel('monitor');
  if(detailed&&!geoFeatures){
    if(typeof d3==='undefined'||typeof topojson==='undefined')showToast('No se pudo cargar el mapa (sin conexión con el proveedor externo). El resto de la vista funciona.','warning');
    else initD3Map();
  }
}
async function loadDashboard() {
  if(!token||dashboardLoading)return;
  dashboardLoading=true;const generation=monitorGeneration;
  try {
    const response=await fetch(BACKEND_URL+'/dashboard',{headers:{Authorization:'Bearer '+token}});
    if(!response.ok)throw new Error(response.status===401?'Tu sesión expiró. Vuelve a ingresar.':'No se pudo actualizar el resumen.');
    const data=await response.json();
    if(generation!==monitorGeneration||!token)return;
    if(!Array.isArray(data.incidentesAbiertos)||!Number.isFinite(data.abiertos))throw new Error('El servidor no devolvió un resumen válido.');
    dashboardData=data;dashboardError='';
  } catch(error){dashboardError=error.message;}
  finally{dashboardLoading=false;renderSimpleDashboard();}
}
function renderSimpleDashboard(){
  const status=document.getElementById('home-status');if(!status)return;
  const d=dashboardData;
  const generated=d?new Date(d.generatedAt):null;
  const stale=generated&&Date.now()-generated.getTime()>120000;
  status.textContent=dashboardError|| (stale?'Datos sin actualizar. Comprueba la conexión.':d?'Actualizado a las '+generated.toLocaleTimeString('es-PY',{hour:'2-digit',minute:'2-digit',timeZone:'America/Asuncion'})+' · Paraguay':'Cargando información del servidor…');
  status.classList.toggle('status-warning',!!dashboardError||!!stale);
  const risk=document.getElementById('home-risk');risk.textContent=computeNivelNacional().label;risk.style.color=computeNivelNacional().color;
  document.getElementById('home-open').textContent=d?d.abiertos:'—';
  document.getElementById('home-critical').textContent=d?d.criticos+' críticos · '+d.altos+' de gravedad alta':'Ver todos los incidentes →';
  document.getElementById('home-news-count').textContent=d?d.noticiasHoy:'—';
  const pending=document.getElementById('home-pending');pending.replaceChildren();
  const weight={critico:3,alto:2,medio:1,info:0};
  const items=[...(d?.incidentesAbiertos||[])].sort((a,b)=>weight[ArgosDomain.incidentLevel(b)]-weight[ArgosDomain.incidentLevel(a)]||new Date(b.created_at)-new Date(a.created_at)).slice(0,5);
  if(!items.length)appendEmpty(pending,d?'No hay incidentes pendientes.':'Esperando datos de incidentes.');
  items.forEach(inc=>{
    const row=document.createElement('button');row.type='button';row.className='home-incident';
    const level=ArgosDomain.incidentLevel(inc);row.dataset.level=level;
    const meta=document.createElement('span');meta.className='home-row-meta';meta.textContent=inc.codigo+' · '+({critico:'Crítico',alto:'Gravedad alta',medio:'Gravedad media',info:'Informativo'}[level]);
    const title=document.createElement('strong');title.textContent=inc.tipo||'Incidente reportado';
    const detail=document.createElement('span');detail.textContent=[inc.municipio||inc.lugar||inc.departamento||'Ubicación por confirmar',inc.estado==='detectado'?'Pendiente de verificar':inc.estado].join(' · ');
    row.append(meta,title,detail);row.addEventListener('click',()=>openDetalleIncidente(inc.codigo));pending.append(row);
  });
  const news=document.getElementById('home-news');news.replaceChildren();
  const recent=ArgosDomain.recentNews(rssAllItems).slice(0,5);
  if(!recent.length)appendEmpty(news,newsError||'Todavía no se recibieron noticias recientes.');
  recent.forEach(item=>{
    const row=document.createElement('article');row.className='home-news-item';
    const meta=document.createElement('span');meta.className='home-row-meta';meta.textContent=(item.portalName||'Fuente externa')+' · '+formatTimeAgo(item.pubDate||item.fecha);
    const url=ArgosDomain.safeUrl(item.url);
    const title=document.createElement(url?'a':'strong');title.textContent=item.title;
    if(url){title.href=url;title.target='_blank';title.rel='noopener noreferrer';title.setAttribute('aria-label',item.title+' (abre otra pestaña)');}
    row.append(meta,title);news.append(row);
  });
  document.getElementById('home-news-status').textContent=newsError|| (newsUpdatedAt?'Última consulta de fuentes: '+formatTimeAgo(newsUpdatedAt)+' · Últimas 48 horas':'Esperando actualización de fuentes');
}
function appendEmpty(parent,message){const p=document.createElement('p');p.className='home-empty';p.textContent=message;parent.append(p);}
// Labels make the sidebar understandable without technical terminology.
const navHome=document.getElementById('nav-monitor');if(navHome){const label=Array.from(navHome.childNodes).find(n=>n.nodeType===3&&n.textContent.trim());if(label)label.textContent=' Inicio';}
document.querySelectorAll('button').forEach(button=>{if(!button.getAttribute('type'))button.type='button';});
document.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&!mustChangePassword){
    for(const id of ['modal-incidente','modal-user','modal-sitrep','modal-doble-corte'])document.getElementById(id)?.classList.remove('open');
    closeDetalleIncidente();closeDeptDetailPanel();
  }
});
