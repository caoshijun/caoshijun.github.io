export async function verifyVariant(variant, base, {signal, fetcher=fetch, cryptoApi=crypto, onProgress=()=>{}}={}) {
  const manifestURL=new URL(variant.manifest,base);
  if(manifestURL.origin!==new URL(base).origin) throw Error('Manifest origin mismatch');
  const response=await fetcher(manifestURL,{signal,cache:'no-cache'});
  if(!response.ok) throw Error(`Manifest HTTP ${response.status}`);
  const manifest=await response.json();
  const builds=manifest.builds;
  if(manifest.name!==`CWBSM ${variant.label||variant.controller}` || builds?.length!==1 || builds[0].chipFamily!=='ESP32' || builds[0].parts?.length!==4) throw Error('Manifest/controller mismatch');
  const offsets=[4096,32768,57344,65536];
  for(let i=0;i<4;i++) {
    const file=variant.files[i], part=builds[0].parts[i];
    const expected=new URL(file.path,base), actual=new URL(part.path,manifestURL);
    if(file.offset!==offsets[i] || part.offset!==offsets[i] || actual.href!==expected.href || actual.origin!==manifestURL.origin) throw Error('Firmware path/offset mismatch');
    const result=await fetcher(actual,{signal,cache:'no-cache'});
    if(!result.ok) throw Error(`${file.name}: HTTP ${result.status}`);
    const bytes=await result.arrayBuffer();
    if(bytes.byteLength!==file.bytes) throw Error(`${file.name}: size mismatch`);
    const hash=Array.from(new Uint8Array(await cryptoApi.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
    if(hash!==file.sha256) throw Error(`${file.name}: SHA-256 mismatch`);
    signal?.throwIfAborted(); onProgress((i+1)*25);
  }
  return manifestURL.href;
}
