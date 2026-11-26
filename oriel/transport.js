'use strict';
(() => {
 const original=window.fetch.bind(window),target=sessionStorage.getItem('oriel-device');
 const assetBase=new URL('./',location.href);
 function resolve(input){
  if(typeof input!=='string'||!input.startsWith('/')||input.startsWith('//'))return input;
  if(input.startsWith('/api/')){
   if(!target)throw Error('请返回连接页选择设备');
   const url=new URL(target);if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw Error('设备地址无效');
   return url.origin+input;
  }
  return new URL(input.slice(1),assetBase).href;
 }
 window.fetch=(input,init)=>{
  try{const routed=resolve(input);return original(routed,typeof input==='string'&&input.startsWith('/api/')?{...init,targetAddressSpace:'local',credentials:'omit'}:init);}
  catch(error){return Promise.reject(error);}
 };
 // hls.js uses XMLHttpRequest for the device's radio proxy.
 if(window.XMLHttpRequest){
  const open=window.XMLHttpRequest.prototype.open;
  window.XMLHttpRequest.prototype.open=function(method,url,...args){return open.call(this,method,resolve(url),...args);};
 }
 // Downloads are navigation, not fetch: retrieve them explicitly from the device.
 document.addEventListener('click',async event=>{
  const link=event.target.closest?.('a[download]');if(!link?.getAttribute('href')?.startsWith('/api/'))return;
  event.preventDefault();
  try{const response=await window.fetch(link.getAttribute('href'),{cache:'no-store'});if(!response.ok)throw Error('HTTP '+response.status);
   const url=URL.createObjectURL(await response.blob()),download=document.createElement('a');download.href=url;download.download=link.getAttribute('download')||'oriel-config.json';download.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }catch(error){window.alert('下载失败：'+error.message);}
 });
})();
