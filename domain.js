(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ArgosDomain=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const normalize=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  function incidentLevel(inc){
    const p=normalize(inc.prioridad);
    if(p==='critica'||p==='critico'||inc.estado==='escalado')return 'critico';
    if(p==='alta')return 'alto';
    if(p==='media'||inc.estado==='verificado')return 'medio';
    return 'info';
  }
  function nationalRisk({incCriticos=0,incAltos=0}={}){
    if(incCriticos>=3)return 'CRISIS';
    if(incCriticos>=1||incAltos>=3)return 'TENSION';
    if(incAltos>=1)return 'ATENCION';
    return 'NORMAL';
  }
  function summarize(incidentes){
    const open=incidentes.filter(i=>i.estado!=='cerrado');
    const criticos=open.filter(i=>incidentLevel(i)==='critico').length;
    const altos=open.filter(i=>incidentLevel(i)==='alto').length;
    return {total:incidentes.length,cerrados:incidentes.length-open.length,abiertos:open.length,criticos,altos,
      municipios:new Set(open.map(i=>i.municipio||i.lugar).filter(Boolean)).size,
      riesgo:nationalRisk({incCriticos:criticos,incAltos:altos})};
  }
  function safeUrl(value){try{const u=new URL(value);return ['http:','https:'].includes(u.protocol)?u.href:'';}catch{return '';}}
  function recentNews(items,now=Date.now()){
    const seen=new Set();return items.filter(i=>{
      const t=new Date(i.fecha||i.pubDate).getTime();const key=i.url||i.title;
      if(!key||seen.has(key)||!Number.isFinite(t)||t>now+300000||t<now-48*3600000)return false;
      seen.add(key);return true;
    }).sort((a,b)=>new Date(b.fecha||b.pubDate)-new Date(a.fecha||a.pubDate));
  }
  function parseCuts(cut1,cut2,date){
    const parse=t=>{if(typeof t!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(t))throw new Error('Horario inválido');return new Date(`${date}T${t}:00-03:00`);};
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw new Error('Fecha inválida');
    const [from1,to1,from2,to2]=[cut1?.desde,cut1?.hasta,cut2?.desde,cut2?.hasta].map(parse);
    if(!(from1<to1&&to1<=from2&&from2<to2))throw new Error('Los cortes deben estar ordenados y no superponerse');
    return {from1,to1,from2,to2};
  }
  return {incidentLevel,nationalRisk,summarize,safeUrl,recentNews,parseCuts};
});
