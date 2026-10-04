const draftFieldIds=['hecho','certeza','huboDetenidos','cantidadDetenidos','datosDetenidos','persona','papel','identidad','identidadFuente','secuencia','fechaHecho','fechaPublicacion','fechaReporte','lugar','precision','fuente','enlace','respaldo','pendientes','departamentoHecho','municipioHecho','referenciaLugar','respaldoLugar'];
let draftReady=false,draftDirty=false,draftRevision=0,draftSaving=false;
const incidentCode=new URLSearchParams(location.search).get('incidente');
const draftToken=sessionStorage.getItem('argos_token');
const apiBase=window.ARGOS_CONFIG.backendUrl;
const saveBar=document.createElement('div');saveBar.className='card save-bar';saveBar.innerHTML='<button id="guardarBorrador" type="button" disabled>Guardar borrador e imágenes</button><p id="estadoGuardado" role="status">Cargando borrador…</p><a href="index.html">Volver a ARGOS</a>';
document.querySelector('main').before(saveBar);saveBar.style.maxWidth='1152px';saveBar.style.margin='20px auto';
document.querySelector('.editor').inert=true;document.querySelector('.preview').inert=true;
document.querySelector('.demo').textContent='ARGOS · Borrador privado del incidente · Guarda antes de salir';
document.querySelector('header .tag').textContent=incidentCode||'Sin incidente';
document.querySelector('.preview>small').textContent='El borrador y las imágenes se conservan al pulsar Guardar. Acceso para administradores y operadores.';
for(const id of draftFieldIds){const el=$(id);if(el.tagName==='SELECT')el.selectedIndex=0;else el.value='';}
const refreshWithAttachments=refresh;
refresh=function(){
 refreshWithAttachments();
 const title=$('borrador').querySelector('h2');if(title)title.textContent='Informe del hecho · '+(incidentCode||'');
 const mark=$('borrador').querySelector('.muted');if(mark)mark.textContent='BORRADOR · Revisar antes de emitir';
 report=report.replace('ARGOS · BORRADOR DE DEMOSTRACIÓN — DATOS FICTICIOS','ARGOS · BORRADOR · '+incidentCode);
};
$('revisado').addEventListener('change',()=>refresh());
attachmentCard.querySelector('p').textContent='Agrega las imágenes relacionadas con el hecho y elige cuáles incluir.';
attachmentCard.querySelector('small').textContent='JPG, PNG o WebP · Hasta 5 imágenes de 5 MB cada una. Se guardan de forma privada al pulsar Guardar borrador.';
const originalRenderImages=renderImages;
renderImages=function(){originalRenderImages();document.querySelectorAll('.image-card img').forEach(img=>img.alt='Imagen adjunta');};
function dirty(){if(!draftReady)return;draftDirty=true;$('estadoGuardado').textContent='Cambios sin guardar';}
document.querySelector('.editor').addEventListener('input',dirty);document.querySelector('.editor').addEventListener('change',dirty);
document.querySelector('.editor').addEventListener('click',e=>{if(e.target.closest('button'))dirty();});
window.addEventListener('beforeunload',e=>{if(draftDirty||draftSaving){e.preventDefault();e.returnValue='';}});
async function requestDraft(method,body){
 const r=await fetch(apiBase+'/incidentes/'+encodeURIComponent(incidentCode)+'/borrador-informe',{method,headers:{Authorization:'Bearer '+draftToken,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
 const data=await r.json().catch(()=>({}));if(!r.ok)throw Error(data.error||(r.status===401?'Vuelve a ingresar en ARGOS.':'No se pudo acceder al borrador.'));return data;
}
function toBase64(blob){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onerror=()=>reject(Error('No se pudo leer la imagen'));reader.onload=()=>resolve(reader.result.split(',')[1]);reader.readAsDataURL(blob);});}
$('guardarBorrador').onclick=async()=>{
 if(!draftReady||draftSaving||loading)return;
 if(!validarDetenidosInforme()){$('estadoGuardado').textContent='Revisa la cantidad de detenidos antes de guardar.';$('cantidadDetenidos').focus();return;}
 draftSaving=true;$('guardarBorrador').disabled=true;document.querySelector('.editor').inert=true;$('estadoGuardado').textContent='Guardando borrador e imágenes…';
 try{
  const savedImages=[];for(const i of images){const blob=await (await fetch(i.url)).blob();savedImages.push({kind:i.kind,caption:i.caption,source:i.source,date:i.date,include:i.include,mime:blob.type,data:await toBase64(blob)});}
  const data=await requestDraft('PUT',{revision:draftRevision,fields:Object.fromEntries(draftFieldIds.map(id=>[id,$(id).value])),images:savedImages});
  draftRevision=data.revision;draftDirty=false;$('estadoGuardado').textContent='Guardado. Puedes cerrar y continuar después.';
 }catch(e){$('estadoGuardado').textContent='No se guardó: '+e.message;}
 finally{draftSaving=false;$('guardarBorrador').disabled=false;document.querySelector('.editor').inert=false;}
};
$('descargar').onclick=()=>{const url=URL.createObjectURL(new Blob([report],{type:'text/plain;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='ARGOS_borrador_'+incidentCode+'.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);$('notice').textContent='Borrador descargado. Las imágenes se incluyen al imprimir / PDF.';};
(async()=>{
 try{
  if(!incidentCode||!draftToken)throw Error('Abre este formulario desde el detalle de un incidente en ARGOS.');
  const me=await fetch(apiBase+'/api/me',{headers:{Authorization:'Bearer '+draftToken}});if(!me.ok)throw Error('Tu sesión venció. Vuelve a ingresar en ARGOS.');
  const account=await me.json();if(!['admin','operador'].includes(account.role)||account.mustChangePassword)throw Error('Se requiere una cuenta de administrador u operador habilitada.');
  const data=await requestDraft('GET');draftRevision=data.revision;
  const initial=data.fields||{hecho:data.incident.descripcion||'',lugar:data.incident.lugar||'',departamentoHecho:data.incident.departamento||'',municipioHecho:data.incident.municipio||'',huboDetenidos:data.incident.hubo_detenidos===true?'Sí':data.incident.hubo_detenidos===false?'No':'Por confirmar',cantidadDetenidos:data.incident.cantidad_detenidos==null?'':String(data.incident.cantidad_detenidos),datosDetenidos:data.incident.datos_detenidos||''};
  for(const id of draftFieldIds)if(typeof initial[id]==='string')$(id).value=initial[id];
  for(const i of data.images){const bytes=Uint8Array.from(atob(i.data),c=>c.charCodeAt(0));images.push({...i,url:URL.createObjectURL(new Blob([bytes],{type:i.mime}))});}
  renderImages();refresh();draftReady=true;document.querySelector('.editor').inert=false;document.querySelector('.preview').inert=false;$('guardarBorrador').disabled=false;
  $('estadoGuardado').textContent=draftRevision?'Borrador recuperado · versión '+draftRevision:'Datos del incidente cargados. Guarda para crear el borrador.';
 }catch(e){$('estadoGuardado').textContent=e.message;}
})();
