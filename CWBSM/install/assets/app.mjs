import {verifyVariant} from './core.mjs';
import {initialLanguage,languageOptions,rememberLanguage,languages} from './language.mjs';
const $=id=>document.getElementById(id),base=new URL('../',import.meta.url);
const allowed=isSecureContext&&(location.protocol==='https:'||['localhost','127.0.0.1','[::1]'].includes(location.hostname));
const supported='serial' in navigator;
let catalog,selected,ready=false,busy=false,componentReady=false,generation=0,controller;
let lang=initialLanguage(),messages={},languageTurn=0;
const t=key=>messages[key]||key;
function status(text,state='idle'){
 $('verificationText').textContent=text;$('verification').dataset.state=state;
 $('verification').querySelector('.verification-icon').textContent=state==='ready'?'✓':state==='error'?'!':state==='checking'?'◌':'○';
}
function refresh(){
 $('capabilityBadge').textContent=t(allowed&&supported?'browser.ready':'browser.requirements');$('capabilityBadge').dataset.state=allowed&&supported?'ready':'warning';
 $('environmentNotice').hidden=allowed&&supported;$('environmentNotice').textContent=t(!allowed?'browser.insecure':'environment.unsupported');
 $('installButton').disabled=!(ready&&componentReady&&supported&&allowed&&!busy);
 $('installButtonText').textContent=t(!selected?'connect.choose':!ready?'connect.wait':'connect.install');
 $('selectedModel').textContent=selected?`CWBSM · ${selected.controller}`:t('connect.none');
 if(selected&&ready)status(t('verify.ready'),'ready');
}
async function language(code,manual=false){
 const turn=++languageTurn;
 try{
  const response=await fetch(new URL('locales/'+code+'.json',base));if(!response.ok)throw Error('Language file HTTP '+response.status);
  const values=await response.json();if(turn!==languageTurn)return;messages=values;lang=code;
  document.documentElement.lang=code==='zh'?'zh-CN':code;document.title='CWBSM v2.2.3 · '+t('nav.install');
  document.querySelectorAll('[data-i18n],[data-i18n-html]').forEach(el=>{const key=el.dataset.i18n||el.dataset.i18nHtml;if(!messages[key])return;if(el.dataset.i18nHtml)el.innerHTML=messages[key];else el.textContent=messages[key];});
  $('languageSelect').value=code;$('languageSelect').setAttribute('aria-label',t('language'));
  if(!selected)status(t('verify.idle'));if(manual)rememberLanguage(code);refresh();
 }catch(error){
  if(code!=='en')return language('en');
  status('Language files unavailable / 无法加载语言文件 · '+error.message,'error');
 }
}
languageOptions($('languageSelect'));$('languageSelect').onchange=()=>language($('languageSelect').value,true);
window.addEventListener('storage',event=>{if(event.key==='cwbsm-language'&&languages.some(([code])=>code===event.newValue)&&event.newValue!==lang)language(event.newValue);});
$('guideLink').href=base.pathname.endsWith('/install/')?new URL('../index.html',base):new URL('README.md',base);
function details(variant){
 const root=$('fileDetails');root.replaceChildren();
 for(const file of variant.files){
  const row=document.createElement('p'),link=document.createElement('a'),hash=document.createElement('code');link.href=new URL(file.path,base);
  link.textContent=`${file.name} · 0x${file.offset.toString(16).toUpperCase()} · ${file.bytes.toLocaleString()} B`;hash.textContent=file.sha256;
  row.append(link,document.createElement('br'),hash);root.append(row);
 }
}
async function select(id){
 const turn=++generation;controller?.abort();controller=new AbortController();ready=false;selected=catalog?.variants.find(variant=>variant.id===id);refresh();if(!selected)return;
 document.querySelectorAll('.model-card').forEach(el=>el.classList.toggle('selected',el.dataset.model===id));
 $('selectedSize').textContent=`${(selected.totalBytes/1048576).toFixed(2)} MB`;$('selectedDownload').href=new URL(selected.download,base);$('selectedDownload').download='';details(selected);
 $('retryVerify').hidden=true;$('verificationProgress').hidden=false;$('verificationProgress').value=0;status(t('verify.checking'),'checking');
 try{
  const url=await verifyVariant(selected,base,{signal:controller.signal,onProgress:value=>{if(turn===generation)$('verificationProgress').value=value;}});
  if(turn!==generation)return;$('installer').manifest=url;$('installer').setAttribute('manifest',url);ready=true;refresh();
 }catch(error){if(turn!==generation)return;status(t('verify.error')+' · '+error.message,'error');$('retryVerify').hidden=false;}
 finally{if(turn===generation){$('verificationProgress').hidden=true;refresh();}}
}
$('modelChoices').disabled=true;
language(lang);
fetch(new URL('release.json',base),{cache:'no-cache'}).then(response=>{if(!response.ok)throw Error('HTTP '+response.status);return response.json();}).then(value=>{catalog=value;$('releaseVersion').textContent=value.version;$('modelChoices').disabled=false;}).catch(error=>status(t('verify.catalogError')+' · '+error.message,'error'));
$('modelChoices').addEventListener('change',event=>select(event.target.value));$('retryVerify').onclick=()=>select(selected.id);
$('installer').addEventListener('click',event=>{if(!(ready&&componentReady&&supported&&allowed&&!busy)){event.preventDefault();event.stopImmediatePropagation();}},true);
if(allowed&&supported)import('../vendor/esp-web-tools/install-button.js').then(()=>{componentReady=true;refresh();}).catch(error=>{status(t('verify.componentError')+' · '+error.message,'error');});
new MutationObserver(()=>{busy=!!document.querySelector('ewt-install-dialog');$('modelChoices').disabled=busy||!catalog;refresh();}).observe(document.body,{childList:true});
