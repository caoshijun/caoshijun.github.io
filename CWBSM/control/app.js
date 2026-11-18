'use strict';
const $=id=>document.getElementById(id);
let settings,data,catalogue=[],offsets={},dictionaries={},lang='en',active='system',selectedZones=[],stocksDraft=[],visibleZones=35,locationDraft,rotationBusy=false;
let marketsDraft={},stockMarket='us',stockPageDirty=false,citiesDraft=[],editingCity=-1,currenciesDraft=[],zoneStylesDraft={},animationDraft,previewTimer;
// Icons are inlined into the bundle (ICON_DATA) so the page needs fewer requests.
function iconSrc(name){return (typeof ICON_DATA!=='undefined'&&ICON_DATA[name])||'./icons/'+name+'.svg';}
const t=key=>dictionaries[lang]?.[key]??dictionaries.en?.[key]??key;
function mfaSessionHeader(){try{return mfaSession?{'X-MFA-Session':mfaSession}:{};}catch{return {};}}
// A reply that is not complete JSON (the connection dropped mid-body) is asked for once more
// when it was a GET; the error names the request and the bytes that arrived.
async function api(path,body,retried){const response=await fetch(path,{method:body===undefined?'GET':'POST',headers:Object.assign(body===undefined?{}:{'Content-Type':'application/json'},mfaSessionHeader()),body:body===undefined?undefined:JSON.stringify(body),cache:'no-store'});let text='',value;try{text=await response.text();value=JSON.parse(text);}catch{if(response.ok&&body===undefined&&!retried)return api(path,body,true);console.warn('CWBSM incomplete reply',path,response.status,text.length,text.slice(0,120));throw Error(response.ok?'Incomplete reply '+path.split('?')[0]+' ('+text.length+' B)':'HTTP '+response.status);}if(!response.ok)throw Error(value.error||('HTTP '+response.status));return value;}
let toastTimer;// Device errors arrive in English; show them in the UI language (detail kept where useful).
const ERROR_RULES=[[/Stop playback first/,'files.errBusy'],[/No SD card/,'files.errNoCard'],[/File exists/,'files.errExists'],[/Folder not empty/,'files.errNotEmpty'],[/SD card full or removed|Cannot write to the SD card/,'files.errWrite'],[/No backup on the SD card/,'sdbackup.errMissing'],[/not a CWBSM radio backup|radio backup is damaged|radio backup has no categories/,'sdbackup.errRadio',1],[/Upload interrupted/,'files.connectionLost'],[/Menu full/,'modules.full'],[/Radio module disabled/,'radio.disabled'],[/station|stream URL|HTTPS streams|Storage unavailable|radio action/i,'err.radio',1],[/feed/i,'err.feed',1],[/event|calendar/i,'err.calendar',1],[/air settings/i,'err.air',1],[/alarm|ring duration|focus minutes|break minutes|snooze minutes|sunrise minutes|Invalid timer/i,'err.alarm',1],[/Save failed|Unable to store vault|could not be staged|Export failed/,'err.save'],[/Unlock MFA management first/,'err.mfaLocked'],[/MFA authentication/,'err.mfaAuth'],[/Host rejected|Origin rejected/,'err.host'],[/JSON required|Invalid JSON request/,'err.request'],[/rate limited|limited to one frame/i,'err.rate'],[/Transition running/,'err.busy'],[/Wi-Fi reset pending/,'err.wifiReset'],[/Duplicate stock symbol/,'err.stockDuplicate',1],[/Maximum 6 stocks/,'err.stockMax'],[/Invalid stock|Invalid symbol/,'err.stockSymbol',1],[/^(HTTP -?\d+|Connect failed|Read timeout|TLS -0x|Low memory|Incomplete response|Response too large|Insufficient)/,'err.lookup',1],[/Select 1 to 3 cities/,'err.cities'],[/Select 1 to 3 currencies/,'err.currencies'],[/weather location/,'err.location'],[/Invalid refresh interval/,'err.interval'],[/Invalid hostname or network/,'err.network'],[/Invalid Wi-Fi settings/,'err.wifi'],[/Type CWBSM to reset/,'err.resetConfirm'],[/Enable at least one module/,'err.modules'],[/Invalid CWBSM configuration/,'err.config'],[/Incomplete reply/,'err.incomplete',1],[/Not found/,'err.notFound'],[/Screen changed/,'err.screenChanged'],[/^(Invalid|Unknown|Missing|Duplicate) /,'err.invalid',1]];
function localError(message){return String(message).split(' · ').map(part=>{const rule=ERROR_RULES.find(([pattern])=>pattern.test(part));return rule&&dictionaries[lang]?.[rule[1]]?t(rule[1])+(rule[2]?' ('+part+')':''):part;}).join(' · ');}
function toast(message,error=false){const node=$('toast');node.textContent=error?localError(message):message;node.className='show'+(error?' error':'');clearTimeout(toastTimer);toastTimer=setTimeout(()=>node.className='',4000);}
async function submit(form,work){const button=form.querySelector('button[type=submit]');if(button)button.disabled=true;try{await work();toast(t('app.saved'));}catch(error){toast(t('app.error')+' · '+error.message,true);}finally{if(button)button.disabled=false;}}
// Parts built once (status-bar preview) register here to follow a language switch.
const languageHooks=[];
function translate(){if(typeof renderNtp==='function')renderNtp(false);if(typeof alarmDigitsRender==='function')alarmDigitsRender();if(settings){renderCarouselPages();renderSingleCells();}document.documentElement.lang=lang==='zh'?'zh-CN':lang;for(const option of $('idlePreset')?.options||[]){const v=option.value;option.textContent=v==='0'?t('idle.off'):v==='custom'?t('idle.custom'):Number(v)<60?v+' '+t('unit.s'):Number(v)/60+' '+t('unit.min');}document.title='CWBSM · '+t('app.title');document.querySelectorAll('[data-i18n]').forEach(el=>el.textContent=t(el.dataset.i18n));document.querySelectorAll('[data-placeholder]').forEach(el=>el.placeholder=t(el.dataset.placeholder));document.querySelectorAll('[data-aria]').forEach(el=>el.setAttribute('aria-label',t(el.dataset.aria)));$('sectionTitle').textContent=t('nav.'+active);$('sectionDescription').textContent=t(active==='system'?'system.description':active+'.description');renderRegions();renderSelected();renderClockAnimation();renderDisplayOptions();renderCatalogue();renderStocks();renderCurrencies();renderCities();renderLocation();renderData();renderCountries();renderModules();renderMaintenance();if(typeof mfaRender==='function'&&mfaSession)mfaRender();languageHooks.forEach(hook=>hook());const preset=$('idlePreset');if(preset){preset.options[0].text=t('display.idleOff');preset.options[7].text=t('display.custom');}}
function section(name){active=name;refreshPreview();if(name==='files'&&typeof filesShow==='function')filesShow();document.querySelectorAll('.section').forEach(el=>el.hidden=el.id!==name);document.querySelectorAll('.nav').forEach(el=>{el.classList.toggle('active',el.dataset.section===name);el.setAttribute('aria-current',el.dataset.section===name?'page':'false');});$('sectionTitle').textContent=t('nav.'+name);$('sectionDescription').textContent=t(name==='system'?'system.description':name+'.description');}
function offsetLabel(id){const v=offsets[id];if(!v)return 'UTC';const minutes=v[0],absolute=Math.abs(minutes);const utc='UTC'+(minutes<0?'−':'+')+String(Math.floor(absolute/60)).padStart(2,'0')+':'+String(absolute%60).padStart(2,'0');return v[1]==='UTC'||/^[+-]/.test(v[1])?utc:v[1]+' · '+utc;}
function zoneLabel(z){const name=z.names[lang]||z.names.en,country=z.countries[lang]||z.countries.en;return name+(country&&country!==name?' · '+country:'');}
function action(label,icon,run){const b=document.createElement('button');b.type='button';b.className='icon-button';b.textContent=icon;b.title=t(label);b.setAttribute('aria-label',t(label));b.onclick=run;return b;}
function renderSelected(){if(!settings)return;const root=$('selectedZones');root.replaceChildren();$('zoneCount').textContent=selectedZones.length+'/12';selectedZones.forEach((id,index)=>{const zone=catalogue.find(z=>z.id===id);if(!zone)return;const row=document.createElement('div');row.className='list-row';const num=document.createElement('span');num.className='row-index';num.textContent=String(index+1).padStart(2,'0');const text=document.createElement('div');text.className='row-label';const name=document.createElement('strong');name.textContent=zoneLabel(zone);const info=document.createElement('small');info.textContent=offsetLabel(id);text.append(name,info);appendClockStyle(text,id,index);const actions=document.createElement('div');actions.className='row-actions';const swap=direction=>{const next=index+direction;if(next<0||next>=selectedZones.length)return;[selectedZones[index],selectedZones[next]]=[selectedZones[next],selectedZones[index]];renderSelected();};actions.append(action('button.up','↑',()=>swap(-1)),action('button.down','↓',()=>swap(1)),action('button.remove','×',()=>{selectedZones.splice(index,1);renderSelected();renderCatalogue();}));row.append(num,text,actions);root.append(row);});if(!selectedZones.length){const text=document.createElement('p');text.className='hint';text.textContent=t('clock.empty');root.append(text);}}
function appendClockStyle(root,id,index){
 const palette=['#00ff88','#33ccff','#ffaa33','#ffffff','#000000','#ff66cc','#b58cff','#ff766d','#f5dc70','#70e1c1','#709bff','#ff9ec4','#c2d5e6'];
 const value=zoneStylesDraft[id]||(zoneStylesDraft[id]={color:palette[index%3]});
 const controls=document.createElement('div');controls.className='clock-style';
 const label=document.createElement('small');label.textContent=t('clock.color');
 const color=document.createElement('input');color.type='color';color.value=value.color;color.setAttribute('aria-label',t('clock.color')+' '+zoneLabel(catalogue.find(z=>z.id===id)));color.oninput=()=>value.color=color.value;
 controls.append(label,color);
 const presets=document.createElement('div');presets.className='color-presets';
 for(const hex of palette){const button=document.createElement('button');button.type='button';button.className='color-swatch';button.style.backgroundColor=hex;button.title=t('clock.color')+' '+hex;button.setAttribute('aria-label',button.title);button.onclick=()=>{value.color=hex;color.value=hex;};presets.append(button);}
 root.append(controls,presets);
}
function renderCurrencies(){
 if(!settings)return;
 const root=$('currencyRows');root.replaceChildren();
 currenciesDraft.forEach((code,index)=>{
  const row=document.createElement('div');row.className='list-row';
  const label=document.createElement('div');label.className='row-label';const title=document.createElement('strong');title.textContent='BTC / '+code+' · '+t('currency.'+code);label.append(title);
  const buttons=document.createElement('div');buttons.className='row-actions';
  const move=direction=>{const next=index+direction;if(next<0||next>=currenciesDraft.length)return;[currenciesDraft[index],currenciesDraft[next]]=[currenciesDraft[next],currenciesDraft[index]];renderCurrencies();};
  buttons.append(action('button.up','↑',()=>move(-1)),action('button.down','↓',()=>move(1)),action('button.remove','×',()=>{currenciesDraft.splice(index,1);renderCurrencies();}));row.append(label,buttons);root.append(row);
 });
 const select=$('currencyChoice'),previous=select.value;select.replaceChildren();
 settings.availableCurrencies.filter(code=>!currenciesDraft.includes(code)).forEach(code=>select.add(new Option(code+' · '+t('currency.'+code),code)));
 if([...select.options].some(o=>o.value===previous))select.value=previous;
 $('addCurrency').disabled=!select.options.length||currenciesDraft.length>=settings.maxBtcPages;
}
function renderRegions(){if(!settings)return;const node=$('zoneRegion'),current=node.value;node.replaceChildren();node.add(new Option(t('clock.region'),''));[...new Set(catalogue.map(z=>z.region))].sort().forEach(r=>node.add(new Option(t('region.'+r),r)));node.value=current;}
function renderCatalogue(){if(!settings)return;const root=$('zoneCatalogue');root.replaceChildren();const query=$('zoneSearch').value.trim().toLocaleLowerCase(),region=$('zoneRegion').value;const matches=catalogue.filter(z=>(!region||z.region===region)&&(!query||(zoneLabel(z)+' '+z.id).toLocaleLowerCase().includes(query)));matches.slice(0,visibleZones).forEach(z=>{const row=document.createElement('div');row.className='catalog-row';const text=document.createElement('div'),name=document.createElement('strong'),detail=document.createElement('small');name.textContent=zoneLabel(z);detail.textContent=offsetLabel(z.id);text.append(name,detail);const button=document.createElement('button');button.type='button';button.className='secondary';button.textContent=selectedZones.includes(z.id)?'✓':'+ '+t('clock.add');button.disabled=selectedZones.includes(z.id)||selectedZones.length>=12;button.onclick=()=>{selectedZones.push(z.id);renderSelected();renderCatalogue();};row.append(text,button);root.append(row);});if(!matches.length)root.textContent=t('clock.noResults');$('moreZones').hidden=matches.length<=visibleZones;}
function loadMarketsDraft(){marketsDraft={};for(const m of data.config.markets||[])marketsDraft[m.id]={enabled:!!m.enabled,symbols:m.symbols.slice(),names:(m.names||[]).slice()};for(const m of settings.stockMarkets||[])if(!marketsDraft[m.id])marketsDraft[m.id]={enabled:false,symbols:[],names:[]};for(const d of Object.values(marketsDraft))while(d.names.length<d.symbols.length)d.names.push('');if(!marketsDraft[stockMarket])stockMarket=Object.keys(marketsDraft)[0]||'us';stocksDraft=marketsDraft[stockMarket].symbols;}
// The device relays the provider's raw answer: Tencent replies in GBK (decoded here), Yahoo in JSON.
async function lookupStock(market,code){const r=await fetch('/api/stock/lookup?market='+encodeURIComponent(market)+'&code='+encodeURIComponent(code),{cache:'no-store'});if(!r.ok){let message='HTTP '+r.status;try{message=(await r.json()).error||message}catch{}throw Error(message);}const bytes=await r.arrayBuffer();if(r.headers.get('X-Stock-Source')==='yahoo'){const meta=JSON.parse(new TextDecoder().decode(bytes))?.spark?.result?.[0]?.response?.[0]?.meta;return meta?(meta.shortName||meta.longName||'').trim():'';}const match=new TextDecoder('gbk').decode(bytes).match(/v_[^=]+="([^"]*)"/);if(!match||!match[1])return '';const name=(match[1].split('~')[1]||'').trim();return /[぀-ヿ一-鿿가-힯]/.test(name)?name.replace(/\s+/g,''):name.replace(/\s+/g,' ');}
function renderMarketControls(){const select=$('stockMarket');if(!select||!settings.stockMarkets)return;select.replaceChildren();for(const m of settings.stockMarkets){const draft=marketsDraft[m.id]||{enabled:false,symbols:[]};select.add(new Option(t('market.'+m.id)+' · '+m.currency+(draft.enabled?' ✓':''),m.id));}select.value=stockMarket;const info=settings.stockMarkets.find(m=>m.id===stockMarket);$('stockMarketEnabled').checked=!!marketsDraft[stockMarket]?.enabled;$('stockExample').textContent=info?t('stocks.example')+' '+info.example+' · '+info.source:'';}
function renderStocks(){if(!settings)return;renderMarketControls();const names=marketsDraft[stockMarket].names;const root=$('stockRows');root.replaceChildren();$('stockCount').textContent=stocksDraft.length+'/6';$('addStock').disabled=stocksDraft.length>=6;stocksDraft.forEach((value,index)=>{const row=document.createElement('div');row.className='list-row stock-row';const number=document.createElement('span');number.className='row-index';number.textContent=String(index+1).padStart(2,'0');const input=document.createElement('input');input.className='stock-code';input.value=value;input.maxLength=11;input.required=true;input.setAttribute('aria-label',t('stocks.list')+' '+(index+1));input.addEventListener('input',()=>stocksDraft[index]=input.value);const name=document.createElement('input');name.className='stock-name';name.value=names[index]||'';name.maxLength=30;name.placeholder=t('stocks.name');name.setAttribute('aria-label',t('stocks.name')+' '+(index+1));name.addEventListener('input',()=>names[index]=name.value);const find=async()=>{const code=input.value.trim().toUpperCase();if(!code)return;try{const found=await lookupStock(stockMarket,code);if(!found){toast(t('stocks.lookupFailed'),true);return;}names[index]=found;name.value=found;}catch(e){toast(e.message,true);}};input.addEventListener('change',()=>{if(!name.value.trim())find();});const buttons=document.createElement('div');buttons.className='row-actions';const move=direction=>{const next=index+direction;if(next<0||next>=stocksDraft.length)return;[stocksDraft[index],stocksDraft[next]]=[stocksDraft[next],stocksDraft[index]];[names[index],names[next]]=[names[next],names[index]];renderStocks();};buttons.append(action('stocks.lookup','🔍',find),action('button.up','↑',()=>move(-1)),action('button.down','↓',()=>move(1)),action('button.remove','×',()=>{stocksDraft.splice(index,1);names.splice(index,1);renderStocks();}));row.append(number,input,name,buttons);root.append(row);});}
function renderCities(){
 if(!settings)return;
 const root=$('cityRows');root.replaceChildren();$('cityCount').textContent=citiesDraft.length+'/'+settings.maxWeatherPages;
 citiesDraft.forEach((city,index)=>{
  const row=document.createElement('div');row.className='list-row';
  const num=document.createElement('span');num.className='row-index';num.textContent=String(index+1).padStart(2,'0');
  const label=document.createElement('div');label.className='row-label';
  const input=document.createElement('input');input.value=city.city;input.required=true;input.setAttribute('aria-label',t('weather.cityName')+' '+(index+1));
  input.oninput=()=>city.city=input.value;
  const detail=document.createElement('small');detail.textContent=city.latitude.toFixed(5)+' , '+city.longitude.toFixed(5);label.append(input,detail);
  const buttons=document.createElement('div');buttons.className='row-actions';
  const move=direction=>{const next=index+direction;if(next<0||next>=citiesDraft.length)return;[citiesDraft[index],citiesDraft[next]]=[citiesDraft[next],citiesDraft[index]];if(editingCity===index)editingCity=next;else if(editingCity===next)editingCity=index;renderCities();renderLocation();};
  buttons.append(action('button.edit','✎',()=>{editingCity=index;locationDraft={...city};renderLocation();$('citySearch').focus();}),action('button.up','↑',()=>move(-1)),action('button.down','↓',()=>move(1)),action('button.remove','×',()=>{citiesDraft.splice(index,1);if(editingCity===index){editingCity=-1;locationDraft=null;}else if(editingCity>index)editingCity--;renderCities();renderLocation();}));
  row.append(num,label,buttons);root.append(row);
 });
}
function renderLocation(){
 $('cityLabel').textContent=locationDraft?.city||t('weather.choose');
 $('coordinateLabel').textContent=locationDraft?Number(locationDraft.latitude).toFixed(5)+' , '+Number(locationDraft.longitude).toFixed(5):'';
 $('cityEditing').textContent=editingCity<0?t(citiesDraft.length>=settings.maxWeatherPages?'weather.fullHint':'weather.addHint'):t('weather.editHint')+' '+(editingCity+1);
 $('applyCity').textContent=t(editingCity<0?'weather.applyCity':'weather.replaceCity');
 $('applyCity').disabled=!locationDraft||(editingCity<0&&citiesDraft.length>=settings.maxWeatherPages);
 $('cancelCity').hidden=!locationDraft&&editingCity<0;
}
function applyCity(){
 if(!locationDraft)return;
 const duplicate=citiesDraft.some((city,index)=>index!==editingCity&&Math.abs(city.latitude-locationDraft.latitude)<0.00001&&Math.abs(city.longitude-locationDraft.longitude)<0.00001);
 if(duplicate){toast(t('weather.duplicate'),true);return;}
 if(editingCity<0){if(citiesDraft.length>=settings.maxWeatherPages)return;citiesDraft.push({...locationDraft});}
 else citiesDraft[editingCity]={...locationDraft};
 editingCity=-1;locationDraft=null;renderCities();renderLocation();
}
function stateText(cache){return cache.ok?t('status.ok'):(cache.valid?t('status.stale'):t('status.loading'))+(cache.error?' · '+cache.error:'');}
function renderData(){if(!data)return;$('weatherStatus').textContent=data.weathers.map(w=>w.city+' · '+stateText(w)+' · '+(w.valid?w.temperature.toFixed(1)+(data.config.fahrenheit?' °F':' °C'):'—')).join('   |   ');$('btcStatus').textContent=data.btcPages.map(p=>'BTC/'+p.currency+' · '+(p.valid?p.price.toLocaleString(lang,{maximumFractionDigits:p.currency==='JPY'?0:2}):'—')+' · '+stateText(p)+(p.fxDate?' · '+t('bitcoin.rateTime')+' '+p.fxDate:'')).join('   |   ');$('stockStatus').textContent=data.stocks.map(q=>t('market.'+(q.market||'us'))+' '+(q.name?q.name+' ':'')+q.symbol+' '+(q.valid?q.price.toFixed(2):'—')+' · '+stateText(q)).join('   |   ');$('sourceSummary').textContent='● '+[data.weathers.length>0&&data.weathers.every(w=>w.ok),data.btc.ok,data.stocks.length>0&&data.stocks.every(q=>q.ok)].filter(Boolean).length+'/3';}
const themeNames = Array.from({length:9},(_,id)=>"theme.color"+id);
const themeColors = [['#000000','#33ccff'],['#d9efff','#005087'],['#f5f1e5','#20201c'],
 ['#c7d6a2','#244924'],['#251200','#ffad49'],['#0d071c','#b898ff'],['#190817','#ff85df'],
 ['#ffffff','#003b80'],['#000000','#67e8f9']];
function initTheme() {
 const form=$('themeForm'), manual=$('themeManual'), mode=$('themeMode'), rows=$('themeRows');
 const options=select=>themeNames.forEach((name,id)=>{const option=new Option(t(name),id);option.dataset.i18n=name;select.add(option);});
 const sample=()=>{
  const [background,color]=themeColors[Number(manual.value)];
  Object.assign($('themeSample').style,{background,color});
 };
 const add=(id=0,minute=0)=>{
  const row=document.createElement('div');row.className='theme-entry';
  const time=document.createElement('input');time.type='time';time.required=true;
  time.dataset.aria='theme.time';time.setAttribute('aria-label',t('theme.time'));
  time.value=String(Math.floor(minute/60)).padStart(2,'0')+':'+String(minute%60).padStart(2,'0');
  const select=document.createElement('select');options(select);select.value=id;
  select.dataset.aria='theme.title';select.setAttribute('aria-label',t('theme.title'));
  const remove=document.createElement('button');remove.type='button';remove.textContent='×';
  remove.dataset.aria='theme.remove';remove.setAttribute('aria-label',t('theme.remove'));
  remove.onclick=()=>{row.remove();update();queueSave();};
  row.append(time,select,remove);rows.append(row);
 };
 const update=()=>{
  rows.hidden=mode.value==='0';
  $('themeAdd').hidden=rows.hidden;
  $('themeAdd').disabled=rows.children.length>=themeNames.length;
  for(const time of rows.querySelectorAll('input')){
   time.hidden=mode.value!=='1';time.disabled=time.hidden;
  }
  sample();
 };
 let timer, pending=Promise.resolve();
 const queueSave=()=>{clearTimeout(timer);timer=setTimeout(save,350);};
 options(manual);
 form.onchange=()=>{
  if(mode.value!=='0'&&!rows.children.length)add(Number(manual.value));
  update();queueSave();
 };
 form.onsubmit=event=>event.preventDefault();
 $('themeAdd').onclick=()=>{add(rows.children.length);update();};
 const save=()=>{
  if(!form.reportValidity())return;
  const entries=mode.value==='0'?[]:Array.from(rows.children,row=>{
   const [hour,minute]=row.querySelector('input').value.split(':').map(Number);
   return {id:Number(row.querySelector('select').value),minute:mode.value==='1'?hour*60+minute:0};
  });
  const payload={manual:Number(manual.value),mode:Number(mode.value),entries};
  pending=pending.then(async()=>{
   try {
    const fresh=await api('/api/theme',payload);
    settings.theme=fresh.theme;
   } catch(error) {
    loadTheme(settings.theme);
    toast(error.message,true);
   }
  });
 };
 return theme=>{
  manual.replaceChildren();options(manual);manual.value=theme.manual;mode.value=theme.mode;rows.replaceChildren();
  theme.entries.forEach(entry=>add(entry.id,entry.minute));update();
 };
}
let loadTheme;
let carouselTimer,carouselSaving=false,carouselPending=false;
// Enabled stock markets in table order (one device page each).
function enabledMarkets(){return (data?.config?.markets||[]).filter(m=>m.enabled).map(m=>m.id);}
// Pages the carousel can play, in the device's fixed order (src/carousel.h): clock pages,
// calendar month / today, next alarm / timer, weather cities, air quality cities, Bitcoin
// currencies, stock markets.
function carouselChoices(){
 const on=key=>settings.enabledModules&(1<<MODULE_BITS[key]),cities=(data?.config?.cities||[]).map(c=>c.city),out=[];
 const perPage=settings.angle%180?4:3,clockPages=Math.max(1,Math.ceil((settings.zones||[]).length/perPage));
 if(on('clock'))for(let g=0;g<clockPages;g++)out.push([0,g,t('nav.clock')+(clockPages>1?' '+(g+1)+'/'+clockPages:'')]);
 if(on('calendar')){out.push([10,0,t('nav.calendar')+' · '+t('calendar.today')]);out.push([10,1,t('nav.calendar')+' · '+t('carousel.month')]);out.push([10,2,t('nav.calendar')+' · '+t('calendar.upcoming')]);}
 if(on('alarm')){out.push([7,0,t('alarm.next')]);out.push([7,1,t('timer.title')]);}
 if(on('weather'))cities.forEach((city,g)=>out.push([3,g,t('nav.weather')+' · '+city]));
 if(on('air'))cities.forEach((city,g)=>out.push([11,g,t('nav.air')+' · '+city]));
 if(on('bitcoin'))(data?.config?.currencies||[]).forEach((code,g)=>out.push([1,g,'BTC / '+code]));
 if(on('stocks'))enabledMarkets().forEach((id,g)=>out.push([2,g,t('nav.stocks')+' · '+t('market.'+id)]));
 return out;
}
function renderCarouselPages(){
 const root=$('carouselPages');if(!root||!settings?.carousel)return;root.replaceChildren();
 const chosen=new Map((settings.carousel.pages||[]).map(p=>[p.page+':'+p.group,p.seconds]));
 for(const [page,group,label] of carouselChoices()){
  const row=document.createElement('div');row.className='carousel-page';row.dataset.page=page;row.dataset.group=group;
  const check=document.createElement('label');check.className='check-line';const box=document.createElement('input');box.type='checkbox';
  box.checked=chosen.has(page+':'+group);const name=document.createElement('span');name.textContent=label;check.append(box,name);
  const seconds=document.createElement('input');seconds.type='number';seconds.min=3;seconds.max=300;seconds.step=1;seconds.required=true;
  seconds.value=chosen.get(page+':'+group)||10;seconds.disabled=!box.checked;seconds.setAttribute('aria-label',label+' '+t('carousel.secondsUnit'));
  const unit=document.createElement('span');unit.className='duration-unit';unit.textContent='s';
  box.onchange=()=>{seconds.disabled=!box.checked;queueCarouselSave();};seconds.addEventListener('change',queueCarouselSave);
  row.append(check,seconds,unit);root.append(row);
 }
}
// Single screen: what each of the four cells shows (POST /api/single-screen {cells}).
const SINGLE_KINDS=[['clock','nav.clock'],['weather','nav.weather'],['calendar','nav.calendar'],['alarm','nav.alarm'],['air','nav.air'],['date','single.date'],['timer','timer.title'],['bitcoin','nav.bitcoin'],['stocks','nav.stocks']];
function renderSingleCells(){
 const root=$('singleCells');if(!root||!settings?.single||root.contains(document.activeElement))return;root.replaceChildren();
 const portrait=settings.angle%180!==0;
 const places=portrait?['single.row1','single.row2','single.row3','single.row4']:['single.topLeft','single.topRight','single.bottomLeft','single.bottomRight'];
 const zones=(settings.zones||[]).map(id=>{const z=catalogue.find(item=>item.id===id);return z?zoneLabel(z):id;});
 const cities=(data?.config?.cities||[]).map(c=>c.city),currencies=(data?.config?.currencies||[]).map(code=>'BTC / '+code),markets=enabledMarkets().map(id=>t('market.'+id));
 settings.single.forEach((cell,i)=>{
  const row=document.createElement('div');row.className='single-cell';
  const label=document.createElement('strong');label.textContent=t(places[i]);
  const kind=document.createElement('select');kind.setAttribute('aria-label',t(places[i]));
  SINGLE_KINDS.forEach(([value,key])=>kind.add(new Option(t(key),value)));kind.value=cell.kind;
  const index=document.createElement('select');
  const fill=()=>{index.replaceChildren();const list=kind.value==='clock'?zones:['weather','air'].includes(kind.value)?cities:kind.value==='bitcoin'?currencies:kind.value==='stocks'?markets:[];
   list.forEach((name,n)=>index.add(new Option(name,n)));index.hidden=!list.length;index.value=String(Math.min(cell.index,Math.max(0,list.length-1)));};
  fill();
  kind.onchange=()=>{cell.kind=kind.value;cell.index=0;fill();saveSingleCells();};
  index.onchange=()=>{cell.index=Number(index.value);saveSingleCells();};
  row.append(label,kind,index);root.append(row);
 });
}
async function saveSingleCells(){
 try{const fresh=await api('/api/single-screen',{cells:settings.single.map(c=>({kind:c.kind,index:Number(c.index)||0}))});settings.single=fresh.single;toast(t('app.saved'));}
 catch(e){toast(e.message,true);}
}
function renderCarousel(){
 for(const id of ['clockSeconds','weatherPageSeconds','btcPageSeconds','stockPageSeconds']){const input=$(id);if(!input)continue;input.disabled=!!settings?.carousel?.enabled;input.title=input.disabled?t('carousel.controlled'):'';let note=$('carousel-note-'+id);if(!note){note=document.createElement('p');note.id='carousel-note-'+id;note.className='hint';input.after(note);}note.hidden=!input.disabled;note.textContent=input.title;}
 const form=$('carouselForm');
 if(!settings?.carousel||carouselSaving||form.contains(document.activeElement))return;
 $('carouselEnabled').checked=settings.carousel.enabled;
 renderCarouselPages();
}
function queueCarouselSave(){
 clearTimeout(carouselTimer);
 carouselTimer=setTimeout(saveCarousel,650);
}
async function saveCarousel(){
 if(carouselSaving){carouselPending=true;return;}
 if(!$('carouselForm').checkValidity())return;
 const values={
  enabled:$('carouselEnabled').checked,
  // Ticked pages of this list; ticked pages of cities or clocks that are gone are dropped.
  pages:[...$('carouselPages').querySelectorAll('.carousel-page')].filter(row=>row.querySelector('input[type=checkbox]').checked)
   .map(row=>({page:Number(row.dataset.page),group:Number(row.dataset.group),seconds:Math.min(300,Math.max(3,Number(row.querySelector('input[type=number]').value)||10))}))
 };
 if(values.enabled&&settings.singleScreen&&!confirm(t('carousel.confirmSingle'))){$('carouselEnabled').checked=false;return;}
 carouselSaving=true;
 try{
  const fresh=await api('/api/carousel',values);
  settings.carousel=fresh.carousel;
  settings.singleScreen=fresh.singleScreen;
  $('singleScreen').checked=fresh.singleScreen;
  toast(t('app.saved'));
 }catch(error){toast(error.message,true);}
 finally{
  carouselSaving=false;
  if(carouselPending){carouselPending=false;queueCarouselSave();}
  else renderCarousel();
 }
}
function renderSystem(){const s=settings;renderCarousel();renderSingleCells();$('singleScreen').checked=s.singleScreen;$('aboutBuild').textContent=s.version+' · '+(s.hardware.boardName?s.hardware.boardName+' · ':'')+s.hardware.controller+' · '+s.hardware.width+'×'+s.hardware.height;$('deviceIP').textContent=s.ip;$('networkIP').textContent=s.ip;$('networkMac').textContent=s.mac||'—';$('networkName').textContent=s.ssid||'CWBSM-setup';renderMaintenance();$('rotation').value=s.angle;$('rotationAngle').textContent=s.angle+'°';document.querySelector('.tiny-display').style.transform='rotate('+(-s.angle)+'deg)';$('setupHint').hidden=!s.provisioning;}
const BEIJING={city:'Beijing',latitude:39.9075,longitude:116.39723};
function chooseBeijing(){locationDraft={...BEIJING,city:({zh:'北京',ja:'北京',ko:'베이징',de:'Peking',fr:'Pékin',es:'Pekín'})[lang]||'Beijing'};$('country').value='CN';renderLocation();$('locations').replaceChildren();}
async function searchCity(){
 const query=$('citySearch').value.trim();if(!query)return;
 const isBeijing=['北京','北京市','beijing','peking','pékin','pekín','pekin','베이징'].includes(query.toLowerCase().replace(/\s+/g,''));
 if(isBeijing)$('country').value='CN';
 const root=$('locations');root.textContent=t('button.searching');$('searchCity').disabled=true;
 try{
  const parameters=new URLSearchParams({count:'8',format:'json',language:lang,name:isBeijing?'Beijing':query});
  if($('country').value)parameters.set('countryCode',$('country').value);
  const response=await fetch('https://geocoding-api.open-meteo.com/v1/search?'+parameters,{signal:AbortSignal.timeout(12000)});
  if(!response.ok)throw Error('HTTP '+response.status);
  const result=await response.json();let places=result.results||[];
  if(isBeijing)places=places.filter(p=>p.country_code==='CN'&&p.feature_code==='PPLC');
  root.replaceChildren();
  if(!places.length&&isBeijing){chooseBeijing();return;}
  if(!places.length)root.textContent=t('button.noResults');
  for(const place of places){
   const button=document.createElement('button');button.type='button';
   button.textContent=[place.name,place.admin1,place.country].filter(Boolean).join(', ');
   button.onclick=()=>{locationDraft={city:[place.name,place.admin1].filter(Boolean).join(', '),latitude:place.latitude,longitude:place.longitude};renderLocation();root.replaceChildren();};root.append(button);
  }
 }catch{if(isBeijing)chooseBeijing();else root.textContent=t('weather.searchFailed');}
 finally{$('searchCity').disabled=false;}
}
// NTP re-sync interval and when the device last heard from the time server.
const NTP_CHOICES=[15,30,60,180,360,720,1440];
function renderNtp(reset){const select=$('ntpMinutes');if(!select||!settings)return;const value=reset?String(settings.ntpMinutes||60):select.value||String(settings.ntpMinutes||60);select.replaceChildren();NTP_CHOICES.forEach(m=>select.add(new Option(m<60?m+' '+t('unit.min'):m/60+' '+t('unit.h'),m)));select.value=value;
 const ago=settings.ntpLastSync;$('ntpStatus').textContent=t('clock.ntpHint')+' '+(ago==null||ago<0?t('clock.ntpNever'):t('clock.ntpLast').replace('{t}',ago<120?ago+' '+t('unit.s'):Math.round(ago/60)+' '+t('unit.min')));}
function renderClockAnimation(){
 if(!animationDraft)return;
 const root=$('clockParts');root.replaceChildren();
 const parts = $('clockShowSeconds').checked ? ['hour','minute','second'] : ['hour','minute'];
 parts.forEach((part,index)=>{
  const row=document.createElement('div');row.className='clock-part';
  const name=document.createElement('strong');name.textContent=t('clock.'+part);
  const select=document.createElement('select');select.id='effect'+index;select.setAttribute('aria-label',t('clock.'+part)+' '+t('clock.effect'));
  settings.clockEffects.forEach(effect=>select.add(new Option(t('effect.'+effect),effect)));
  select.value=animationDraft.effects[index];select.onchange=()=>animationDraft.effects[index]=select.value;
  const label=document.createElement('label');label.textContent=t('clock.duration');label.htmlFor='duration'+index;
  const duration=document.createElement('input');duration.id='duration'+index;duration.type='number';duration.min=100;duration.max=2000;duration.step=10;duration.required=true;duration.value=animationDraft.durations[index];duration.oninput=()=>animationDraft.durations[index]=Number(duration.value);
  const unit=document.createElement('span');unit.className='duration-unit';unit.dataset.i18n='unit.ms';unit.textContent=t('unit.ms');
  duration.setAttribute('aria-label',name.textContent+' '+label.textContent);
  row.append(name,select,duration,unit);root.append(row);
 });
 const separator=$('clockSeparator');separator.replaceChildren();['steady','blink','breathe'].forEach(value=>separator.add(new Option(t('separator.'+value),value)));separator.value=animationDraft.separator;separator.onchange=()=>animationDraft.separator=separator.value;
}
function renderDisplayOptions(){
 if(!settings)return;
 const select=$('ledMode'),previous=select.value||settings.display.ledMode;select.replaceChildren();
 ['solid','breathe','aurora','air'].forEach(mode=>select.add(new Option(t('led.'+mode),mode)));select.value=previous;
 renderDisplayLive();updateDisplayFields();
}
function renderDisplayLive(){
 const live=settings?.displayState;if(!live)return;
 $('displayLive').textContent=t('display.actual')+' '+live.brightness+'% · '+t('display.sensor')+' '+(settings.hardware?.hasLightSensor===false?t('hardware.noLight'):live.ambientRaw)+' · '+t(live.screenOn?'display.awake':'display.asleep');
 $('scheduleZone').textContent=t('display.zone')+' '+live.scheduleZone;
}
function updateDisplayFields(){
 $('brightnessValue').textContent=$('brightness').value+'%';$('ledBrightnessValue').textContent=$('ledBrightness').value+'%';
 if(settings?.hardware?.hasLightSensor===false){$('automatic').checked=false;$('automatic').disabled=true;}
 $('brightness').disabled=$('automatic').checked;$('autoFields').hidden=!$('automatic').checked;
 $('ledColor').disabled=$('ledMode').value==='aurora';
}
const minuteString=value=>String(Math.floor(value/60)).padStart(2,'0')+':'+String(value%60).padStart(2,'0');
const timeMinute=value=>{const [hour,minute]=value.split(':').map(Number);return hour*60+minute;};
function displayValues(){
 const result={};['idleSeconds','brightness','autoMin','autoMax','darkRaw','brightRaw','ledBrightness'].forEach(key=>result[key]=Number($(key).value));
 ['automatic','schedule','ledEnabled','ledFollowScreen'].forEach(key=>result[key]=$(key).checked);
 if(settings?.hardware?.hasLightSensor===false)result.automatic=settings.display.automatic;
 result.onMinute=timeMinute($('onTime').value);result.offMinute=timeMinute($('offTime').value);
 result.ledMode=$('ledMode').value;result.ledColor=$('ledColor').value;return result;
}
async function saveTracker(section,values){const result=await api('/api/tracker',{section,...values});data=result;renderData();}
// Only English (the fallback) and the page language load at start; another language loads
// when it is picked. The device serves one request at a time, so seven files at once were slow.
async function loadDictionary(code){if(dictionaries[code])return;const response=await fetch('/locales/'+code+'.json');if(!response.ok)throw Error('Locale unavailable');dictionaries[code]=await response.json();}
// Clocks per page: 0 = automatic; landscape up to 4 (2 x 2), portrait up to 6 (2 x 3).
function renderClocksPerPage(){const chosen=settings.clocksPerPage||{};[['clocksLandscape',4,'landscape'],['clocksPortrait',6,'portrait']].forEach(([id,max,key])=>{const el=$(id);el.replaceChildren();const auto=new Option('','0');auto.dataset.i18n='clock.perPageAuto';el.add(auto);for(let n=1;n<=max;++n)el.add(new Option(String(n),String(n)));el.value=String(chosen[key]||0);});}
async function start(){try{settings=await api('/api/settings');for(const locale of settings.locales)$('language').add(new Option(locale.name,locale.code));await loadDictionary('en');await loadDictionary(settings.language);catalogue=await(await fetch('/zones.json')).json();offsets=(await api('/api/zones')).offsets;data=await api('/api/data');lang=settings.language;$('language').value=lang;selectedZones=settings.zones.slice();loadMarketsDraft();currenciesDraft=data.config.currencies.slice();zoneStylesDraft=Object.fromEntries(settings.clockStyles.map(style=>[style.id,{color:style.color}]));animationDraft=JSON.parse(JSON.stringify(settings.clockAnimation));$('btcPageSeconds').value=settings.btcPageSeconds;citiesDraft=data.config.cities.map(city=>({...city}));locationDraft=null;$('weatherPageSeconds').value=settings.weatherPageSeconds;$('clockSeconds').value=settings.clockSeconds;$('clockShowSeconds').checked=settings.clockShowSeconds!==false;renderClocksPerPage();$('clockHourFormat').value=settings.clock12?'12':'24';renderNtp(true);$('clockShowSeconds').onchange=renderClockAnimation;$('stockPageSeconds').value=settings.stockPageSeconds;$('weatherMinutes').value=data.config.weatherMinutes;$('btcSeconds').value=data.config.btcSeconds;$('stockSeconds').value=data.config.stockSeconds;$('unit').value=data.config.fahrenheit?'F':'C';Object.entries(settings.display).forEach(([key,value])=>{const el=$(key);if(!el)return;if(el.type==='checkbox')el.checked=value;else if(key!=='ledMode')el.value=value;});$('onTime').value=minuteString(settings.display.onMinute);$('offTime').value=minuteString(settings.display.offMinute);setupSystemTabs();if(settings.theme)loadTheme(settings.theme);renderCountries();$('country').value=countryForLanguage(lang);renderSystem();translate();syncIdle();await mfaInit();if(typeof alarmInit==='function')await alarmInit();if(typeof radioInit==='function')await radioInit();if(typeof calendarInit==='function')await calendarInit();if(typeof airInit==='function')await airInit();if(typeof filesInit==='function')await filesInit();$('loading').hidden=true;const requested=location.hash.slice(1);section(settings.provisioning?'network':['system','network','clock','calendar','weather','air','bitcoin','stocks','mfa','alarm','radio','files','about'].includes(requested)?requested:'system');if(settings.provisioning)$('wifiForm').closest('details').open=true;else{const panelKey={maintenance:'system.maintenance',screen:'system.screen',theme:'theme.title',footer:'footer.config',backup:'backup.title'}[requested];if(panelKey)document.querySelector('.system-tabs button[data-i18n="'+panelKey+'"]')?.click();}if(data.pageLimitMigrated)toast(t('app.trimmed'));}catch(error){$('loading').textContent='Connection failed / 连接失败 · '+error.message;return;}
 document.querySelectorAll('.nav').forEach(button=>button.onclick=()=>section(button.dataset.section));
 for (const name of ['clock', 'weather', 'bitcoin']) {
  const input = $(name + 'Digits');
  input.value = settings.fonts[name] ? 'regular' : 'digital';
  input.onchange = async () => {
   input.disabled = true;
   try {
    settings = await api('/api/fonts', {section: name, regular: input.value === 'regular'});
    toast(t('app.saved'));
   } catch (error) {
    input.value = settings.fonts[name] ? 'regular' : 'digital';
    toast(error.message, true);
   } finally { input.disabled = false; }
  };
 }
 $('unit').onchange = async () => {
  const input = $('unit');
  input.disabled = true;
  try {
   data = await api('/api/weather-unit', {fahrenheit: input.value === 'F'});
   renderData();
   toast(t('app.saved'));
  } catch (error) {
   input.value = data.config.fahrenheit ? 'F' : 'C';
   toast(error.message, true);
  } finally { input.disabled = false; }
 };

 $('language').onchange=async()=>{try{await loadDictionary($('language').value);}catch(e){toast(e.message,true);$('language').value=lang;return;}lang=$('language').value;$('country').value=countryForLanguage(lang);translate();try{settings=await api('/api/system',{language:lang});toast(t('app.saved'));}catch(e){toast(e.message,true);}};
 $('zoneSearch').oninput=()=>{visibleZones=35;renderCatalogue();};$('zoneRegion').onchange=()=>{visibleZones=35;renderCatalogue();};$('moreZones').onclick=()=>{visibleZones+=35;renderCatalogue();};
 $('addCurrency').onclick=()=>{const code=$('currencyChoice').value;if(code&&!currenciesDraft.includes(code)&&currenciesDraft.length<settings.maxBtcPages){currenciesDraft.push(code);renderCurrencies();}};
 $('addStock').onclick=()=>{if(stocksDraft.length<6){stocksDraft.push('');marketsDraft[stockMarket].names.push('');renderStocks();}};
 $('stockMarket').onchange=e=>{stockMarket=e.target.value;stocksDraft=marketsDraft[stockMarket].symbols;renderStocks();};
 $('stockMarketEnabled').onchange=e=>{marketsDraft[stockMarket].enabled=e.target.checked;renderMarketControls();};
 $('applyCity').onclick=applyCity;$('cancelCity').onclick=()=>{editingCity=-1;locationDraft=null;renderLocation();};$('quickBeijing').onclick=chooseBeijing;$('searchCity').onclick=searchCity;$('citySearch').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();searchCity();}});
 $('stockPageSeconds').addEventListener('input',()=>stockPageDirty=true);
 $('singleScreen').onchange=async event=>{
  const toggle=event.target;
  if(toggle.checked&&settings.carousel.enabled&&!confirm(t('system.confirmCarousel'))){toggle.checked=false;return;}
  toggle.disabled=true;
  try{
   const result=await api('/api/single-screen',{enabled:toggle.checked});
   settings.singleScreen=result.singleScreen;settings.carousel=result.carousel;renderCarousel();
   toast(t('app.saved'));
  }catch(error){toast(error.message,true);}
  finally{toggle.checked=settings.singleScreen;toggle.disabled=false;}
 };
 $('systemForm').onsubmit=e=>{e.preventDefault();submit(e.target,async()=>{settings=await api('/api/system',{language:lang});renderSystem();});};
 $('brightness').oninput=()=>{updateDisplayFields();clearTimeout(previewTimer);previewTimer=setTimeout(async()=>{try{const fresh=await api('/api/display/preview',{brightness:Number($('brightness').value)});settings.displayState=fresh.displayState;renderDisplayLive();}catch(error){toast(error.message,true);}},180);};
 $('automatic').onchange=updateDisplayFields;$('ledMode').onchange=updateDisplayFields;$('ledBrightness').oninput=updateDisplayFields;
 for(const [button,input] of [['sampleDark','darkRaw'],['sampleBright','brightRaw']])$(button).onclick=async()=>{try{$(input).value=(await api('/api/settings')).displayState.ambientRaw;queueDisplaySave();}catch(error){toast(error.message,true);}};
 $('wakeScreen').onclick=async()=>{try{await api('/api/display/wake',{});toast(t('display.woken'));}catch(error){toast(error.message,true);}};
 $('displayForm').onsubmit=e=>{e.preventDefault();const values=displayValues();if(values.autoMin>values.autoMax||Math.abs(values.darkRaw-values.brightRaw)<100||(values.schedule&&values.onMinute===values.offMinute)){toast(t('display.invalid'),true);return;}submit(e.target,async()=>{clearTimeout(previewTimer);const fresh=await api('/api/display',values);settings.display=fresh.display;settings.displayState=fresh.displayState;renderDisplayLive();});};
 $('rotation').onchange=async()=>{if(rotationBusy)return;rotationBusy=true;$('rotation').disabled=true;try{settings=await api('/api/rotation',{angle:Number($('rotation').value)});renderSystem();toast(t('app.saved'));}catch(error){renderSystem();toast(t('app.error')+' · '+error.message,true);}finally{rotationBusy=false;$('rotation').disabled=false;}};
 $('clockForm').onsubmit=e=>{e.preventDefault();if(!selectedZones.length){toast(t('clock.empty'),true);return;}submit(e.target,async()=>{settings=await api('/api/clock',{zones:selectedZones,clockSeconds:Number($('clockSeconds').value),clockShowSeconds:$('clockShowSeconds').checked,clocksPerPage:{landscape:Number($('clocksLandscape').value),portrait:Number($('clocksPortrait').value)},clock12:$('clockHourFormat').value==='12',ntpMinutes:Number($('ntpMinutes').value),animation:animationDraft,styles:selectedZones.map((id,index)=>({id,...(zoneStylesDraft[id]||{color:['#00ff88','#33ccff','#ffaa33'][index%3]})}))});});};
 $('weatherForm').onsubmit=e=>{e.preventDefault();if(!citiesDraft.length||citiesDraft.length>settings.maxWeatherPages){toast(t('weather.empty'),true);return;}if(locationDraft){toast(t('weather.pending'),true);return;}submit(e.target,()=>saveTracker('weather',{cities:citiesDraft,fahrenheit:$('unit').value==='F',weatherMinutes:Number($('weatherMinutes').value),weatherPageSeconds:Number($('weatherPageSeconds').value)}));};
 $('bitcoinForm').onsubmit=e=>{e.preventDefault();if(!currenciesDraft.length||currenciesDraft.length>settings.maxBtcPages){toast(t('bitcoin.empty'),true);return;}submit(e.target,()=>saveTracker('bitcoin',{btcSeconds:Number($('btcSeconds').value),currencies:currenciesDraft,btcPageSeconds:Number($('btcPageSeconds').value)}));};
 $('stocksForm').onsubmit=e=>{e.preventDefault();const markets=Object.entries(marketsDraft).map(([id,m])=>({id,enabled:m.enabled,symbols:m.symbols.map(v=>v.trim().toUpperCase()),names:m.symbols.map((_,i)=>(m.names[i]||'').trim())}));const bad=markets.find(m=>m.symbols.some(v=>!/^[A-Z0-9][A-Z0-9.-]{0,10}$/.test(v))||new Set(m.symbols).size!==m.symbols.length);if(bad){stockMarket=bad.id;stocksDraft=marketsDraft[bad.id].symbols;renderStocks();toast(t('stocks.invalid'),true);return;}submit(e.target,async()=>{await saveTracker('stocks',{markets,stockSeconds:Number($('stockSeconds').value),stockPageSeconds:Number($('stockPageSeconds').value)});stockPageDirty=false;loadMarketsDraft();renderStocks();});};
 $('wifiForm').onsubmit=e=>{e.preventDefault();submit(e.target,async()=>{await api('/api/wifi',{ssid:$('ssid').value,password:$('password').value});});};
 $('resetWifi').onclick=async()=>{if(!confirm(t('system.resetConfirm')))return;try{await api('/api/wifi/reset',{});toast(t('app.saved'));}catch(error){toast(error.message,true);}};
 setupAutoSave();
 setInterval(async()=>{if(document.hidden)return;try{const fresh=await api('/api/status');settings.carousel=fresh.carousel;settings.singleScreen=fresh.singleScreen;settings.rotated=fresh.rotated;settings.angle=fresh.angle;settings.mac=fresh.mac;if(!rotationBusy){$('rotation').value=fresh.angle;$('rotationAngle').textContent=fresh.angle+'°';document.querySelector('.tiny-display').style.transform='rotate('+(-fresh.angle)+'deg)';}settings.ip=fresh.ip;settings.heap=fresh.heap;settings.ssid=fresh.ssid;settings.provisioning=fresh.provisioning;settings.displayState=fresh.displayState;settings.device=fresh.device;if(!moduleBusy)settings.enabledModules=fresh.enabledModules;settings.page=fresh.page;settings.pageNumber=fresh.pageNumber;settings.pageTotal=fresh.pageTotal;renderDisplayLive();renderModules();renderMaintenance();if(!rotationBusy)renderSystem();}catch{}},4000);
 setInterval(async()=>{if(document.hidden)return;try{data=await api('/api/data');renderData();}catch{}},15000);
 setInterval(async()=>{try{offsets=(await api('/api/zones')).offsets;renderSelected();renderCatalogue();}catch{}},300000);
}

const countryForLanguage=code=>({en:'CA',zh:'CN',de:'DE',fr:'FR',ja:'JP',ko:'KR',es:'ES'})[code]||'';
let displaySaveTimer,displaySaving=false,displayPending=false;
function syncIdle(){const value=String($('idleSeconds').value||0);$('idlePreset').value=[...$('idlePreset').options].some(o=>o.value===value)?value:'custom';$('idleSeconds').hidden=$('idlePreset').value!=='custom';}
function queueDisplaySave(){clearTimeout(displaySaveTimer);displaySaveTimer=setTimeout(saveDisplayAutomatically,650);}
async function saveDisplayAutomatically(){if(displaySaving){displayPending=true;return;}const values=displayValues();if(!$('displayForm').checkValidity()||values.autoMin>values.autoMax||Math.abs(values.darkRaw-values.brightRaw)<100||(values.schedule&&values.onMinute===values.offMinute)||(values.idleSeconds!==0&&values.idleSeconds<30)){toast(t('display.invalid'),true);return;}displaySaving=true;try{const fresh=await api('/api/display',values);settings.display=fresh.display;settings.displayState=fresh.displayState;renderDisplayLive();toast(t('app.saved'));}catch(e){toast(e.message,true);}finally{displaySaving=false;if(displayPending){displayPending=false;queueDisplaySave();}}}
function setupAutoSave(){document.querySelectorAll('#displayForm input,#displayForm select').forEach(el=>{el.addEventListener('change',()=>{updateDisplayFields();queueDisplaySave();});if(['range','color'].includes(el.type))el.addEventListener('input',queueDisplaySave);});$('idlePreset').onchange=()=>{if($('idlePreset').value!=='custom')$('idleSeconds').value=$('idlePreset').value;else if(Number($('idleSeconds').value)<30)$('idleSeconds').value=60;$('idleSeconds').hidden=$('idlePreset').value!=='custom';queueDisplaySave();};}
const countryCodes=['CA','US','CN','DE','FR','JP','KR','ES','MX','AR','CO','CL','PE','EC','UY','PY','BO','VE','CR','PA','GT','HN','SV','NI','CU','DO','GQ','PR'];
function renderCountries(){const node=$('country'),previous=node.value;let names;try{names=new Intl.DisplayNames([lang],{type:'region'});}catch{}node.replaceChildren();for(const code of countryCodes)node.add(new Option(names?.of(code)||code,code));node.add(new Option(t('weather.all'),''));node.value=previous;}
let moduleBusy=false,systemPanel='basic';
// Module bits (src/modules.h). Bit 6 is the web radio; 10 and 11 are the menu-only timer and
// quick-control cells. The screen menu holds the gear plus at most 11 items (src/menu_grid.h).
const MODULE_BITS={clock:0,weather:1,bitcoin:2,stocks:3,mfa:4,alarm:5,radio:6,calendar:7,air:8,calculator:9,timer:10,quick:11,sd:12};
const PAGE_MODULES=0x3ff,MENU_LIMIT=11;
function menuCount(mask){let n=0;for(const [key,bit] of Object.entries(MODULE_BITS))if(mask&(1<<bit)&&(key!=='timer'||mask&(1<<MODULE_BITS.alarm)))n++;return n;}
function renderModules(){if(!settings||!$('moduleControls'))return;const root=$('moduleControls');root.replaceChildren();const full=menuCount(settings.enabledModules)>=MENU_LIMIT;['clock','calendar','alarm','radio','weather','air','bitcoin','stocks','mfa','calculator','sd','timer','quick'].forEach(key=>{const index=MODULE_BITS[key];const label=document.createElement('label');label.className='module-control';const icon=document.createElement('img');icon.src=iconSrc(({clock:'clock-3',weather:'cloud-sun',bitcoin:'bitcoin',stocks:'chart',mfa:'shield-keyhole',alarm:'alarm-clock',radio:'radio',calendar:'calendar-days',air:'wind',calculator:'calculator',sd:'folder',timer:'timer',quick:'sliders-horizontal'})[key]);icon.alt='';const name=document.createElement('strong');name.textContent=t('nav.'+key);const input=document.createElement('input');input.type='checkbox';input.id='module-'+key;input.checked=!!(settings.enabledModules&(1<<index));input.disabled=moduleBusy||(full&&!input.checked&&menuCount(settings.enabledModules|(1<<index))>menuCount(settings.enabledModules));label.classList.toggle('module-full',input.disabled&&!moduleBusy);input.setAttribute('aria-label',t('nav.'+key));input.onchange=async()=>{const next=input.checked?settings.enabledModules|(1<<index):settings.enabledModules&~(1<<index);if(!(next&PAGE_MODULES)){toast(t('modules.keepOne'),true);renderModules();return;}if(menuCount(next)>MENU_LIMIT&&menuCount(next)>menuCount(settings.enabledModules)){toast(t('modules.full'),true);renderModules();return;}const previousMask=settings.enabledModules;settings.enabledModules=next;moduleBusy=true;renderModules();try{const fresh=await api('/api/modules',{enabledModules:next});settings.enabledModules=fresh.enabledModules;settings.page=fresh.page;settings.pageNumber=fresh.pageNumber;settings.pageTotal=fresh.pageTotal;toast(t('app.saved'));}catch(e){settings.enabledModules=previousMask;toast(e.message,true);}finally{moduleBusy=false;renderModules();}};label.append(icon,name,input);root.append(label);const enabled=!!(settings.enabledModules&(1<<index));document.querySelector('.nav[data-section="'+key+'"]')?.classList.toggle('module-off',!enabled);if($('disabled-'+key))$('disabled-'+key).hidden=enabled;});}
function renderMaintenance(){const d=settings?.device;if(!d)return;$('maintenanceMac').textContent=settings.mac||'—';$('networkHeap').textContent=Math.round(d.heapFree/1024)+' KB';$('minimumHeap').textContent=Math.round(d.heapMinimum/1024)+' KB';$('largestHeap').textContent=Math.round(d.heapLargest/1024)+' KB';if(d.heapUsable!==undefined){const kb=v=>Math.round(v/1024),stack=v=>v?(v/1024).toFixed(1):'—';$('usableHeap').textContent=kb(d.heapUsable)+' / '+kb(d.heapUsableLargest)+' / '+kb(d.heapUsableMinimum)+' KB';$('taskStacks').textContent=stack(d.stackLoop)+' / '+stack(d.stackData)+' / '+stack(d.stackRadio)+' KB';}$('deviceUptime').textContent=Math.floor(d.uptimeSeconds/3600)+'h '+Math.floor(d.uptimeSeconds%3600/60)+'m';$('cpuFrequency').textContent=d.mhz+' MHz';$('cpuCores').textContent=d.available?d.cores.map((v,i)=>'CPU '+i+': '+v.toFixed(1)+'%').join(' · '):'—';const canvas=$('cpuHistory'),ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);ctx.strokeStyle='#73ddc7';ctx.lineWidth=2;ctx.beginPath();d.history.forEach((v,i)=>{const x=i*(canvas.width-4)/29+2,y=canvas.height-4-v*(canvas.height-8)/100;if(i)ctx.lineTo(x,y);else ctx.moveTo(x,y);});ctx.stroke();}
let screenPreviewTimer,previewRequest,previewObject=false,previewToken='',previewBusy=false;
function previewVisible(){return active==='system'&&systemPanel==='screen'&&!document.hidden;}
function refreshPreview(){clearTimeout(screenPreviewTimer);if(!previewVisible()){previewRequest?.abort();return;}if(!previewBusy)loadPreview();}
async function loadPreview(){if(!previewVisible()||previewBusy)return;previewBusy=true;previewRequest=new AbortController();try{const response=await fetch('/api/screen.bin?t='+Date.now(),{cache:'no-store',signal:previewRequest.signal});if(!response.ok)throw Error('HTTP '+response.status);const token=response.headers.get('X-Screen-Token'),decoded=CWBSMScreen.decode(await response.arrayBuffer());if(!previewVisible())return;const canvas=$('screenPreview');canvas.width=decoded.width;canvas.height=decoded.height;canvas.style.aspectRatio=decoded.width+'/'+decoded.height;canvas.getContext('2d').putImageData(new ImageData(decoded.pixels,decoded.width,decoded.height),0,0);previewObject=true;previewToken=token;$('previewStatus').textContent=t('preview.live');}catch(e){if(e.name!=='AbortError')$('previewStatus').textContent=t('preview.failed');}finally{previewBusy=false;if(previewVisible())screenPreviewTimer=setTimeout(loadPreview,1300);}}

// Network page: setup intro, Wi-Fi, then hostname / IP (both cards are added at runtime).
function orderNetwork(){const section=$('network'),wifi=$('wifiForm')?.closest('.card'),host=$('networkHostForm');if(wifi&&host&&wifi.parentElement===section&&host.parentElement===section)section.insertBefore(wifi,host);}
function setupSystemTabs(){const system=$('system'),tabs=document.createElement('div');tabs.className='system-tabs';const grid=system.querySelector('.grid'),display=$('displayForm'),cards=[...display.children],wifi=$('wifiForm').closest('.card'),gestures=system.querySelector('.quiet');$('network').append(wifi);orderNetwork();
 const screen=document.createElement('div');screen.className='card screen-card';screen.innerHTML='<h2 data-i18n="preview.title"></h2><p class="hint" data-i18n="preview.hint"></p><canvas id="screenPreview" width="320" height="240" role="img" aria-label="CWBSM screen"></canvas><div class="preview-caption"><span id="previewStatus"></span><button id="previewWake" type="button" class="secondary" data-i18n="display.wake"></button></div><p class="hint" data-i18n="preview.security"></p>';
 const modulesCard=document.createElement('div');modulesCard.className='card';modulesCard.innerHTML='<h2 data-i18n="modules.title"></h2><p class="hint" data-i18n="modules.hint"></p><p class="hint" data-i18n="modules.menuHint"></p><div id="moduleControls"></div>';
 const maintenance=document.createElement('div');maintenance.className='card';const memory=$('networkHeap').parentElement;maintenance.innerHTML='<h2 data-i18n="system.deviceStatus"></h2><div class="facts" id="maintenanceMemory"><div><small>MAC</small><strong id="maintenanceMac">—</strong></div></div><div class="facts"><div><small data-i18n="device.minimumHeap"></small><strong id="minimumHeap"></strong></div><div><small data-i18n="device.largestHeap"></small><strong id="largestHeap"></strong></div><div><small data-i18n="device.uptime"></small><strong id="deviceUptime"></strong></div><div><small data-i18n="device.usableHeap"></small><strong id="usableHeap"></strong></div><div><small data-i18n="device.stacks"></small><strong id="taskStacks"></strong></div></div><h3 data-i18n="device.cpu"></h3><p id="cpuCores"></p><p id="cpuFrequency" class="hint"></p><canvas id="cpuHistory" width="580" height="90"></canvas><p class="hint" data-i18n="device.cpuHint"></p>';
 // Restart and factory reset get their own card, last in the Maintenance tab.
 const danger=document.createElement('div');danger.className='card';danger.innerHTML='<h2 data-i18n="system.restartReset"></h2><p class="hint" data-i18n="system.maintenanceHint"></p><button id="rebootDevice" type="button" class="secondary" data-i18n="system.reboot"></button><button id="factoryReset" type="button" class="danger" data-i18n="system.factoryReset"></button>';
 maintenance.querySelector('#maintenanceMemory').append(memory);
 const themeCard=document.createElement('div');themeCard.className='card';themeCard.innerHTML='<form id="themeForm"><h2 data-i18n="theme.title"></h2><label for="themeManual" data-i18n="theme.manual"></label><select id="themeManual"></select><div id="themeSample">12:34:56</div><label for="themeMode" data-i18n="theme.auto"></label><select id="themeMode"><option value="0" data-i18n="theme.off"></option><option value="1" data-i18n="theme.daily"></option><option value="2" data-i18n="theme.hourly"></option></select><p class="hint" data-i18n="theme.zone"></p><div id="themeRows"></div><button id="themeAdd" type="button" class="secondary">＋</button></form>';
 const backup=document.createElement('div');
 backup.className='card';
 backup.innerHTML='<h2 data-i18n="backup.title"></h2><p><a href="/api/config/export" download data-i18n="backup.export"></a></p><label for="backupFile" data-i18n="backup.import"></label><input id="backupFile" type="file" accept=".json,application/json">';
 // The same backups on the SD card (/cwbsm-config.json, /cwbsm-radio.json): written and read by the device itself.
 backup.insertAdjacentHTML('beforeend','<h3 data-i18n="sdbackup.title"></h3><p class="hint" data-i18n="sdbackup.hint"></p><p class="hint" id="sdBackupStatus"></p><label for="sdBackupWhat" data-i18n="sdbackup.what"></label><select id="sdBackupWhat"><option value="all" data-i18n="sdbackup.all"></option><option value="config" data-i18n="sdbackup.config"></option><option value="radio" data-i18n="sdbackup.radio"></option></select><div class="button-row"><button type="button" class="secondary" id="sdExport" data-i18n="sdbackup.export"></button><button type="button" class="secondary" id="sdImport" data-i18n="sdbackup.import"></button></div>');
 {const status=backup.querySelector('#sdBackupStatus'),what=backup.querySelector('#sdBackupWhat'),buttons=[backup.querySelector('#sdExport'),backup.querySelector('#sdImport')];
  const refresh=async()=>{try{const s=await api('/api/sd');status.textContent=s.present?t('sdbackup.ready'):t('files.noCard');buttons.forEach(b=>b.disabled=!s.present);}catch(e){status.textContent=localError(e.message);}};
  const run=async(button,work)=>{buttons.forEach(b=>b.disabled=true);try{await work();}catch(e){toast(e.message,true);}finally{buttons.forEach(b=>b.disabled=false);refresh();}};
  buttons[0].onclick=()=>run(buttons[0],async()=>{const r=await api('/api/sd/export',{what:what.value});toast(r.stations!==undefined?t('sdbackup.exportedRadio').replace('{c}',r.categories).replace('{n}',r.stations):t('sdbackup.exported'));});
  buttons[1].onclick=()=>{if(!confirm(t('sdbackup.confirm.'+what.value)))return;run(buttons[1],async()=>{const r=await api('/api/sd/import',{what:what.value});
   if(r.rebooting){toast(t('system.rebooting'));return;}
   let message=t('sdbackup.importedRadio').replace('{c}',r.categories).replace('{n}',r.stations);if(r.skipped)message+=' '+t('radio.restoreSkipped').replace('{n}',r.skipped);toast(message);
   if(typeof radioRefresh==='function'){radioKey='';await radioRefresh();if(typeof radioLoadList==='function'){radioList=radioCats()[0]?.id??0;await radioLoadList(true);}}});};
  refresh();}
 backup.querySelector('input').onchange=async event=>{
  const input=event.target, file=input.files[0];
  if(!file)return;
  input.disabled=true;
  try {
   if(file.size>16384)throw Error(t('backup.invalid'));
   const config=JSON.parse(await file.text());
   const sections=['display','tracker'].filter(key=>config?.[key] && typeof config[key]==='object'&&!Array.isArray(config[key]));
   if(config?.format!=='cwbsm-config'||config.schema!==1||!sections.length)throw Error(t('backup.invalid'));
   if(!confirm(t('backup.confirm')+' '+sections.map(key=>t('backup.'+key)).join(', ')))return;
   await api('/api/config/import',config);
   toast(t('system.rebooting'));
   setTimeout(()=>location.reload(),8000);
  } catch(error){toast(error.message,true);}
  finally{input.value='';input.disabled=false;}
 };
 const footer=document.createElement('div');
 footer.className='card';
 footer.innerHTML='<h2 data-i18n="footer.config"></h2><select id="footerOrientation"></select><label class="check-line"><input id="footerNav" type="checkbox"><span data-i18n="footer.nav"></span></label><p class="hint" id="footerNavHint"></p><div id="footerItems"></div><div id="footerMock" aria-live="polite"></div><button id="footerDefault" type="button" data-i18n="footer.restore"></button><button id="footerSave" type="button" data-i18n="button.save"></button>';
 const orientation=footer.querySelector('select');
 const names=['wifi','ip','ntp','ram','cpu','app','version'];
 const layout=JSON.parse(JSON.stringify(settings.footer));
 const previewFooter=()=>{
  const direction=orientation.value, preview=footer.querySelector('#footerMock');
  const samples=['◔',settings.ip||'192.168.0.100','NTP','RAM 100K','CPU 12%',t('footer.clock')+' 1/2',settings.version];
  const nav=layout[direction+'Nav']!==false, vertical=direction==='portrait';
  footer.querySelector('#footerNav').checked=nav;
  const hint=footer.querySelector('#footerNavHint');hint.dataset.i18n='footer.navHint.'+direction;hint.textContent=t(hint.dataset.i18n);
  preview.style.width=(vertical?240:320)+'px';
  preview.replaceChildren();
  // Page buttons take 12 px at both ends: the arrows, drawn over both rows in portrait.
  preview.classList.toggle('footer-nav',nav);
  preview.dataset.previous=vertical?'▲':'◀';preview.dataset.next=vertical?'▼':'▶';
  for(let line=0;line<(vertical?2:1);line++){
   const row=document.createElement('div');row.className='footer-mock-row';
   const groups=[0,1].map(side=>layout[direction].filter(([,pos])=>pos===line*2+side+1).map(([id])=>samples[id]).join('  '));
   for(const group of groups){const span=document.createElement('span');span.textContent=group;row.append(span);}
   preview.append(row);
   if(row.scrollWidth>row.clientWidth)row.classList.add('footer-overflow');
  }
 };
 const drawFooter=()=>{
  const direction=orientation.value;
  const root=footer.querySelector('#footerItems');root.replaceChildren();
  layout[direction].forEach(([id,position],index)=>{
   const row=document.createElement('div');row.className='theme-entry';
   const name=document.createElement('span');name.dataset.i18n='footer.item.'+names[id];name.textContent=t(name.dataset.i18n);
   const location=document.createElement('select');location.dataset.aria=name.dataset.i18n;location.setAttribute('aria-label',name.textContent);
   ['hide','left','right','bottomLeft','bottomRight'].slice(0,direction==='portrait'?5:3)
     .forEach((key,value)=>{const option=new Option(t('footer.position.'+key),value);option.dataset.i18n='footer.position.'+key;location.add(option);});
   location.value=position;
   location.onchange=()=>{layout[direction][index][1]=Number(location.value);previewFooter();};
   row.append(name,location);
   for(const step of [-1,1]){
    const button=document.createElement('button');button.type='button';button.textContent=step<0?'↑':'↓';
    button.dataset.aria=step<0?'button.up':'button.down';button.setAttribute('aria-label',t(button.dataset.aria));
    button.disabled=index+step<0||index+step>=7;
    button.onclick=()=>{
     const items=layout[direction];
     [items[index],items[index+step]]=[items[index+step],items[index]];
     drawFooter();
    };
    row.append(button);
   }
   root.append(row);
  });
  previewFooter();
 };
 for(const direction of ['landscape','portrait']){const option=new Option(t('footer.'+direction),direction);option.dataset.i18n='footer.'+direction;orientation.add(option);}
 languageHooks.push(previewFooter);  // sample page label is language-dependent
 orientation.onchange=drawFooter;
 footer.querySelector('#footerNav').onchange=event=>{layout[orientation.value+'Nav']=event.target.checked;previewFooter();};
 footer.querySelector('#footerDefault').onclick=()=>{
  const defaults=orientation.value==='portrait'?[3,3,3,1,1,2,4]:[1,1,1,1,1,2,2];
  layout[orientation.value]=defaults.map((position,id)=>[id,position]);layout[orientation.value+'Nav']=true;drawFooter();
 };
 footer.querySelector('#footerSave').onclick=async event=>{
  const button=event.currentTarget;button.disabled=true;
  try{settings=await api('/api/footer',layout);toast(t('app.saved'));}
  catch(error){toast(error.message,true);}
  finally{button.disabled=false;}
 };
 drawFooter();
 const led=$('ledEnabled').closest('.card'),displayCards=cards.filter(card=>card!==led);const singleCard=document.createElement('div');singleCard.className='card';const singleInput=$('singleScreen');const single=singleInput.closest('label');const singleHint=single.nextElementSibling;singleCard.append(single);if(singleHint)singleCard.append(singleHint);{const cells=document.createElement('div');cells.id='singleCells';cells.className='single-cells';const hint=document.createElement('p');hint.className='hint';hint.dataset.i18n='single.cellsHint';singleCard.append(cells,hint);}singleInput.setAttribute('form','systemForm');// General: language, orientation, gestures · Display: brightness and schedule ·
 // Appearance: theme colours and status bar (each saves on its own) · Rear LED (the
 // RGB LED on the back of the CYD) · Pages: which
 // pages exist and how they change · Screen preview · Maintenance (destructive actions last).
 const groups={basic:[grid,gestures],display:displayCards,sound:[createSoundPanel()],led:[led],appearance:[themeCard,footer],pages:[modulesCard,singleCard,$('carouselForm')],screen:[screen],maintenance:[maintenance,backup,danger]};system.prepend(tabs);
 for(const [key,nodes] of Object.entries(groups)){const panel=document.createElement('div');panel.className='system-panel';panel.dataset.panel=key;panel.hidden=key!=='basic';for(const n of nodes)panel.append(n);// LED settings save with the display form, so its panel lives inside that form too.
 if(key==='display'||key==='led')display.append(panel);else system.append(panel);const button=document.createElement('button');button.type='button';button.dataset.i18n=key==='footer'?'footer.config':['theme','backup'].includes(key)?key+'.title':'system.'+key;button.className='secondary'+(key==='basic'?' selected':'');button.onclick=()=>{systemPanel=key;system.querySelectorAll('.system-panel').forEach(p=>p.hidden=p.dataset.panel!==key);tabs.querySelectorAll('button').forEach(b=>b.classList.toggle('selected',b===button));refreshPreview();};tabs.append(button);}
 loadTheme=initTheme();
 system.append(display);$('carouselForm').dataset.panel='pages';$('carouselForm').hidden=false;
 $('carouselForm').onsubmit=event=>{event.preventDefault();clearTimeout(carouselTimer);saveCarousel();};
 $('carouselForm').querySelectorAll('input').forEach(input=>input.addEventListener('change',queueCarouselSave));
 $('systemForm').querySelector('button[type=submit]').hidden=true;$('displayForm').querySelector('button[type=submit]').hidden=true;
 for(const key of ['clock','weather','bitcoin','stocks','mfa','alarm','radio','calendar','air']){const note=document.createElement('p');note.id='disabled-'+key;note.className='disabled-notice';note.dataset.i18n='modules.disabledHint';$(key).prepend(note);}
 // Click = tap; drag = swipe (left / right in landscape, up / down in portrait); press and hold = menu.
 const previewPoint=event=>{const c=$('screenPreview'),rect=c.getBoundingClientRect();return {x:Math.min(c.width-1,Math.max(0,Math.floor((event.clientX-rect.left)*c.width/rect.width))),y:Math.min(c.height-1,Math.max(0,Math.floor((event.clientY-rect.top)*c.height/rect.height)))};};
 let previewDown=null;
 $('screenPreview').onpointerdown=event=>{if(!previewObject)return;previewDown={...previewPoint(event),at:Date.now()};event.currentTarget.setPointerCapture?.(event.pointerId);event.preventDefault();};
 $('screenPreview').onpointerup=async event=>{if(!previewObject||!previewDown)return;const from=previewDown,to=previewPoint(event);previewDown=null;const hold=Date.now()-from.at>=600&&Math.abs(to.x-from.x)<=24&&Math.abs(to.y-from.y)<=24;try{const fresh=await api('/api/touch',{x:from.x,y:from.y,toX:to.x,toY:to.y,hold,expectedToken:Number(previewToken)});settings.page=fresh.page;settings.pageNumber=fresh.pageNumber;settings.pageTotal=fresh.pageTotal;refreshPreview();}catch(e){toast(e.message,true);refreshPreview();}};
 const capture=document.createElement('button');
 capture.type='button';capture.className='secondary';capture.dataset.i18n='preview.capture';
 $('previewWake').after(capture);
 capture.onclick=async()=>{
  capture.disabled=true;
  try {
   let response=await fetch('/api/screen.bin',{cache:'no-store'});
   if(response.status===429){
    await new Promise(resolve=>setTimeout(resolve,650));
    response=await fetch('/api/screen.bin',{cache:'no-store'});
   }
   if(!response.ok)throw Error(t('preview.failed'));
   const {width,height,pixels}=CWBSMScreen.decode(await response.arrayBuffer());
   const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
   canvas.getContext('2d').putImageData(new ImageData(pixels,width,height),0,0);
   const link=document.createElement('a');
   link.download='CWBSM-'+new Date().toISOString().replace(/[:.]/g,'-')+'.png';
   link.href=canvas.toDataURL('image/png');link.click();
  }catch(error){toast(error.message,true);}
  finally{capture.disabled=false;}
 };
 $('previewWake').onclick=async()=>{try{await api('/api/display/wake',{});refreshPreview();}catch(e){toast(e.message,true);}};
 document.addEventListener('visibilitychange',refreshPreview);window.addEventListener('pagehide',()=>{clearTimeout(screenPreviewTimer);previewRequest?.abort();});
 $('rebootDevice').onclick=async()=>{if(!confirm(t('system.rebootConfirm')))return;try{await api('/api/reboot',{});toast(t('system.rebooting'));setTimeout(()=>location.reload(),7000);}catch(e){toast(e.message,true);}};
 $('factoryReset').onclick=async()=>{if(!confirm(t('system.resetWarning')))return;const confirmation=prompt(t('system.resetTyped'));if(confirmation!=='CWBSM')return;try{const r=await fetch('/api/reset',{method:'POST',headers:{'Content-Type':'application/json','X-MFA-Session':mfaSession},body:JSON.stringify({confirm:confirmation})});const v=await r.json();if(!r.ok)throw Error(v.error);mfaLocalLock();toast(t('system.rebooting'));}catch(e){toast(e.message,true);}};
}

start();


// Labels carry data-i18n so they follow later language switches.
function i18nSpan(key){const span=document.createElement('span');span.dataset.i18n=key;span.textContent=t(key);return span;}
async function setupNetworkV16(){
 const cfg=await api('/api/network'),form=document.createElement('form');form.className='card';form.id='networkHostForm';
 const heading=document.createElement('h2');heading.dataset.i18n='network.title';heading.textContent=t('network.title');form.append(heading);
 const fields=[['hostname','network.hostname'],['staticIp','network.ip'],['subnet','network.subnet'],['gateway','network.gateway'],['dns1','network.dns1'],['dns2','network.dns2']];
 const mode=document.createElement('label');mode.className='check-line';const dhcp=document.createElement('input');dhcp.type='checkbox';dhcp.checked=cfg.dhcp;mode.append(dhcp,i18nSpan('network.dhcp'));form.append(mode);
 for(const [key,label] of fields){const row=document.createElement('div');row.dataset.networkField=key;const title=document.createElement('label');title.append(i18nSpan(label));const input=document.createElement('input');input.name=key;input.value=cfg[key]||'';if(key==='hostname'){input.maxLength=31;input.required=true;input.pattern='[A-Za-z0-9]([A-Za-z0-9-]{0,29}[A-Za-z0-9])?';}title.append(input);row.append(title);form.append(row);}
 const reset=document.createElement('button');reset.type='button';reset.className='secondary';reset.dataset.i18n='network.defaultHost';reset.textContent=t('network.defaultHost');reset.onclick=()=>form.elements.hostname.value=cfg.defaultHostname;form.append(reset);
 const hint=document.createElement('p');hint.className='hint';hint.dataset.i18n='network.hint';hint.textContent=t('network.hint');form.append(hint);
 const save=document.createElement('button');save.type='submit';save.className='primary';save.dataset.i18n='network.save';save.textContent=t('network.save');form.append(save);const update=()=>form.querySelectorAll('[data-network-field]').forEach(row=>row.hidden=dhcp.checked&&row.dataset.networkField!=='hostname');dhcp.onchange=update;update();
 form.onsubmit=async event=>{event.preventDefault();const values=Object.fromEntries(new FormData(form));values.dhcp=dhcp.checked;const address=values.dhcp?values.hostname+'.local':values.staticIp;if(!confirm(t('network.reconnect')+address))return;save.disabled=true;try{await api('/api/network',values);toast(t('network.saved'));}catch(e){toast(e.message,true);save.disabled=false;}};
 $('network').append(form);orderNetwork();
}
const networkV16Timer=setInterval(()=>{if(settings&&lang){clearInterval(networkV16Timer);setupNetworkV16().catch(e=>toast(e.message,true));}},500);

async function setupTransitionsV16(){const cfg=await api('/api/transition'),card=document.createElement('div');card.className='card';const heading=document.createElement('h2');heading.dataset.i18n='transition.title';heading.textContent=t('transition.title');card.append(heading);const names=[[0,'transition.none'],[11,'transition.pushForward'],[12,'transition.pushBack'],[13,'transition.dip']];for(const [key,label] of [['duration','transition.duration'],['enabled','transition.carouselEnabled'],['carousel','transition.carousel'],['left','transition.left'],['right','transition.right'],['boot','transition.boot']]){const row=document.createElement('label');row.append(i18nSpan(label));let input;if(key==='enabled'){input=document.createElement('input');input.type='checkbox';input.checked=cfg[key];}else if(key==='duration'){input=document.createElement('input');input.type='number';input.min=100;input.max=2000;input.required=true;input.value=cfg[key];}else{input=document.createElement('select');names.forEach(([value,name])=>{const option=new Option(t(name),value);option.dataset.i18n=name;input.add(option);});input.value=cfg[key];}input.name=key;row.append(input);card.append(row);}const hint=document.createElement('p');hint.className='hint';hint.dataset.i18n='transition.hint';hint.textContent=t('transition.hint');card.append(hint);const save=document.createElement('button');save.className='primary';save.type='button';save.dataset.i18n='button.save';save.textContent=t('button.save');card.append(save);save.onclick=async e=>{e.preventDefault();const values={};for(const input of card.querySelectorAll('input,select'))if(input.name)values[input.name]=input.type==='checkbox'?input.checked:Number(input.value);try{await api('/api/transition',values);toast(t('app.saved'));}catch(e){toast(e.message,true);}};document.querySelector('#system .system-panel[data-panel="pages"]').append(card);}
const transitionsV16Timer=setInterval(()=>{if(settings&&document.querySelector('#system .system-panel[data-panel="pages"]')){clearInterval(transitionsV16Timer);setupTransitionsV16().catch(e=>toast(e.message,true));}},500);


function createSoundPanel(){
 const card=document.createElement('form');card.className='card';
 card.innerHTML='<h2 data-i18n="system.sound"></h2><p data-i18n="sound.hint"></p><label for="soundGain" data-i18n="sound.gain"></label><input id="soundGain" type="range" min="25" max="300" step="5" value="200" disabled><output id="soundGainValue"></output><label for="soundLimit" data-i18n="sound.limit"></label><input id="soundLimit" type="range" min="10" max="100" step="1" value="100" disabled><output id="soundLimitValue"></output><p data-i18n="sound.testHint"></p><p id="soundStatus" role="status"></p><button class="primary" type="submit" data-i18n="button.save" disabled></button> <button class="secondary" type="button" id="soundTest" data-i18n="sound.test" disabled></button> <button class="secondary" type="button" id="soundStop" data-i18n="sound.stop" disabled></button> <button class="secondary" type="button" id="soundReset" data-i18n="sound.reset" disabled></button> <button class="secondary" type="button" id="soundRetry" data-i18n="sound.retry"></button>';
 const find=id=>card.querySelector('#'+id),gain=find('soundGain'),limit=find('soundLimit');
 let loaded=false,busy=false;
 const values=()=>({gainPercent:Number(gain.value),outputLimit:Number(limit.value)});
 const paint=()=>{find('soundGainValue').textContent=(Number(gain.value)/100).toFixed(2)+'×';find('soundLimitValue').textContent=limit.value+'%';};
 const lock=()=>{card.querySelectorAll('input,button').forEach(el=>el.disabled=busy||(!loaded&&el.id!=='soundRetry'));};
 const fill=cfg=>{gain.value=cfg.gainPercent;limit.value=cfg.outputLimit;paint();};
 const run=async work=>{if(busy)return;busy=true;lock();try{await work();find('soundStatus').textContent='';}catch(e){find('soundStatus').textContent=t('sound.failed')+' · '+e.message;}finally{busy=false;lock();}};
 const load=()=>run(async()=>{fill(await api('/api/sound'));loaded=true;});
 const save=async()=>{fill(await api('/api/sound',values()));toast(t('app.saved'));};
 gain.oninput=limit.oninput=paint;
 card.onsubmit=e=>{e.preventDefault();run(save);};
 find('soundTest').onclick=()=>run(async()=>{await save();await api('/api/sound/test',{action:'play'});});
 find('soundStop').onclick=()=>run(()=>api('/api/sound/test',{action:'stop'}));
 find('soundReset').onclick=()=>run(async()=>{fill(await api('/api/sound',{gainPercent:200,outputLimit:100}));toast(t('app.saved'));});
 find('soundRetry').onclick=load;paint();load();return card;
}

