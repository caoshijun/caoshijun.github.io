'use strict';
// Web radio section. Station library and player. Stations live on the device in up to 8 categories of 100; the
// starred ones also form the favourites (list 0), which the device shows first. A list's
// stations come from /api/radio/list as tab-separated lines; edits go to the device at once.
// Streams: direct MP3 / AAC, HLS (.m3u8) or .m3u / .pls playlists, plain HTTP only.
let radioData=null,radioList=-1,radioRows=[],radioKey='',radioEditing=null,radioQuery='',radioBusy=false;
const RADIO_CODECS=['auto','mp3','aac'];
const radioBytes=s=>new TextEncoder().encode(s).length;
const radioCats=()=>radioData?.categories||[];
const radioCat=id=>radioCats().find(c=>c.id===id);
const radioMax=()=>radioData?.limits?.stations||100;
const radioActive=s=>!!s&&(s.state==='playing'||s.state==='connecting');
function radioEl(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;}
function radioListName(id){return id===0?'★ '+t('radio.favorites'):radioCat(id)?.name||'';}
// Tile colour and mark follow the same rules as the device screen.
const RADIO_TILES=['#2F6F9F','#B3533D','#A0782C','#2E8B6F','#8A4FB8','#4F5FC7','#9C4668','#3F7F8F'];
function radioTileColor(name){let h=2166136261;for(const b of new TextEncoder().encode(name))h=Math.imul(h^b,16777619)>>>0;return RADIO_TILES[h%RADIO_TILES.length];}
function radioMark(name,max=3){
  const first=name.trim().split(' ')[0]||'';
  if(first.length>=2&&first.length<=max&&/^[A-Z0-9]+$/.test(first))return first;
  if(name.charCodeAt(0)<128){const initials=name.split(' ').filter(w=>/^[A-Za-z0-9]/.test(w)).map(w=>w[0].toUpperCase()).join('').slice(0,max);if(initials)return initials;}
  return Array.from(name).slice(0,2).join('');
}
function radioTile(node,name){
  const c=radioTileColor(name||'?');node.textContent=name?radioMark(name):'';
  node.style.backgroundColor=c;
  node.style.backgroundImage='linear-gradient(160deg,rgba(255,255,255,.14),rgba(0,0,0,.38))';
}
function radioFormat(st){return (/\.m3u8(\?|$)/i.test(st.url)?'HLS · ':'')+t('radio.codec.'+RADIO_CODECS[st.codec||0]);}
function radioParseRows(text){
  return String(text).split('\n').filter(Boolean).map(line=>{const f=line.split('\t');return {category:+f[0],id:+f[1],flags:+f[2],codec:+f[3],name:f[4]||'',url:f.slice(5).join('\t')};});
}
// A list is fetched again when its count or the favourites change (also by the device).
function radioListKey(){const n=radioList===0?radioData?.favorites:radioCat(radioList)?.count;return radioList+':'+n+':'+radioData?.favorites;}
async function radioLoadList(force=false){
  if(!radioData)return;
  if(radioList!==0&&!radioCat(radioList))radioList=radioData.favorites?0:radioCats()[0]?.id??0;
  const key=radioListKey();
  if(!force&&key===radioKey)return;
  const list=radioList;
  try{
    const response=await fetch('/api/radio/list?cat='+list,{cache:'no-store'});
    if(!response.ok)throw Error('HTTP '+response.status);
    const rows=radioParseRows(await response.text());
    if(list!==radioList)return;
    radioRows=rows;radioKey=key;
    radioLoadAlarmStations();
  }catch(e){toast(e.message,true);}
  radioRender();
}
function radioSelect(list){if(list===radioList)return;radioList=list;radioEditing=null;radioQuery='';$('search').value='';radioRows=[];radioKey='';radioRender();radioLoadList(true);}
function radioRenderCats(){
  const root=$('catList');root.replaceChildren();
  const add=(id,name,count)=>{const b=radioEl('button','cat'+(id===radioList?' on':''));b.type='button';b.dataset.cat=id;b.append(radioEl('span','cat-name',name),radioEl('span','cat-count',String(count)));b.onclick=()=>radioSelect(id);if(id===radioList)b.setAttribute('aria-current','true');root.append(b);};
  add(0,radioListName(0),radioData.favorites||0);
  radioCats().forEach(c=>add(c.id,c.name,c.count));
  $('catAdd').disabled=radioCats().length>=(radioData.limits?.categories||8);
  const used=radioData.storage?.used||0,total=radioData.storage?.total||1,stations=radioCats().reduce((n,c)=>n+c.count,0);
  $('storageBar').style.width=Math.min(100,Math.round(100*used/total))+'%';
  $('storageText').textContent=t('radio.storageUsed').replace('{n}',stations).replace('{p}',Math.round(100*used/total));
  $('radioStorage').hidden=radioData.storage?.ready!==false;
}
function radioRenderToolbar(){
  const cat=radioCat(radioList),fav=radioList===0;
  $('listName').textContent=radioListName(radioList);
  $('listCount').textContent=fav?String(radioData.favorites||0):cat?cat.count+' / '+radioMax():'';
  const index=radioCats().findIndex(c=>c.id===radioList);
  for(const id of ['catRename','catDelete','catUp','catDown'])$(id).hidden=fav;
  $('catUp').disabled=index<=0;$('catDown').disabled=index<0||index>=radioCats().length-1;
  $('radioImport').disabled=fav||radioBusy;
  $('radioAdd').disabled=!radioCats().length||(!fav&&!!cat&&cat.count>=radioMax());
  $('radioExport').disabled=!radioRows.length;
}
// The edit form for a station (st null: a new one for the list shown).
function radioForm(st){
  const form=radioEl('form','edit');
  const field=(key,input,wide)=>{const l=radioEl('label','field'+(wide?' wide':''));l.append(radioEl('span','',t(key)),input);return l;};
  const name=radioEl('input');name.value=st?st.name:'';name.maxLength=39;name.required=true;name.spellcheck=false;
  const url=radioEl('input','mono');url.type='url';url.value=st?st.url:'http://';url.maxLength=255;url.spellcheck=false;
  const cat=radioEl('select');radioCats().forEach(c=>cat.add(new Option(c.name,c.id)));cat.value=String(st?st.category:radioList||radioCats()[0]?.id);
  const codec=radioEl('select');RADIO_CODECS.forEach((c,i)=>codec.add(new Option(t('radio.codec.'+c),i)));codec.value=String(st?st.codec:0);
  form.append(field('radio.name',name),field('radio.category',cat),field('radio.url',url,true),field('radio.codec',codec));
  const buttons=radioEl('div','edit-actions');
  if(st){const del=radioEl('button','danger',t('radio.remove'));del.type='button';del.onclick=()=>radioDelete(st);buttons.append(del);}
  const cancel=radioEl('button','secondary',t('radio.cancel'));cancel.type='button';cancel.onclick=()=>{radioEditing=null;radioRenderRows();};
  const save=radioEl('button','primary',t('radio.save'));save.type='submit';
  buttons.append(radioEl('span','grow'),cancel,save);form.append(buttons);
  form.onsubmit=async e=>{
    e.preventDefault();
    const n=name.value.trim(),u=url.value.trim(),to=Number(cat.value);
    if(!n){toast(t('radio.needName'),true);return;}
    if(radioBytes(n)>=40){toast(t('radio.nameTooLong'),true);return;}
    if(!/^https?:\/\/.{4,}/i.test(u)||radioBytes(u)>=256){toast(t('radio.badUrl'),true);return;}
    const body={action:'save',cat:st?st.category:to,id:st?st.id:0,to,name:n,url:u,codec:Number(codec.value)};
    if(!st&&radioList===0)body.fav=true;
    save.disabled=true;
    try{radioData=await api('/api/radio/station',body);radioEditing=null;toast(t('app.saved'));await radioLoadList(true);}
    catch(err){toast(err.message,true);save.disabled=false;}
  };
  setTimeout(()=>name.focus(),0);
  return form;
}
const RADIO_STAR='<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/></svg>';
const RADIO_PLAY='<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M7 4v16l13-8z"/></svg>';
const RADIO_STOP='<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><rect x="5" y="5" width="14" height="14" rx="2.5"/></svg>';
function radioRenderRows(){
  const root=$('stationRows');root.replaceChildren();
  const s=radioNow(),q=radioQuery.toLowerCase(),sortable=radioList!==0&&!q&&radioEditing===null;
  root.classList.toggle('can-sort',sortable);
  if(radioEditing==='new'){const wrap=radioEl('div','row-wrap editing');wrap.append(radioForm(null));root.append(wrap);}
  const shown=radioRows.filter(st=>!q||st.name.toLowerCase().includes(q)||st.url.toLowerCase().includes(q));
  if(!shown.length&&radioEditing!=='new')root.append(radioEl('p','empty',q?'—':t(radioList===0?'radio.emptyFavorites':'radio.emptyCategory')));
  for(const st of shown){
    const key=st.category+':'+st.id;
    const wrap=radioEl('div','row-wrap');wrap.dataset.key=key;
    const playing=radioActive(s)&&s.category===st.category&&s.id===st.id;
    const row=radioEl('div','row'+(playing?' playing':''));
    const handle=radioEl('span','handle','⋮⋮');handle.setAttribute('aria-hidden','true');
    const tile=radioEl('span','tile small');radioTile(tile,st.name);
    const text=radioEl('span','row-text');text.append(radioEl('span','row-name',st.name),radioEl('span','row-url mono',radioList===0?radioListName(st.category)+' · '+st.url:st.url));
    const format=radioEl('span','format',radioFormat(st));
    const fav=!!(st.flags&1);
    const star=radioEl('button','icon star'+(fav?' on':''));star.type='button';star.setAttribute('aria-label',t('radio.favorites'));star.setAttribute('aria-pressed',String(fav));
    star.innerHTML=RADIO_STAR;star.onclick=()=>radioFavorite(st,!fav);
    const play=radioEl('button','icon play'+(playing?' on':''));play.type='button';play.setAttribute('aria-label',t(playing?'radio.stop':'radio.play'));
    play.innerHTML=playing?RADIO_STOP:RADIO_PLAY;
    play.onclick=()=>playing?(radioIsLocal()?radioLocalStop():radioControl({action:'stop'})):radioPlayStation(st,radioList);
    const more=radioEl('button','icon more','⋯');more.type='button';more.setAttribute('aria-label',t('radio.edit'));more.setAttribute('aria-expanded',String(radioEditing===key));
    more.onclick=()=>{radioEditing=radioEditing===key?null:key;radioRenderRows();};
    row.append(handle,tile,text,format,star,play,more);wrap.append(row);
    if(radioEditing===key){wrap.classList.add('editing');wrap.append(radioForm(st));}
    root.append(wrap);
  }
  radioRenderToolbar();
}
function radioRenderNow(){
  if(!radioData)return;
  const s=radioNow(),has=!!s.id,on=radioActive(s);
  radioTile($('nowTile'),has?s.name:'');
  $('nowName').textContent=has?s.name:t('radio.none');
  const meta=$('nowMeta');meta.replaceChildren();
  meta.append(radioEl('span','state '+s.state,s.state==='error'?t(s.error||'radio.error'):t(s.state==='playing'?'radio.live':'radio.'+s.state)));
  const parts=[];
  if(s.local)parts.push(t('radio.thisBrowser'));
  if(has&&(s.title||s.host))parts.push(s.title||s.host);
  if(s.state==='playing'&&!s.local){parts.push((s.hls?'HLS ':'')+String(s.codec).toUpperCase()+(s.rate?' '+Math.round(s.rate/1000)+' kHz':''));parts.push(t('radio.buffer')+' '+((s.bufferMs||0)/1000).toFixed(1)+' s');}
  if(parts.length)meta.append(' · '+parts.join(' · '));
  $('toggleIcon').setAttribute('d',on?'M6 6h12v12H6z':'M7 4v16l13-8z');
  $('radioToggle').setAttribute('aria-label',t(on?'radio.stop':'radio.play'));
  const any=radioCats().some(c=>c.count);
  for(const id of ['radioToggle','radioPrev','radioNext'])$(id).disabled=!any;
  const volume=radioIsLocal()?radioLocal.volume:radioData.volume;
  if(document.activeElement!==$('radioVolume')){$('radioVolume').value=volume;$('radioVolumeValue').textContent=volume;}
}
function radioRender(){if(!radioData)return;radioRenderCats();radioRenderRows();radioRenderNow();}
async function radioRefresh(){
  if(radioBusy)return;
  try{
    radioData=await api('/api/radio');radioRenderCats();radioRenderNow();
    if(radioEditing===null&&radioListKey()!==radioKey)await radioLoadList();
    else if(radioEditing===null)radioRenderRows();
  }catch{}
}
async function radioControl(body){try{radioData=await api('/api/radio/control',body);radioRenderNow();if(radioEditing===null)radioRenderRows();}catch(e){toast(e.message,true);}}
async function radioFavorite(st,on){
  try{
    radioData=await api('/api/radio/station',{action:'favorite',cat:st.category,id:st.id,on});
    st.flags=on?st.flags|1:st.flags&~1;
    if(radioList===0)await radioLoadList(true);else{radioKey=radioListKey();radioRender();}
  }catch(e){toast(e.message,true);}
}
async function radioDelete(st){
  if(!confirm(t('radio.removeConfirm').replace('{name}',st.name)))return;
  try{radioData=await api('/api/radio/station',{action:'delete',cat:st.category,id:st.id});radioEditing=null;await radioLoadList(true);}catch(e){toast(e.message,true);}
}
async function radioCategory(body,selectNew){
  const before=new Set(radioCats().map(c=>c.id));
  try{radioData=await api('/api/radio/category',body);}catch(e){toast(e.message,true);return;}
  const created=selectNew&&radioCats().find(c=>!before.has(c.id));
  if(created){radioSelect(created.id);return;}
  await radioLoadList(true);
}
// Stations move by dragging their handle (mouse or touch).
function radioSortable(container){
  container.addEventListener('pointerdown',e=>{
    const handle=e.target.closest('.handle');
    if(!handle||!container.classList.contains('can-sort')||e.button>0)return;
    const items=[...container.querySelectorAll('.row-wrap[data-key]')],item=handle.closest('.row-wrap'),from=items.indexOf(item);
    if(from<0)return;
    e.preventDefault();
    const rects=items.map(n=>n.getBoundingClientRect()),pitch=items.length>1?rects[1].top-rects[0].top:rects[0].height,startY=e.clientY;
    let to=from;
    item.classList.add('dragging');container.classList.add('sorting');
    const move=ev=>{
      const dy=ev.clientY-startY,mid=rects[from].top+rects[from].height/2+dy;
      to=from;
      for(let i=0;i<rects.length;i++){const c=rects[i].top+rects[i].height/2;if(i<from&&mid<c&&to===from)to=i;if(i>from&&mid>c)to=i;}
      items.forEach((n,i)=>{let y=0;if(i===from)y=dy;else if(from<to&&i>from&&i<=to)y=-pitch;else if(from>to&&i<from&&i>=to)y=pitch;n.style.transform=y?'translateY('+y+'px)':'';});
    };
    const up=async()=>{
      window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);window.removeEventListener('pointercancel',up);
      items.forEach(n=>n.style.transform='');item.classList.remove('dragging');container.classList.remove('sorting');
      if(to===from)return;
      const st=radioRows[from];radioRows.splice(to,0,...radioRows.splice(from,1));radioRenderRows();
      try{radioData=await api('/api/radio/station',{action:'move',cat:st.category,id:st.id,to});radioKey=radioListKey();}catch(err){toast(err.message,true);await radioLoadList(true);}
    };
    window.addEventListener('pointermove',move);window.addEventListener('pointerup',up);window.addEventListener('pointercancel',up);
  });
}
// Import / export: a text file with one station per line, "name,url". The URL starts at the
// first comma (or full-width ，) followed by http, so names may contain commas. Blank lines
// and lines starting with # are ignored. The device stores names below 40 and URLs below 256
// UTF-8 bytes, plain HTTP only; other lines are skipped and reported by line number.
function radioParseList(text){
  const stations=[],skipped=[];
  String(text).replace(/^﻿/,'').split(/\r\n|\n|\r/).forEach((raw,i)=>{
    const line=raw.trim();if(!line||line.startsWith('#'))return;
    const m=line.match(/^(.*?)\s*[,，]\s*(https?:\/\/\S+)$/i);
    const name=m?m[1].trim():'',url=m?m[2]:'';
    if(!name||!/^https?:\/\/.{4,}/i.test(url)||radioBytes(name)>=40||radioBytes(url)>=256)skipped.push(i+1);
    else stations.push({name,url,codec:'auto'});
  });
  return {stations,skipped};
}
function radioListText(list){return list.filter(s=>s.name.trim()&&s.url).map(s=>s.name.trim()+','+s.url).join('\n')+'\n';}
function radioExport(){
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([radioListText(radioRows)],{type:'text/plain;charset=utf-8'}));
  a.download=(radioList===0?'favorites':radioListName(radioList).replace(/[\\/:*?"<>|]/g,'_')||'stations')+'.txt';
  document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
// A file replaces the stations of the category shown; it goes to the device in parts of
// about 2 KB. Stars stay on stations whose URL is in the new list.
async function radioImport(file){
  const cat=radioCat(radioList);if(!cat)return;
  let text;try{text=await file.text();}catch(e){toast(e.message,true);return;}
  const {stations,skipped}=radioParseList(text),max=radioMax();
  if(!stations.length){toast(t('radio.importNone'));return;}
  const list=stations.slice(0,max);
  if(!confirm(t('radio.importConfirm').replace('{name}',cat.name).replace('{n}',cat.count).replace('{m}',list.length)))return;
  const starred=new Set(radioRows.filter(st=>st.flags&1).map(st=>st.url));
  radioBusy=true;radioRenderToolbar();
  try{
    await api('/api/radio/import',{cat:cat.id,part:'begin'});
    let batch=[],size=0;
    const flush=async()=>{if(batch.length)await api('/api/radio/import',{part:'add',stations:batch});batch=[];size=0;};
    for(const st of list){const item=[st.name,st.url,starred.has(st.url)],n=radioBytes(JSON.stringify(item))+1;if(size+n>1800)await flush();batch.push(item);size+=n;}
    await flush();
    radioData=await api('/api/radio/import',{part:'commit'});
  }catch(e){api('/api/radio/import',{part:'abort'}).catch(()=>{});toast(e.message,true);radioBusy=false;await radioRefresh();return;}
  radioBusy=false;
  let message=t('radio.imported').replace('{n}',list.length);
  if(stations.length>max)message+=' '+t('radio.importTooMany').replaceAll('{max}',max);
  if(skipped.length)message+=' '+t('radio.importSkipped').replace('{lines}',skipped.slice(0,6).join(', ')+(skipped.length>6?'…':''));
  toast(message);
  await radioLoadList(true);
}
// ---- Output: the device, or this browser ----------------------------------------------
// "device" sends play / stop to the CYD; "local" plays the stream in an <audio> element here
// (HLS through the browser, or hls.js from a CDN where the browser has no HLS of its own).
const RADIO_HLS_JS='https://cdn.jsdelivr.net/npm/hls.js@1.5.13/dist/hls.min.js';
let radioOutput='device';
try{if(localStorage.getItem('radioOutput')==='local')radioOutput='local';}catch{}
const radioLocal={audio:null,hls:null,station:null,list:0,rows:[],state:'stopped',error:'',volume:60,token:0};
try{const v=Number(localStorage.getItem('radioLocalVolume'));if(v>=0&&v<=100&&localStorage.getItem('radioLocalVolume')!==null)radioLocal.volume=v;}catch{}
function radioIsLocal(){return radioOutput==='local';}
// What the player bar and the rows show as playing.
function radioNow(){
  if(!radioIsLocal())return radioData?.state||{};
  const st=radioLocal.station;
  return st?{state:radioLocal.state,error:radioLocal.error,category:st.category,id:st.id,name:st.name,host:radioHost(st.url),local:true}:{state:'stopped',id:0,local:true};
}
function radioHost(url){try{return new URL(url).host;}catch{return '';}}
function radioLoadScript(src){return new Promise((ok,fail)=>{const s=document.createElement('script');s.src=src;s.onload=ok;s.onerror=()=>fail(Error('hls.js'));document.head.append(s);});}
function radioLocalState(state,error='',detail=''){radioLocal.state=state;radioLocal.error=error;if(error)toast(t(error)+(detail?' ('+detail+')':''),true);radioRenderNow();if(radioEditing===null)radioRenderRows();}
// hls.js loader that fetches every playlist and segment through the device (/api/radio/proxy),
// for servers without CORS headers; hls.js still sees the original URLs.
function radioProxyLoader(){
  const Base=window.Hls.DefaultConfig.loader;
  return class extends Base{load(context,config,callbacks){
    const original=context.url;context.url='/api/radio/proxy?url='+encodeURIComponent(original);
    const ok=callbacks.onSuccess;
    super.load(context,config,{...callbacks,onSuccess:(response,stats,ctx,net)=>{response.url=original;ctx.url=original;ok(response,stats,ctx,net);}});
  }};
}
function radioLocalStop(){
  radioLocal.token++;
  if(radioLocal.hls){radioLocal.hls.destroy();radioLocal.hls=null;}
  const a=radioLocal.audio;if(a){a.pause();a.removeAttribute('src');a.load();}
  radioLocalState('stopped');
}
async function radioLocalPlay(st,list,rows){
  radioLocalStop();
  const token=++radioLocal.token;
  radioLocal.station=st;radioLocal.list=list;if(rows)radioLocal.rows=rows.slice();
  if(!radioLocal.audio){
    const a=radioLocal.audio=new Audio();a.preload='none';
    a.addEventListener('playing',()=>radioLocalState('playing'));
    a.addEventListener('waiting',()=>{if(radioLocal.state==='playing')radioLocalState('connecting');});
    // With hls.js attached, its own ERROR event reports failures (and its retries detach the media).
    a.addEventListener('error',()=>{if(!radioLocal.hls&&a.getAttribute('src'))radioLocalState('error','radio.localError',a.error?'media '+a.error.code:'');});
  }
  const a=radioLocal.audio;a.volume=radioLocal.volume/100;
  radioLocalState('connecting');
  try{
    // A .m3u / .pls playlist: the device reads it (no CORS limits there) and names the stream.
    let url=st.url,hlsStream=/\.m3u8(\?|$)/i.test(url);
    if(/\.(m3u|pls)(\?|$)/i.test(url)){const r=await api('/api/radio/stream?cat='+st.category+'&id='+st.id);url=r.url;hlsStream=r.hls;}
    if(token!==radioLocal.token)return;
    if(hlsStream&&!a.canPlayType('application/vnd.apple.mpegurl')){
      if(!window.Hls)await radioLoadScript(RADIO_HLS_JS);
      if(token!==radioLocal.token)return;
      if(!window.Hls||!window.Hls.isSupported())throw Error('hls');
      // Straight from the server first; a network error (usually missing CORS headers) retries
      // through the device.
      const start=proxy=>{
        if(radioLocal.hls)radioLocal.hls.destroy();
        const h=radioLocal.hls=new window.Hls(proxy?{lowLatencyMode:false,loader:radioProxyLoader()}:{lowLatencyMode:false});
        h.on(window.Hls.Events.ERROR,(_,d)=>{
          if(!d.fatal||token!==radioLocal.token)return;
          if(!proxy&&d.type===window.Hls.ErrorTypes.NETWORK_ERROR){start(true);a.play().catch(()=>{});return;}
          radioLocalState('error','radio.localError',d.details+(d.response&&d.response.code?' '+d.response.code:''));
        });
        h.loadSource(url);h.attachMedia(a);
      };
      start(false);
    }else a.src=url;
    await a.play();
  }catch(e){
    // AbortError: the media was reloaded (hls.js retrying through the device); its events decide.
    if(token===radioLocal.token&&!(e&&e.name==='AbortError'))radioLocalState('error',e&&e.name==='NotAllowedError'?'radio.localBlocked':'radio.localError',e&&e.message!=='hls'?'':'hls.js');
  }
}
function radioLocalStep(d){
  const rows=radioLocal.rows,st=radioLocal.station;if(!rows.length)return;
  const i=st?rows.findIndex(r=>r.category===st.category&&r.id===st.id):-1;
  const next=rows[((i<0?(d>0?-1:0):i)+d+rows.length)%rows.length];
  radioLocalPlay(next,radioLocal.list);
}
// The station a play button or the player starts: in the list shown, or the device's last.
async function radioStationFor(cat,id,context){
  let rows=radioList===context?radioRows:null;
  if(!rows){const r=await fetch('/api/radio/list?cat='+context,{cache:'no-store'});rows=r.ok?radioParseRows(await r.text()):[];}
  return {rows,st:rows.find(r=>r.category===cat&&r.id===id)};
}
async function radioPlayStation(st,list){
  if(!radioIsLocal())return radioControl({action:'play',cat:st.category,id:st.id,context:list});
  radioLocalPlay(st,list,list===radioList?radioRows:null);
}
async function radioToggle(){
  if(!radioIsLocal())return radioControl({action:'toggle'});
  if(radioActive(radioNow())){radioLocalStop();return;}
  if(radioLocal.station)return radioLocalPlay(radioLocal.station,radioLocal.list);
  const s=radioData?.state;
  if(s&&s.id){const {rows,st}=await radioStationFor(s.category,s.id,s.context);if(st)return radioLocalPlay(st,s.context,rows);}
  if(radioRows[0])radioLocalPlay(radioRows[0],radioList,radioRows);
}
// Switching hands the station over: what plays on one side starts on the other.
async function radioSetOutput(output){
  if(output===radioOutput)return;
  const wasLocal=radioIsLocal(),now=radioNow(),playing=radioActive(now);
  radioOutput=output;try{localStorage.setItem('radioOutput',output);}catch{}
  if(wasLocal){
    const st=radioLocal.station,list=radioLocal.list;radioLocalStop();
    if(playing&&st)await radioControl({action:'play',cat:st.category,id:st.id,context:list||st.category});
  }else if(playing&&now.id){
    await radioControl({action:'stop'});
    const {rows,st}=await radioStationFor(now.category,now.id,now.context);
    if(st)radioLocalPlay(st,now.context,rows);
  }
  radioRenderOutput();radioRenderNow();if(radioEditing===null)radioRenderRows();
}
function radioRenderOutput(){
  for(const b of document.querySelectorAll('#outputSwitch button')){const on=b.dataset.output===radioOutput;b.classList.toggle('on',on);b.setAttribute('aria-pressed',String(on));}
}

// ---- Backup / restore of the radio library: every category with its stations and the volume --
function radioBackupName(){const d=new Date(),p=n=>String(n).padStart(2,'0');return 'cwbsm-radio-'+d.getFullYear()+p(d.getMonth()+1)+p(d.getDate())+'-'+p(d.getHours())+p(d.getMinutes())+'.json';}
async function radioBackup(){
  try{
    radioData=await api('/api/radio');
    const categories=[];
    for(const c of radioCats()){
      const r=await fetch('/api/radio/list?cat='+c.id,{cache:'no-store'});if(!r.ok)throw Error('HTTP '+r.status);
      categories.push({name:c.name,stations:radioParseRows(await r.text()).map(s=>({name:s.name,url:s.url,codec:RADIO_CODECS[s.codec]||'auto',favorite:!!(s.flags&1)}))});
    }
    // The radio library only: the rest of the device has its own backup (System > Backup).
    const backup={format:'cwbsm-radio-backup',version:1,created:new Date().toISOString(),firmware:settings?.firmware,
      volume:radioData.savedVolume??radioData.volume,categories};
    const a=document.createElement('a');
    a.href=URL.createObjectURL(new Blob([JSON.stringify(backup,null,1)+'\n'],{type:'application/json'}));
    a.download=radioBackupName();document.body.append(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(a.href),1000);
    toast(t('radio.backupDone').replace('{c}',categories.length).replace('{n}',categories.reduce((n,c)=>n+c.stations.length,0)));
  }catch(e){toast(e.message,true);}
}
// Checks a backup file; returns {categories, skipped} with only what the device can store.
function radioParseBackup(text){
  let data;try{data=JSON.parse(String(text).replace(/^﻿/,''));}catch{return null;}
  if(!data||data.format!=='cwbsm-radio-backup'||!Array.isArray(data.categories)||!data.categories.length)return null;
  let skipped=0;
  const categories=data.categories.slice(0,8).map((c,i)=>{
    let name=String(c?.name||'').trim();if(!name||radioBytes(name)>=40)name='#'+(i+1);
    const stations=[];
    for(const s of Array.isArray(c?.stations)?c.stations:[]){
      const n=String(s?.name||'').trim(),u=String(s?.url||'').trim();
      if(!n||radioBytes(n)>=40||!/^https?:\/\/.{4,}/i.test(u)||radioBytes(u)>=256||stations.length>=100){skipped++;continue;}
      stations.push([n,u,!!s.favorite,Math.max(0,RADIO_CODECS.indexOf(s.codec))]);
    }
    return {name,stations};
  });
  skipped+=data.categories.slice(8).reduce((n,c)=>n+(Array.isArray(c?.stations)?c.stations.length:0),0);
  return {categories,skipped,settings:data.settings||{},volume:data.volume};
}
async function radioImportStations(cat,stations){
  await api('/api/radio/import',{cat,part:'begin'});
  let batch=[],size=0;
  const flush=async()=>{if(batch.length)await api('/api/radio/import',{part:'add',stations:batch});batch=[];size=0;};
  for(const item of stations){const n=radioBytes(JSON.stringify(item))+1;if(size+n>1800)await flush();batch.push(item);size+=n;}
  await flush();
  radioData=await api('/api/radio/import',{part:'commit'});
}
async function radioRestore(file){
  let text;try{text=await file.text();}catch(e){toast(e.message,true);return;}
  const backup=radioParseBackup(text);
  if(!backup){toast(t('radio.restoreInvalid'),true);return;}
  const total=backup.categories.reduce((n,c)=>n+c.stations.length,0);
  if(!confirm(t('radio.restoreConfirm').replace('{c}',backup.categories.length).replace('{n}',total)))return;
  radioBusy=true;$('radioRestore').disabled=$('radioBackup').disabled=true;toast(t('radio.restoring'));
  try{
    if(radioIsLocal())radioLocalStop();else await api('/api/radio/control',{action:'stop'});
    radioData=await api('/api/radio');
    const existing=radioCats().map(c=>({...c}));
    // Reuse the categories there are (renamed), add the missing ones, then drop the rest.
    for(let i=0;i<backup.categories.length;i++){
      const c=backup.categories[i];let id=existing[i]?.id;
      if(id){if(existing[i].name!==c.name)radioData=await api('/api/radio/category',{action:'rename',id,name:c.name});}
      else{const before=new Set(radioCats().map(x=>x.id));radioData=await api('/api/radio/category',{action:'add',name:c.name});id=radioCats().find(x=>!before.has(x.id))?.id;if(!id)throw Error('Category not found');}
      await radioImportStations(id,c.stations);
    }
    for(const c of existing.slice(backup.categories.length))radioData=await api('/api/radio/category',{action:'delete',id:c.id});
    if(Number.isInteger(backup.volume)&&backup.volume>=0&&backup.volume<=100)radioData=await api('/api/radio/control',{action:'volume',value:backup.volume});
  }catch(e){radioBusy=false;$('radioRestore').disabled=$('radioBackup').disabled=false;toast(e.message,true);await radioRefresh();await radioLoadList(true);return;}
  radioBusy=false;$('radioRestore').disabled=$('radioBackup').disabled=false;
  radioList=radioCats()[0]?.id??0;radioKey='';radioEditing=null;
  await radioLoadList(true);
  let message=t('radio.restored').replace('{c}',backup.categories.length).replace('{n}',total);
  if(backup.skipped)message+=' '+t('radio.restoreSkipped').replace('{n}',backup.skipped);
  toast(message);
}
// Every stored station, for the alarm tone menu (alarm.js): [{category,id,name}], by category.
let radioAlarmCache=[],radioAlarmKey='';
function radioStations(){return radioAlarmCache;}
async function radioLoadAlarmStations(){
  const key=radioCats().map(c=>c.id+':'+c.count+':'+c.name).join('|');
  if(!radioData||key===radioAlarmKey)return;
  const all=[];
  try{for(const c of radioCats()){const r=await fetch('/api/radio/list?cat='+c.id,{cache:'no-store'});if(!r.ok)return;for(const s of radioParseRows(await r.text()))all.push({category:c.id,categoryName:c.name,id:s.id,name:s.name});}}catch{return;}
  radioAlarmCache=all;radioAlarmKey=key;
  if(typeof alarmRenderList==='function'&&typeof alarmDraft!=='undefined'&&alarmDraft)alarmRenderList();
}
async function radioInit(){
  if(!$('stationRows'))return;
  $('catAdd').onclick=()=>{const name=prompt(t('radio.categoryName'),'');if(name&&name.trim())radioCategory({action:'add',name:name.trim()},true);};
  $('catRename').onclick=()=>{const c=radioCat(radioList);if(!c)return;const name=prompt(t('radio.categoryName'),c.name);if(name&&name.trim()&&name.trim()!==c.name)radioCategory({action:'rename',id:c.id,name:name.trim()});};
  $('catDelete').onclick=()=>{const c=radioCat(radioList);if(!c)return;if(radioCats().length<=1){toast(t('radio.keepOne'),true);return;}if(confirm(t('radio.deleteCategoryConfirm').replace('{name}',c.name).replace('{n}',c.count)))radioCategory({action:'delete',id:c.id});};
  const moveCat=d=>{const i=radioCats().findIndex(c=>c.id===radioList);if(i>=0)radioCategory({action:'move',id:radioList,to:i+d});};
  $('catUp').onclick=()=>moveCat(-1);$('catDown').onclick=()=>moveCat(1);
  $('search').oninput=()=>{radioQuery=$('search').value.trim();radioRenderRows();};
  $('radioAdd').onclick=()=>{radioEditing=radioEditing==='new'?null:'new';radioRenderRows();};
  $('radioToggle').onclick=()=>radioToggle();
  $('radioPrev').onclick=()=>radioIsLocal()?radioLocalStep(-1):radioControl({action:'prev'});$('radioNext').onclick=()=>radioIsLocal()?radioLocalStep(1):radioControl({action:'next'});
  for(const b of document.querySelectorAll('#outputSwitch button'))b.onclick=()=>radioSetOutput(b.dataset.output);
  radioRenderOutput();
  $('radioBackup').onclick=radioBackup;$('radioRestore').onclick=()=>$('radioRestoreFile').click();
  $('radioRestoreFile').onchange=()=>{const file=$('radioRestoreFile').files[0];$('radioRestoreFile').value='';if(file)radioRestore(file);};
  $('radioImport').onclick=()=>$('radioFile').click();
  $('radioFile').onchange=()=>{const file=$('radioFile').files[0];$('radioFile').value='';if(file)radioImport(file);};
  $('radioExport').onclick=radioExport;
  let volumeTimer;$('radioVolume').oninput=()=>{$('radioVolumeValue').textContent=$('radioVolume').value;
    if(radioIsLocal()){radioLocal.volume=Number($('radioVolume').value);if(radioLocal.audio)radioLocal.audio.volume=radioLocal.volume/100;try{localStorage.setItem('radioLocalVolume',String(radioLocal.volume));}catch{}return;}
    clearTimeout(volumeTimer);volumeTimer=setTimeout(()=>radioControl({action:'volume',value:Number($('radioVolume').value)}),250);};
  radioSortable($('stationRows'));
  languageHooks.push(()=>{if(radioData)radioRender();});
  try{radioData=await api('/api/radio');}catch(e){toast(e.message,true);return;}
  const s=radioData.state;
  radioList=s.id&&(s.context===0||radioCat(s.context))?s.context:radioData.favorites?0:radioCats()[0]?.id??0;
  await radioLoadList(true);
  radioLoadAlarmStations();
  setInterval(()=>{if(!document.hidden&&active==='radio')radioRefresh();},3000);
}
