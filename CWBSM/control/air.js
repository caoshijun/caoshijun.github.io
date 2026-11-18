'use strict';
// Air quality: current index per weather city (US AQI, European AQI or the estimated Chinese
// AQI), pollutants, a 24 h forecast, and the standard / warning settings.
let airData=null;
const AIR_STANDARDS=['auto','us','eu','cn'];
const AIR_COLORS={us:['#00e400','#ffff00','#ff7e00','#ff2a2a','#a855c8','#c0284e'],eu:['#50f0e6','#50ccaa','#f0e641','#ff5050','#d0305a','#a346b0']};
function airColor(standard,level){return level<0?'#8090a0':(standard==='eu'?AIR_COLORS.eu:AIR_COLORS.us)[Math.min(5,level)];}
function airLevelText(standard,level){return level>=0?t('air.'+standard+'.'+level):'—';}
function airStandardName(standard){return standard==='us'?'US AQI':standard==='eu'?'EU AQI':t('air.cnLabel');}
function airRender(){
  const root=$('airCities');if(!root||!airData)return;root.replaceChildren();
  const standard=airData.resolved;
  if(!airData.cities.length){const p=document.createElement('p');p.className='hint card';p.textContent=t('air.noCities');root.append(p);}
  for(const city of airData.cities){
    const card=document.createElement('div');card.className='card air-card';
    const index=city[standard]||{};const level=index.level??-1,color=airColor(standard,level);
    const head=document.createElement('div');head.className='air-head';
    const big=document.createElement('div');big.className='air-index';big.style.borderColor=color;
    const value=document.createElement('strong');value.textContent=index.aqi??'—';value.style.color=color;
    const unit=document.createElement('small');unit.textContent=airStandardName(standard);big.append(value,unit);
    const info=document.createElement('div');
    const title=document.createElement('h2');title.textContent=city.city;
    const lv=document.createElement('p');lv.className='air-level';lv.textContent=airLevelText(standard,level)+(index.primary?' · '+t('air.primary')+' '+index.primary:'');lv.style.color=color;
    const status=document.createElement('p');status.className='hint';
    status.textContent=city.valid?t('air.updated')+' '+new Date(city.fetched*1000).toLocaleString()+(city.ok?'':' · '+localError(city.error)):(city.error?localError(city.error):t('status.waiting'));
    info.append(title,lv,status);head.append(big,info);card.append(head);
    if(city.valid){
      const facts=document.createElement('div');facts.className='air-facts';
      const fact=(label,v,digits=0)=>{const item=document.createElement('div');const s=document.createElement('small');s.textContent=label;const b=document.createElement('strong');b.textContent=v>=0?Number(v).toFixed(digits):'—';item.append(s,b);facts.append(item);};
      fact('PM2.5',city.pm25);fact('PM10',city.pm10);fact('O₃',city.o3);fact('NO₂',city.no2);fact('SO₂',city.so2);fact('CO',city.co);fact('UV',city.uv,1);
      const unitNote=document.createElement('p');unitNote.className='hint';unitNote.textContent=t('air.unit');
      const chart=document.createElement('div');chart.className='air-chart';chart.setAttribute('aria-label',t('air.forecast'));
      const values=(index.forecast||[]).map(v=>v??0),peak=Math.max(standard==='eu'?40:100,...values);
      (index.forecast||[]).forEach((v,h)=>{const bar=document.createElement('span');bar.style.height=(v==null?0:Math.max(3,100*v/peak))+'%';bar.style.background=airColor(standard,v==null?-1:airLevelOf(standard,v));bar.title=(h?'+'+h+'h':t('air.now'))+': '+(v??'—');chart.append(bar);});
      const caption=document.createElement('p');caption.className='hint';caption.textContent=t('air.forecast')+' · CAMS · Open-Meteo';
      card.append(facts,unitNote,chart,caption);
    }
    root.append(card);
  }
}
function airLevelOf(standard,aqi){const limits=standard==='eu'?[20,40,60,80,100]:[50,100,150,200,300];for(let i=0;i<5;++i)if(aqi<=limits[i])return i;return 5;}
function airFillSettings(){
  const s=$('airStandard'),a=$('airAlert');if(!s||!airData)return;
  s.replaceChildren();AIR_STANDARDS.forEach(k=>s.add(new Option(t('air.standard.'+k),k)));s.value=airData.standard;
  const standard=airData.resolved;a.replaceChildren();a.add(new Option(t('air.alertOff'),0));
  for(let level=1;level<=5;++level)a.add(new Option('≥ '+airLevelText(standard,level),level));a.value=airData.alert;
}
async function airRefresh(force=false){try{airData=await api('/api/air');airRender();if(force)airFillSettings();}catch(e){if(force)toast(e.message,true);}}
async function airSave(event){
  event?.preventDefault();$('airSave').disabled=true;
  try{airData=await api('/api/air',{standard:$('airStandard').value,alert:Number($('airAlert').value)});airRender();airFillSettings();toast(t('app.saved'));}
  catch(e){toast(e.message,true);}finally{$('airSave').disabled=false;}
}
async function airInit(){
  if(!$('airForm'))return;
  $('airForm').onsubmit=airSave;
  languageHooks.push(()=>{airRender();airFillSettings();});
  await airRefresh(true);
  setInterval(()=>{if(active==='air'&&!document.hidden)airRefresh();},60000);
}
