'use strict';
let xInboxOverlay=null,xInboxTimer=null,xInboxRequest=0,xInboxItems=[],xInboxNext=null,xInboxPages=1,xInboxOpener=null;
function xInboxNode(tag,cls,text){const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node;}
function xInboxButton(text,handler){const button=xInboxNode('button','incx-btn',text);button.type='button';button.addEventListener('click',handler);return button;}
function construirBandejaX(){
 if(xInboxOverlay)return;
 const overlay=xInboxNode('div','x-inbox-overlay');overlay.hidden=true;overlay.id='x-inbox-overlay';
 const dialog=xInboxNode('section','x-inbox-dialog');dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');dialog.setAttribute('aria-labelledby','x-inbox-title');
 const header=xInboxNode('div','x-inbox-heading');const title=xInboxNode('h2','','Publicaciones de X · por verificar');title.id='x-inbox-title';
 const close=xInboxButton('Cerrar',cerrarBandejaX);close.id='x-inbox-close';header.append(title,close);
 const info=xInboxNode('p','x-inbox-info','Las publicaciones son fuentes por verificar. Un operador decide si corresponde registrar un reporte.');
 const state=xInboxNode('p','x-inbox-status','Cargando estado…');state.id='x-inbox-status';state.setAttribute('role','status');
 const usage=xInboxNode('p','x-inbox-usage');usage.id='x-inbox-usage';
 const toolbar=xInboxNode('div','x-inbox-toolbar');const label=xInboxNode('label','','Mostrar');label.htmlFor='x-inbox-filter';const filter=xInboxNode('select');filter.id='x-inbox-filter';
 for(const [value,text] of [['pendiente','Pendientes'],['revisado','Revisadas'],['descartado','Descartadas'],['todos','Todas']]){const option=xInboxNode('option','',text);option.value=value;filter.append(option);}
 filter.addEventListener('change',()=>cargarBandejaX());const refresh=xInboxButton('Actualizar lista',()=>cargarBandejaX());
 const manual=xInboxNode('a','incx-btn','Buscar manualmente en X');manual.href='https://x.com/search?q='+encodeURIComponent('Ueno Bank Paraguay')+'&f=live';manual.target='_blank';manual.rel='noopener noreferrer';toolbar.append(label,filter,refresh,manual);
 const list=xInboxNode('div','x-inbox-list');list.id='x-inbox-list';list.setAttribute('aria-live','polite');
 const more=xInboxButton('Ver más',()=>cargarBandejaX(true));more.id='x-inbox-more';more.hidden=true;
 dialog.append(header,info,state,usage,toolbar,list,more);overlay.append(dialog);document.body.append(overlay);xInboxOverlay=overlay;
 overlay.addEventListener('click',event=>{if(event.target===overlay)cerrarBandejaX();});
 overlay.addEventListener('keydown',event=>{
  if(event.key==='Escape'){event.preventDefault();cerrarBandejaX();return;}
  if(event.key!=='Tab')return;const controls=[...dialog.querySelectorAll('a[href],button,select')].filter(n=>!n.hidden&&!n.disabled);const first=controls[0],last=controls.at(-1);
  if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
 });
}
async function abrirBandejaX(){
 if(!token){showToast('Inicia sesión para consultar las publicaciones.','info');return;}
 construirBandejaX();xInboxOpener=document.activeElement;xInboxOverlay.hidden=false;xInboxItems=[];xInboxNext=null;xInboxPages=1;document.getElementById('x-inbox-filter').value='pendiente';
 document.getElementById('x-inbox-close').focus();clearInterval(xInboxTimer);xInboxTimer=setInterval(()=>{if(xInboxPages===1)cargarBandejaX();},60000);await cargarBandejaX();
}
function cerrarBandejaX(){xInboxRequest++;clearInterval(xInboxTimer);if(xInboxOverlay){xInboxOverlay.hidden=true;document.getElementById('x-inbox-list').replaceChildren();}xInboxItems=[];xInboxNext=null;xInboxOpener?.focus?.();}
async function cargarBandejaX(more=false){
 if(!xInboxOverlay||xInboxOverlay.hidden||!token)return;
 const request=++xInboxRequest,authToken=token,filter=document.getElementById('x-inbox-filter').value;
 const params=new URLSearchParams({estado:filter});if(more&&xInboxNext)params.set('before',xInboxNext);
 const state=document.getElementById('x-inbox-status');state.textContent='Actualizando lista…';
 try{
  const response=await fetch(BACKEND_URL+'/api/x-posts?'+params,{headers:{Authorization:'Bearer '+authToken}});
  if(!response.ok)throw new Error(response.status===401?'Tu sesión venció. Vuelve a ingresar.':'No se pudo actualizar la bandeja.');
  const data=await response.json();if(request!==xInboxRequest||xInboxOverlay.hidden||token!==authToken)return;
  if(!Array.isArray(data.items))throw new Error('No se pudo leer la respuesta de la bandeja.');
  xInboxItems=more?[...xInboxItems,...data.items]:data.items;xInboxPages=more?xInboxPages+1:1;xInboxNext=data.nextCursor||null;
  const status=data.status||{};state.textContent=status.message||'Estado no disponible.';
  const usage=status.usage||{};document.getElementById('x-inbox-usage').textContent=status.configured?'Leídas hoy: '+(usage.postsRead||0)+' · Cupo utilizado o reservado: '+(usage.readsReserved||0)+' / '+status.dailyPostLimit+' · Piloto acumulado: '+(status.totalReadsReserved||0)+' / '+status.totalPostLimit+' · Consultas: '+(usage.requests||0)+' / '+status.dailyRequestLimit:'La administración debe habilitar el acceso de aplicación de X y el cupo de lecturas. No hay consultas automáticas activas.';
  renderBandejaX();
 }catch(error){if(request===xInboxRequest&&!xInboxOverlay.hidden)state.textContent=error.message;}
}
function renderBandejaX(){
 const list=document.getElementById('x-inbox-list');list.replaceChildren();
 if(!xInboxItems.length)list.append(xInboxNode('p','x-inbox-empty','No hay publicaciones en esta vista.'));
 for(const item of xInboxItems){
  if(typeof item.id!=='string'||!/^\d{1,30}$/.test(item.id))continue;
  const article=xInboxNode('article','x-inbox-card');const date=new Date(item.publishedAt);
  const label={pendiente:'Pendiente de revisión',revisado:'Revisada por operador',descartado:'Descartada'}[item.status]||'Pendiente de revisión';
  article.append(xInboxNode('p','x-inbox-meta',label+' · '+(Number.isFinite(date.getTime())?date.toLocaleString('es-PY',{timeZone:'America/Asuncion'}):'Fecha no disponible')));
  article.append(xInboxNode('p','x-inbox-text',item.text||'El texto ya no está en caché. Puedes abrir la fuente original.'));
  const actions=xInboxNode('div','x-inbox-actions');const url='https://x.com/i/web/status/'+item.id;const source=xInboxNode('a','incx-btn','Ver fuente original');source.href=url;source.target='_blank';source.rel='noopener noreferrer';actions.append(source);
  const editor=['admin','operador'].includes(userRole)&&userName!=='monitoreador';
  if(editor){
   if(item.text)actions.append(xInboxButton('Preparar reporte',()=>{cerrarBandejaX();openCrearIncidente({tipo:typeof detectarTipoIncidente==='function'?detectarTipoIncidente(item.text):'Otro',descripcion:'Publicación de X pendiente de verificación: '+item.text,evidencia:url});}));
   for(const [value,text] of [['revisado','Marcar revisada'],['descartado','Descartar'],['pendiente','Volver a pendientes']])if(item.status!==value)actions.append(xInboxButton(text,()=>revisarPublicacionX(item.id,value)));
  }
  article.append(actions);list.append(article);
 }
 document.getElementById('x-inbox-more').hidden=!xInboxNext;
}
async function revisarPublicacionX(id,estado){
 try{
  const response=await fetch(BACKEND_URL+'/api/x-posts/'+id+'/review',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({estado})});
  if(!response.ok)throw new Error('No se pudo guardar la revisión. Comprueba tus permisos.');await cargarBandejaX();if(typeof fetchXNews==='function')await fetchXNews();
 }catch(error){document.getElementById('x-inbox-status').textContent=error.message;}
}