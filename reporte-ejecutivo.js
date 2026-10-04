const executiveFields=['asuntoInforme','afectadoNombre','afectadoDocumento','afectadoNacimiento','afectadoDireccion','afectadoTelefono','resumenEjecutivo','conclusionInforme'];draftFieldIds.push(...executiveFields);
const executiveCard=document.createElement('section');executiveCard.className='card';
executiveCard.innerHTML='<h2>Resumen ejecutivo y formato institucional</h2><p>Las seis preguntas sirven para reunir información. El Word presenta un relato en INCIDENTE, las imágenes seleccionadas dentro de esa sección y luego CONCLUSIÓN.</p><label for="asuntoInforme">Supuesto hecho / asunto</label><input id="asuntoInforme" placeholder="Asunto breve del incidente"><details><summary>Datos del afectado (solo si están disponibles)</summary><label for="afectadoNombre">Nombres y apellidos del afectado</label><input id="afectadoNombre"><label for="afectadoDocumento">Cédula de identidad del afectado</label><input id="afectadoDocumento"><label for="afectadoNacimiento">Fecha de nacimiento del afectado</label><input id="afectadoNacimiento" type="date"><label for="afectadoDireccion">Dirección del afectado</label><input id="afectadoDireccion"><label for="afectadoTelefono">Teléfono del afectado</label><input id="afectadoTelefono"><small>No se deducen estos datos de la persona mencionada. Completa únicamente lo que corresponde al afectado y está respaldado.</small></details><div class="actions"><button id="generarResumen" type="button">Preparar resumen con las seis preguntas</button></div><small>Organiza el texto ingresado; no investiga ni verifica los hechos. Vuelve a prepararlo si cambias los datos de origen.</small><label for="resumenEjecutivo">INCIDENTE · Resumen ejecutivo editable</label><textarea id="resumenEjecutivo" rows="12" placeholder="Completa las seis preguntas y pulsa Preparar resumen."></textarea><label for="conclusionInforme">CONCLUSIÓN · Editable</label><textarea id="conclusionInforme" rows="5" placeholder="Síntesis de lo establecido y lo que falta verificar."></textarea>';
document.querySelector('.editor').append(executiveCard);
$('generarResumen').onclick=()=>{
 if(($('resumenEjecutivo').value||$('conclusionInforme').value)&&!confirm('¿Reemplazar el resumen y la conclusión con un nuevo borrador basado en las seis preguntas?'))return;
 const known=id=>$(id).value.trim();
 const paragraphs=[];
 paragraphs.push('Según la información registrada, '+(known('hecho')||'el hecho permanece sin descripción confirmada')+'. Estado de la información: '+value('certeza')+'.');
 paragraphs.push('El hecho se sitúa en '+([known('lugar'),known('referenciaLugar'),known('municipioHecho'),known('departamentoHecho')].filter(Boolean).join(', ')||'un lugar aún no confirmado')+'. Fecha y hora del hecho: '+fecha('fechaHecho')+'. Ubicación: '+(known('respaldoLugar')?value('precision'):'pendiente de confirmar')+'.'+(known('respaldoLugar')?' Respaldo de la ubicación: '+known('respaldoLugar')+'.':''));
 paragraphs.push(known('persona')?'Se menciona a '+known('persona')+' con el papel de '+value('papel')+'. Identidad: '+(known('identidad')==='Confirmada con evidencia'&&known('identidadFuente')?'confirmada según '+known('identidadFuente'):'no confirmada')+'.':'No se ha confirmado quién está involucrado.');
 paragraphs.push(known('secuencia')?'La secuencia descrita es la siguiente: '+known('secuencia'):'La forma en que ocurrió el hecho está pendiente de confirmación.');
 paragraphs.push('Fuente: '+value('fuente')+'.'+(known('enlace')?' Enlace: '+known('enlace')+'.':'')+' Publicación: '+fecha('fechaPublicacion')+'. Recepción del reporte: '+fecha('fechaReporte')+'. Alcance del respaldo: '+value('respaldo')+'.');
 $('resumenEjecutivo').value=paragraphs.join('\n\n');$('conclusionInforme').value='El presente informe recoge la información disponible, con estado: '+value('certeza')+'. Pendiente de verificar: '+value('pendientes')+'.';
 $('resumenEjecutivo').dispatchEvent(new Event('input',{bubbles:true}));
};
const refreshExecutiveBase=refresh;
refresh=function(){
 refreshExecutiveBase();
 const photos=Array.from($('borrador').querySelectorAll('figure'));const paper=$('borrador');paper.replaceChildren();
 function add(tag,t){const e=document.createElement(tag);e.textContent=t;paper.append(e);}
 add('h2','INFORME DE SUPUESTO INCIDENTE');add('p','Registro: '+incidentCode+' · BORRADOR PARA REVISIÓN');add('p','Supuesto hecho: '+value('asuntoInforme'));add('h3','AFECTADO/S');add('p',value('afectadoNombre'));add('h3','INCIDENTE');add('p',$('resumenEjecutivo').value||'Prepara el resumen ejecutivo con las seis preguntas.');add('p','Detenidos: '+detenidosTexto());if($('huboDetenidos').value==='Sí')add('p','Datos de las personas detenidas: '+value('datosDetenidos'));paper.append(...photos);add('h3','CONCLUSIÓN');add('p',$('conclusionInforme').value||'Pendiente de completar.');
 report='INFORME DE SUPUESTO INCIDENTE\nRegistro: '+incidentCode+'\nSupuesto hecho: '+value('asuntoInforme')+'\n\nAFECTADO/S\n'+value('afectadoNombre')+'\n\nINCIDENTE\n'+value('resumenEjecutivo')+'\nDetenidos: '+detenidosTexto()+($('huboDetenidos').value==='Sí'?'\nDatos de las personas detenidas: '+value('datosDetenidos'):'')+photos.map(f=>'\n[Imagen: '+f.querySelector('figcaption').textContent+']').join('')+'\n\nCONCLUSIÓN\n'+value('conclusionInforme');
 if(!$('resumenEjecutivo').value.trim()||!$('conclusionInforme').value.trim())$('descargar').disabled=$('imprimir').disabled=true;
};
$('revisado').addEventListener('change',()=>refresh());
$('imprimir').textContent='Descargar Word institucional';
$('imprimir').onclick=async()=>{
 if(draftDirty||!draftRevision){$('notice').textContent='Guarda el borrador y las imágenes antes de descargar el Word.';return;}
 $('imprimir').disabled=true;
 try{
  const r=await fetch(apiBase+'/incidentes/'+encodeURIComponent(incidentCode)+'/borrador-informe/docx?revision='+draftRevision,{headers:{Authorization:'Bearer '+draftToken}});
  if(!r.ok){const e=await r.json().catch(()=>({}));throw Error(e.error||'No se pudo generar el Word');}
  const url=URL.createObjectURL(await r.blob());const a=document.createElement('a');a.href=url;a.download='ARGOS_'+incidentCode+'.docx';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);$('notice').textContent='Word descargado con la plantilla institucional. Para PDF, abre el Word y usa Guardar como PDF.';
 }catch(e){$('notice').textContent=e.message;}finally{refresh();}
};
document.querySelector('.actions small').textContent='TXT contiene texto. Word utiliza la plantilla institucional e incluye las imágenes dentro de INCIDENTE. Para PDF, exporta el Word a PDF.';
refresh();
