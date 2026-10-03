// Vista local: los archivos permanecen en memoria y no se transmiten.
const placeCard = $('lugar').closest('.card');
placeCard.querySelector('h2').textContent='5. ¿Dónde ocurrió el hecho?';
const fields=document.createElement('div');
fields.innerHTML='<p>Distingue el lugar del hecho de otros lugares mencionados. Completa o corrige la propuesta antes de confirmarla.</p><div class="row"><div><label for="departamentoHecho">Departamento</label><input id="departamentoHecho" placeholder="Ej.: Central"></div><div><label for="municipioHecho">Municipio</label><input id="municipioHecho" placeholder="Ej.: Luque"></div></div><label for="referenciaLugar">Dirección o referencia del hecho</label><input id="referenciaLugar" placeholder="Local, barrio o referencia conocida"><label for="respaldoLugar">Fuente que ubica el hecho allí</label><input id="respaldoLugar" placeholder="Noticia, testigo o documento y fragmento relevante"><div class="actions"><button type="button" id="sugerirLugar" class="secondary">Buscar lugares en la descripción</button></div><small>Prueba limitada a Asunción, Luque y Encarnación. No usa geolocalización ni confirma el lugar automáticamente.</small><div id="sugerenciasLugar" role="status"></div>';
placeCard.querySelector('h2').after(fields);
$('sugerirLugar').onclick=()=>{
 const text=value('hecho').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 const options=[['Asunción','Capital','asuncion'],['Luque','Central','luque'],['Encarnación','Itapúa','encarnacion']].filter(x=>new RegExp('(^|[^a-z])'+x[2]+'([^a-z]|$)').test(text));
 const box=$('sugerenciasLugar');box.replaceChildren();
 const p=document.createElement('p');p.textContent=options.length?'Lugares mencionados, sin confirmar. Selecciona únicamente el lugar del hecho:':'No se reconoció un lugar de esta prueba. Puedes completarlo manualmente.';box.append(p);
 for(const [town,dept] of options){const b=document.createElement('button');b.type='button';b.textContent='Usar '+town+' como propuesta';b.onclick=()=>{$('municipioHecho').value=town;$('departamentoHecho').value=dept;$('precision').selectedIndex=0;$('respaldoLugar').value='';invalidate();};box.append(b);}
};
const attachmentCard=document.createElement('div');attachmentCard.className='card';
attachmentCard.innerHTML='<h2>7. Imágenes para el informe</h2><p>Agrega fotos o capturas y elige cuáles incluir. Usa imágenes ficticias para esta prueba.</p><label for="tipoImagen">Tipo de imagen</label><select id="tipoImagen"><option>Persona mencionada</option><option>Noticia o evidencia del hecho</option></select><label for="archivosImagen">Seleccionar imágenes</label><input id="archivosImagen" type="file" accept="image/jpeg,image/png,image/webp" multiple><small>JPG, PNG o WebP · Hasta 5 imágenes de 5 MB cada una. La foto no confirma identidad. Nada se envía a un servidor.</small><p id="imagenError" role="status"></p><div id="listaImagenes"></div>';
document.querySelector('.editor').append(attachmentCard);
const images=[];let loading=0;
function invalidate(){ $('revisado').checked=false;$('notice').textContent='';refresh(); }
function renderImages(){
 const list=$('listaImagenes');list.replaceChildren();
 for(const item of images){
  const card=document.createElement('fieldset');card.className='image-card';const legend=document.createElement('legend');legend.textContent=item.kind;card.append(legend);
  const img=document.createElement('img');img.src=item.url;img.alt='Imagen adjunta de prueba';card.append(img);
  for(const [key,label,type] of [['caption','Descripción de la imagen','text'],['source','Fuente o procedencia','text'],['date','Fecha de la imagen o publicación','date']]){
   const l=document.createElement('label');l.textContent=label;const input=document.createElement('input');input.type=type;input.value=item[key];input.oninput=()=>{item[key]=input.value;};l.append(input);card.append(l);
  }
  const l=document.createElement('label');l.className='check';const check=document.createElement('input');check.type='checkbox';check.checked=item.include;check.onchange=()=>{item.include=check.checked;invalidate();};l.append(check,document.createTextNode('Incluir esta imagen en el informe'));card.append(l);
  const remove=document.createElement('button');remove.type='button';remove.className='secondary';remove.textContent='Quitar imagen';remove.onclick=()=>{images.splice(images.indexOf(item),1);URL.revokeObjectURL(item.url);renderImages();invalidate();};card.append(remove);list.append(card);
 }
}
$('archivosImagen').onchange=async e=>{
 const errors=[];const files=Array.from(e.target.files);e.target.value='';loading++;invalidate();
 for(const file of files){
  if(images.length>=5){errors.push('Máximo de 5 imágenes alcanzado.');break;}
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>5*1024*1024){errors.push(file.name+': formato no admitido o más de 5 MB.');continue;}
  const url=URL.createObjectURL(file);const img=new Image();img.src=url;
  try{await img.decode();if(img.naturalWidth*img.naturalHeight>40000000)throw Error('large');images.push({url,kind:$('tipoImagen').value,caption:'',source:'',date:'',include:false});}
  catch{URL.revokeObjectURL(url);errors.push(file.name+': no se puede leer o supera 40 megapíxeles.');}
 }
 loading--;$('imagenError').textContent=errors.join(' ');renderImages();invalidate();
};
const baseRefresh=refresh;
refresh=function(){
 baseRefresh();
 const geo='Departamento: '+value('departamentoHecho')+'\nMunicipio: '+value('municipioHecho')+'\nReferencia: '+value('referenciaLugar')+'\nRespaldo del lugar: '+value('respaldoLugar');
 const locationHeading=Array.from($('borrador').querySelectorAll('h3')).find(h=>h.textContent==='¿Dónde?');
 if(locationHeading){const p=locationHeading.nextElementSibling;if($('precision').selectedIndex>0&&!$('respaldoLugar').value.trim()){p.textContent=value('lugar')+'\nUbicación pendiente de confirmar — falta respaldo';report=report.replace(value('precision'),'Ubicación pendiente de confirmar — falta respaldo');}p.textContent+='\n'+geo;}
 report+='\n\nDETALLE DEL LUGAR\n'+geo;
 const selected=images.filter(i=>i.include);let missing=false;
 for(const item of selected){
  const figure=document.createElement('figure');const image=document.createElement('img');image.src=item.url;image.alt=item.caption||item.kind;figure.append(image);
  const caption=document.createElement('figcaption');const identity=$('identidad').value==='Confirmada con evidencia'&&$('identidadFuente').value.trim()?'Identidad confirmada según el respaldo indicado':'Identidad no confirmada';
  caption.textContent=item.kind+' · '+(item.caption||'Descripción pendiente')+'\nFuente: '+(item.source||'No confirmada')+'\nFecha: '+(item.date||'No confirmada')+(item.kind==='Persona mencionada'?'\n'+value('persona')+' · '+identity:'');figure.append(caption);$('borrador').append(figure);report+='\n\n[Imagen — no incluida en TXT]\n'+caption.textContent;
  if(!item.source.trim()||!item.caption.trim())missing=true;
 }
 if(missing||loading){$('descargar').disabled=$('imprimir').disabled=true;$('notice').textContent=loading?'Cargando imágenes…':'Completa la descripción y la fuente de cada imagen seleccionada.';}
};
$('descargar').after(Object.assign(document.createElement('small'),{textContent:'TXT contiene texto y referencias. Para incluir las imágenes utiliza Imprimir / PDF.'}));
const style=document.createElement('style');style.textContent='.image-card{margin:18px 0;border:1px solid #465772;border-radius:10px;padding:16px}.image-card img{max-width:100%;max-height:180px;object-fit:contain}.paper figure{margin:20px 0;break-inside:avoid}.paper figure img{display:block;max-width:100%;max-height:340px;object-fit:contain}.paper figcaption{white-space:pre-wrap;font-size:13px;line-height:1.5;margin-top:8px;overflow-wrap:anywhere}#sugerenciasLugar button{margin:4px}';document.head.append(style);
// La confirmación debe invocar también las comprobaciones de adjuntos.
$('revisado').removeEventListener('change',baseRefresh);$('revisado').addEventListener('change',()=>refresh());
refresh();
