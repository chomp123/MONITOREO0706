'use strict';
let xNewsItems=[],xNewsRequest=0,xNewsLoadingGeneration=null,newsSource='all';
function resetXNews(){xNewsRequest++;xNewsLoadingGeneration=null;xNewsItems=[];newsSource='all';const filter=document.getElementById('feed-source-filter');if(filter)filter.value='all';const state=document.getElementById('x-news-status');if(state)state.textContent='';}
function setNewsSource(value){newsSource=['all','web','x'].includes(value)?value:'all';renderFeedFromCache();}
function getFeedNews(applyFilter=true){
 const byUrl=new Map();
 for(const item of [...rssAllItems,...xNewsItems]){if(applyFilter&&((newsSource==='web'&&item.platform==='x')||(newsSource==='x'&&item.platform!=='x')))continue;const key=item.url||item.title;if(!byUrl.has(key))byUrl.set(key,item);}
 return [...byUrl.values()].sort((a,b)=>new Date(b.pubDate||b.fecha)-new Date(a.pubDate||a.fecha));
}
async function fetchXNews(){
 if(!token||xNewsLoadingGeneration===monitorGeneration)return;
 const generation=monitorGeneration,authToken=token,request=++xNewsRequest;xNewsLoadingGeneration=generation;
 const state=document.getElementById('x-news-status');
 try{
  let before=null;const seen=new Set(),items=[];let hasMore=false;
  for(let page=0;page<20;page++){
   const params=new URLSearchParams({estado:'todos'});if(before)params.set('before',before);
   const response=await fetch(BACKEND_URL+'/api/x-posts?'+params,{headers:{Authorization:'Bearer '+authToken}});
   if(!response.ok)throw Error(response.status===401?'X: sesión vencida.':'X: no se pudo actualizar la lista.');
   const data=await response.json();if(request!==xNewsRequest||generation!==monitorGeneration||token!==authToken)return;
   if(!Array.isArray(data.items))throw Error('X: respuesta no válida.');
   for(const item of data.items){
    if(typeof item.id!=='string'||!/^\d{1,30}$/.test(item.id)||seen.has(item.id)||!['pendiente','revisado'].includes(item.status)||typeof item.text!=='string'||!item.text.trim())continue;
    const date=new Date(item.publishedAt);if(!Number.isFinite(date.getTime())||date>Date.now()||Date.now()-date>48*3600000)continue;
    seen.add(item.id);items.push({platform:'x',id:'x-'+item.id,title:item.text,description:'Publicación de X. '+(item.status==='revisado'?'Revisada por operador; no implica confirmación del hecho.':'Pendiente de verificación.'),url:'https://x.com/i/web/status/'+item.id,pubDate:date.toISOString(),fecha:date.toISOString(),portalName:'X · fuente por verificar',portalColor:'#a78bfa',alertLevel:'info'});
   }
   hasMore=!!data.nextCursor;if(!hasMore)break;
   if(typeof data.nextCursor!=='string'||!/^\d{1,30}$/.test(data.nextCursor)||data.nextCursor===before)throw Error('X: paginación no válida.');
   before=data.nextCursor;
  }
  xNewsItems=items;if(state)state.textContent='X: '+items.length+' publicaciones'+(hasMore?' · más disponibles en la bandeja':'');
  renderFeedFromCache();if(typeof renderSimpleDashboard==='function')renderSimpleDashboard();
 }catch(error){if(request===xNewsRequest&&generation===monitorGeneration&&token===authToken&&state)state.textContent=error.message+' No se han actualizado las publicaciones de X.';}
 finally{if(request===xNewsRequest)xNewsLoadingGeneration=null;}
}
