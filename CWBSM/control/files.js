'use strict';
// SD card file manager. Browse, upload, download, rename, delete and make folders.
// Uploads are converted on the way, by where they go:
//   /txt...  text is re-encoded to UTF-8 (GBK / GB18030, Big5, UTF-16 are detected or chosen)
//   /pic...  pictures are cropped to fill the screen (320 x 240, or 240 x 320 when the device
//            is turned to portrait) and saved as JPEG
//   /mp3...  MP3 files only (checked by their first bytes), unchanged
// Everything else is uploaded as it is. One file at a time; the device shows the progress.
// MP3 files can be played on the device; a bar at the top controls the playback.
let filesPath='/',filesEntries=[],filesQueue=[],filesUploading=null,filesCard=null;
function filesEl(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;}
function filesJoin(dir,name){return (dir==='/'?'':dir)+'/'+name;}
function filesSize(n){return n<1024?n+' B':n<1048576?(n/1024).toFixed(n<10240?1:0)+' KB':n<1073741824?(n/1048576).toFixed(1)+' MB':(n/1073741824).toFixed(1)+' GB';}
function filesDate(t){if(!t)return '';const d=new Date(t*1000);return d.toLocaleDateString(lang,{month:'2-digit',day:'2-digit'})+' '+d.toLocaleTimeString(lang,{hour:'2-digit',minute:'2-digit'});}
function filesKind(path){const p=path.toLowerCase();return p==='/txt'||p.startsWith('/txt/')?'txt':p==='/pic'||p.startsWith('/pic/')?'pic':p==='/mp3'||p.startsWith('/mp3/')?'mp3':'';}
function filesIcon(e){if(e.d)return '📁';const n=e.n.toLowerCase();return n.endsWith('.mp3')?'♪':n.endsWith('.txt')?'▤':/\.jpe?g$/.test(n)?'▣':n.endsWith('.json')?'⚙':'·';}
const filesBadName=name=>!name||/[\\/:*?"<>|\x00-\x1f]/.test(name)||name==='.'||name==='..'||/[ .]$/.test(name);

async function filesStatus(){
  const node=$('filesCard');if(!node)return null;
  try{const s=await api('/api/sd');filesCard=s;
    node.textContent=s.present?t('files.card').replace('{type}',s.type).replace('{used}',filesSize(s.used)).replace('{total}',filesSize(s.total)):t('files.noCard');
    node.classList.toggle('error',!s.present);return s;}
  catch(e){node.textContent=localError(e.message);return null;}
}
async function filesLoad(path=filesPath){
  const list=$('filesList');
  try{
    const r=await fetch('/api/files?path='+encodeURIComponent(path),{cache:'no-store'});
    const data=await r.json().catch(()=>({error:'HTTP '+r.status}));
    if(!r.ok)throw Error(data.error||('HTTP '+r.status));
    filesPath=data.path;filesEntries=data.entries.sort((a,b)=>b.d-a.d||a.n.localeCompare(b.n,lang,{numeric:true}));
    if(data.more)toast(t('files.more'));
  }catch(e){
    filesEntries=[];list.replaceChildren(filesEl('p','hint',localError(e.message)));
    if(/Folder not found/.test(e.message)&&path!=='/'){filesPath='/';return filesLoad('/');}
    filesCrumbs();return;
  }
  filesCrumbs();filesRender();
}
function filesCrumbs(){
  const bar=$('filesCrumbs');bar.replaceChildren();
  const go=(label,path)=>{const b=filesEl('button','link',label);b.type='button';b.onclick=()=>filesLoad(path);bar.append(b);};
  go(t('files.root'),'/');let at='';
  for(const part of filesPath.split('/').filter(Boolean)){at+='/'+part;bar.append(filesEl('span','sep','›'));go(part,at);}
}
function filesRender(){
  const list=$('filesList');list.replaceChildren();
  if(filesPath!=='/'){const up=filesEl('div','row file-row');up.append(filesEl('span','file-icon','📁'),filesEl('button','link file-name','..'));up.querySelector('button').onclick=()=>filesLoad(filesPath.replace(/\/[^/]*$/,'')||'/');list.append(up);}
  if(!filesEntries.length)list.append(filesEl('p','hint',t('files.empty')));
  for(const e of filesEntries){
    const path=filesJoin(filesPath,e.n),row=filesEl('div','row file-row');
    const name=filesEl(e.d?'button':'span',e.d?'link file-name':'file-name',e.n);
    if(e.d){name.type='button';name.onclick=()=>filesLoad(path);}
    row.append(filesEl('span','file-icon',filesIcon(e)),name,filesEl('span','file-meta',e.d?'':filesSize(e.s)),filesEl('span','file-meta',filesDate(e.t)));
    const actions=filesEl('span','file-actions');
    if(!e.d&&/\.mp3$/i.test(e.n)){const play=filesEl('button','icon-button','▶');play.type='button';play.title=t('files.playOnDevice');play.onclick=()=>filesMusic({action:'play',path});actions.append(play);}
    if(!e.d){const a=filesEl('a','icon-button','⬇');a.href='/api/files/download?path='+encodeURIComponent(path);a.download=e.n;a.title=t('files.download');actions.append(a);}
    const rename=filesEl('button','icon-button','✎');rename.type='button';rename.title=t('files.rename');rename.onclick=()=>filesRename(path,e.n);
    const del=filesEl('button','icon-button danger-text','🗑');del.type='button';del.title=t('button.remove');del.onclick=()=>filesDelete(path,e);
    actions.append(rename,del);row.append(actions);list.append(row);
  }
}
async function filesRename(path,old){
  const name=prompt(t('files.renamePrompt'),old);if(name===null||name===old)return;
  if(filesBadName(name.trim())){toast(t('files.badName'),true);return;}
  try{await api('/api/files/rename',{from:path,to:filesJoin(filesPath,name.trim())});await filesLoad();}catch(e){toast(e.message,true);}
}
async function filesDelete(path,e){
  if(!confirm(t(e.d?'files.deleteFolder':'files.deleteFile').replace('{name}',e.n)))return;
  try{await api('/api/files/delete',{path});await filesLoad();await filesStatus();}catch(err){toast(err.message,true);}
}
async function filesMkdir(){
  const name=prompt(t('files.folderPrompt'),'');if(name===null)return;
  if(filesBadName(name.trim())){toast(t('files.badName'),true);return;}
  try{await api('/api/files/mkdir',{path:filesJoin(filesPath,name.trim())});await filesLoad();}catch(e){toast(e.message,true);}
}

// ---- Conversions ------------------------------------------------------------------
// Text: a BOM decides; otherwise strict UTF-8, else GB18030 (a superset of GBK / GB2312).
function filesDetect(bytes){
  if(bytes[0]===0xEF&&bytes[1]===0xBB&&bytes[2]===0xBF)return 'utf-8';
  if(bytes[0]===0xFF&&bytes[1]===0xFE)return 'utf-16le';
  if(bytes[0]===0xFE&&bytes[1]===0xFF)return 'utf-16be';
  try{new TextDecoder('utf-8',{fatal:true}).decode(bytes);return 'utf-8';}catch{return 'gb18030';}
}
function filesDecode(bytes,encoding){return new TextDecoder(encoding).decode(bytes).replace(/^﻿/,'').replace(/\r\n?/g,'\n');}
// Shows the first lines; resolves to the text to upload, or null to skip the file.
function filesTextDialog(file,bytes,encoding){
  return new Promise(resolve=>{
    const dialog=$('filesTextDialog'),select=$('filesEncoding'),preview=$('filesPreview');
    $('filesTextName').textContent=file.name;select.value=encoding;
    const show=()=>{preview.textContent=filesDecode(bytes.subarray(0,4096),select.value).split('\n').slice(0,12).join('\n');};
    show();select.onchange=show;
    const done=ok=>{dialog.close();resolve(ok?filesDecode(bytes,select.value):null);};
    $('filesTextOk').onclick=()=>done(true);$('filesTextSkip').onclick=()=>done(false);dialog.oncancel=()=>done(false);
    dialog.showModal();
  });
}
async function filesConvertText(file){
  const bytes=new Uint8Array(await file.arrayBuffer());
  const encoding=filesDetect(bytes);
  // UTF-8 already: only the BOM and line endings change, no need to ask.
  const text=encoding==='utf-8'?filesDecode(bytes,'utf-8'):await filesTextDialog(file,bytes,encoding);
  if(text===null)return null;
  return {name:file.name.replace(/\.[^.]*$/,'')+'.txt',blob:new Blob([new TextEncoder().encode(text)],{type:'text/plain'})};
}
// Pictures: cropped to fill the screen in its current orientation, JPEG quality 0.85.
async function filesConvertPicture(file){
  const url=URL.createObjectURL(file);
  try{
    const img=new Image();img.decoding='async';img.src=url;
    try{await img.decode();}catch{throw Error(t('files.notPicture'));}
    const portrait=settings&&(settings.angle===90||settings.angle===270);
    const w=portrait?240:320,h=portrait?320:240;
    const scale=Math.max(w/img.naturalWidth,h/img.naturalHeight);
    const sw=w/scale,sh=h/scale,sx=(img.naturalWidth-sw)/2,sy=(img.naturalHeight-sh)/2;
    const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
    const ctx=canvas.getContext('2d');ctx.imageSmoothingQuality='high';ctx.fillStyle='#000';ctx.fillRect(0,0,w,h);
    ctx.drawImage(img,sx,sy,sw,sh,0,0,w,h);
    const blob=await new Promise(r=>canvas.toBlob(r,'image/jpeg',0.85));
    if(!blob)throw Error(t('files.notPicture'));
    return {name:file.name.replace(/\.[^.]*$/,'')+'.jpg',blob};
  }finally{URL.revokeObjectURL(url);}
}
async function filesCheckMp3(file){
  const b=new Uint8Array(await file.slice(0,4).arrayBuffer());
  const ok=(b[0]===0x49&&b[1]===0x44&&b[2]===0x33)||(b[0]===0xFF&&(b[1]&0xE0)===0xE0);
  if(!ok)throw Error(t('files.notMp3'));
  return {name:file.name,blob:file};
}

// ---- Upload queue -----------------------------------------------------------------
function filesAdd(files){
  const dir=filesPath,kind=filesKind(dir);
  for(const file of files)filesQueue.push({file,dir,kind,state:'waiting',done:0,total:file.size,xhr:null,error:''});
  filesRenderQueue();filesNext();
}
function filesRenderQueue(){
  const box=$('filesQueue');box.replaceChildren();box.hidden=!filesQueue.length;
  for(const item of filesQueue){
    const row=filesEl('div','queue-row'),name=filesEl('span','file-name',item.name||item.file.name);
    let state=t('files.state.'+item.state);
    if(item.state==='uploading'&&item.total)state=Math.floor(item.done*100/item.total)+'%';
    if(item.state==='failed')state=localError(item.error);
    const bar=filesEl('progress');bar.max=item.total||1;bar.value=item.state==='done'?bar.max:item.done;
    row.append(name,bar,filesEl('span','queue-state'+(item.state==='failed'?' error':''),state));
    if(item.state==='waiting'||item.state==='uploading'||item.state==='converting'){
      const cancel=filesEl('button','icon-button','✕');cancel.type='button';cancel.title=t('button.cancel');
      cancel.onclick=()=>{if(item.xhr)item.xhr.abort();item.state='cancelled';filesRenderQueue();filesNext();};row.append(cancel);
    }
    box.append(row);
  }
  if(filesQueue.length&&filesQueue.every(i=>!['waiting','converting','uploading'].includes(i.state))){
    const clear=filesEl('button','secondary',t('files.clearQueue'));clear.type='button';clear.onclick=()=>{filesQueue=[];filesRenderQueue();};box.append(clear);
  }
}
async function filesNext(){
  if(filesUploading)return;
  const item=filesQueue.find(i=>i.state==='waiting');if(!item)return;
  filesUploading=item;
  try{
    item.state='converting';filesRenderQueue();
    const out=item.kind==='txt'&&/\.(txt|text|md)$/i.test(item.file.name)?await filesConvertText(item.file)
      :item.kind==='pic'?await filesConvertPicture(item.file)
      :item.kind==='mp3'?await filesCheckMp3(item.file)
      :{name:item.file.name,blob:item.file};
    if(item.state==='cancelled')return;
    if(!out){item.state='skipped';return;}
    if(filesBadName(out.name))throw Error(t('files.badName'));
    item.name=out.name;item.total=out.blob.size;
    const path=filesJoin(item.dir,out.name);
    let overwrite=false;
    if(item.dir===filesPath&&filesEntries.some(e=>e.n===out.name)){
      if(!confirm(t('files.overwrite').replace('{name}',out.name))){item.state='skipped';return;}
      overwrite=true;
    }
    item.state='uploading';filesRenderQueue();
    await new Promise((resolve,reject)=>{
      const xhr=new XMLHttpRequest();item.xhr=xhr;
      xhr.open('POST','/api/files/upload');
      xhr.setRequestHeader('Content-Type','application/octet-stream');
      xhr.setRequestHeader('X-File-Path',encodeURIComponent(path));
      if(overwrite)xhr.setRequestHeader('X-Overwrite','1');
      for(const [k,v] of Object.entries(mfaSessionHeader()))xhr.setRequestHeader(k,v);
      let shown=0;
      xhr.upload.onprogress=e=>{item.done=e.loaded;const now=Date.now();if(now-shown>300){shown=now;filesRenderQueue();}};
      xhr.onload=()=>{let body={};try{body=JSON.parse(xhr.responseText);}catch{}xhr.status===200?resolve():reject(Error(body.error||('HTTP '+xhr.status)));};
      xhr.onerror=()=>reject(Error(t('files.connectionLost')));
      xhr.onabort=()=>reject(Error('cancelled'));
      xhr.send(out.blob);
    });
    item.state='done';
  }catch(e){if(item.state!=='cancelled'){item.state='failed';item.error=e.message;}}
  finally{
    item.xhr=null;filesUploading=null;filesRenderQueue();
    if(item.dir===filesPath)await filesLoad();
    if(!filesQueue.some(i=>i.state==='waiting'))await filesStatus();
    filesNext();
  }
}

// ---- Music on the device -------------------------------------------------------------
let filesMusicState=null,filesMusicTimer=0;
const filesClock=s=>Math.floor(s/60)+':'+String(s%60).padStart(2,'0');
async function filesMusic(body){
  try{filesMusicState=body?await api('/api/music',body):await api('/api/music');}catch(e){if(body)toast(e.message,true);return;}
  filesRenderMusic();
}
function filesRenderMusic(){
  const bar=$('filesMusic'),s=filesMusicState;if(!bar)return;
  bar.hidden=!s||!s.on;if(bar.hidden)return;
  $('musicName').textContent=s.file;
  const state=s.error?t(s.error):s.state==='paused'?t('timer.paused'):s.state==='connecting'?t('radio.connecting'):'';
  $('musicTime').textContent=(state?state+' · ':'')+filesClock(s.elapsed)+(s.duration?' / '+filesClock(Math.max(s.duration,s.elapsed)):'');
  $('musicToggle').textContent=s.state==='playing'?'⏸':'▶';
  $('musicMode').value=s.mode;
  if(document.activeElement!==$('musicVolume'))$('musicVolume').value=s.volume;
}
function filesPollMusic(){clearTimeout(filesMusicTimer);if(active==='files'&&!document.hidden)filesMusic();filesMusicTimer=setTimeout(filesPollMusic,2000);}

// ---- Section ----------------------------------------------------------------------
async function filesInit(){
  const section=$('files');if(!section)return;
  section.innerHTML='<div class="card music-bar" id="filesMusic" hidden><span class="file-icon">♪</span><div class="music-text"><strong id="musicName"></strong><small id="musicTime"></small></div>'+
    '<div class="music-controls"><button type="button" class="icon-button" data-music="prev">⏮</button><button type="button" class="icon-button" id="musicToggle" data-music="toggle">⏸</button><button type="button" class="icon-button" data-music="next">⏭</button><button type="button" class="icon-button" data-music="stop">■</button>'+
    '<select id="musicMode"><option value="order" data-i18n="sd.order"></option><option value="repeat" data-i18n="sd.repeat"></option><option value="shuffle" data-i18n="sd.shuffle"></option></select>'+
    '<input type="range" id="musicVolume" min="0" max="100" aria-label="volume"></div></div>'+
    '<div class="card"><div class="toolbar"><p id="filesCard" class="hint"></p><div class="file-tools">'+
    '<button type="button" class="secondary" data-go="/mp3">mp3</button><button type="button" class="secondary" data-go="/txt">txt</button><button type="button" class="secondary" data-go="/pic">pic</button>'+
    '<button type="button" class="secondary" id="filesMkdir" data-i18n="files.newFolder"></button><button type="button" class="primary" id="filesUpload" data-i18n="files.upload"></button>'+
    '<input type="file" id="filesInput" multiple hidden></div></div>'+
    '<nav id="filesCrumbs" class="crumbs"></nav><div id="filesDrop" class="file-drop"><div id="filesList"></div></div>'+
    '<p class="hint" data-i18n="files.hint"></p><div id="filesQueue" class="queue" hidden></div></div>'+
    '<dialog id="filesTextDialog" class="files-dialog"><h3 data-i18n="files.textTitle"></h3><p class="hint" id="filesTextName"></p>'+
    '<label for="filesEncoding" data-i18n="files.encoding"></label><select id="filesEncoding"><option value="gb18030">GBK / GB18030</option><option value="big5">Big5</option><option value="utf-8">UTF-8</option><option value="utf-16le">UTF-16 LE</option><option value="utf-16be">UTF-16 BE</option></select>'+
    '<pre id="filesPreview"></pre><div class="dialog-buttons"><button type="button" class="secondary" id="filesTextSkip" data-i18n="files.skip"></button><button type="button" class="primary" id="filesTextOk" data-i18n="files.upload"></button></div></dialog>';
  for(const b of section.querySelectorAll('[data-go]'))b.onclick=async()=>{const path=b.dataset.go;await filesLoad(path);};
  for(const b of section.querySelectorAll('[data-music]'))b.onclick=()=>filesMusic({action:b.dataset.music});
  $('musicMode').onchange=()=>filesMusic({action:'mode',value:$('musicMode').value});
  $('musicVolume').onchange=()=>filesMusic({action:'volume',value:Number($('musicVolume').value)});
  filesPollMusic();
  $('filesMkdir').onclick=filesMkdir;
  $('filesUpload').onclick=()=>$('filesInput').click();
  $('filesInput').onchange=()=>{const files=[...$('filesInput').files];$('filesInput').value='';if(files.length)filesAdd(files);};
  const drop=$('filesDrop');
  drop.ondragover=e=>{e.preventDefault();drop.classList.add('over');};
  drop.ondragleave=()=>drop.classList.remove('over');
  drop.ondrop=e=>{e.preventDefault();drop.classList.remove('over');const files=[...e.dataTransfer.files];if(files.length)filesAdd(files);};
  window.addEventListener('beforeunload',e=>{if(filesUploading){e.preventDefault();e.returnValue='';}});
  languageHooks.push(()=>{if($('filesList')){filesStatus();filesCrumbs();filesRender();filesRenderQueue();}});
  translate();
}
// Loaded when the section is opened (app.js calls this), so the card is not read at start.
let filesOpened=false;
async function filesShow(){
  if(!$('filesList'))return;
  const s=await filesStatus();
  if(s?.present&&(!filesOpened||!filesEntries.length)){filesOpened=true;await filesLoad();}
  else if(!s?.present){filesEntries=[];$('filesList').replaceChildren();$('filesCrumbs').replaceChildren();}
}
