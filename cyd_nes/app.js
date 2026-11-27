const $ = id => document.getElementById(id);
const installer = $('installer');
const button = $('installButton');
const status = $('status');
const base = new URL('.', location.href);
let selected = '';
let verified = false;
let generation = 0;
let componentReady = false;
window.orielBaud = Number($('baud').value);
$('baud').addEventListener('change', () => { window.orielBaud = Number($('baud').value); });

async function selectVariant(variant) {
  const turn = ++generation;
  selected = variant;
  verified = false;
  button.disabled = true;
  $('selected').textContent = variant.toUpperCase();
  status.textContent = '正在校验固件…';
  try {
    const [catalogResponse, manifestResponse] = await Promise.all([
      fetch(new URL('checksums.json', base), {cache: 'no-cache'}),
      fetch(new URL(`manifests/${variant}.json`, base), {cache: 'no-cache'})
    ]);
    if (!catalogResponse.ok || !manifestResponse.ok) throw new Error('无法读取固件清单');
    const files = (await catalogResponse.json())[variant];
    const manifest = await manifestResponse.json();
    const parts = manifest.builds?.[0]?.parts;
    if (manifest.builds?.length !== 1 || manifest.builds[0].chipFamily !== 'ESP32' || files?.length !== 4 || parts?.length !== 4) throw new Error('固件清单格式错误');
    const offsets = [4096, 32768, 57344, 65536];
    for (let i = 0; i < files.length; i++) {
      const url = new URL(files[i].path, base);
      if (files[i].offset !== offsets[i] || parts[i].offset !== offsets[i] || new URL(parts[i].path, manifestResponse.url).href !== url.href || url.origin !== base.origin) throw new Error('固件地址不匹配');
      const response = await fetch(url, {cache: 'no-cache'});
      if (!response.ok) throw new Error(`无法读取 ${files[i].name}`);
      const data = await response.arrayBuffer();
      const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', data))].map(x => x.toString(16).padStart(2, '0')).join('');
      if (data.byteLength !== files[i].size || hash !== files[i].sha256) throw new Error(`${files[i].name} 校验失败`);
    }
    if (turn !== generation) return;
    installer.manifest = new URL(`manifests/${variant}.json`, base).href;
    installer.setAttribute('manifest', installer.manifest);
    verified = true;
    status.textContent = '固件校验通过。';
    button.disabled = !componentReady || !('serial' in navigator || 'usb' in navigator) || !isSecureContext;
    button.textContent = button.disabled ? '请使用 Chrome 或 Edge' : '连接并安装';
  } catch (error) {
    if (turn !== generation) return;
    status.textContent = error.message;
    button.textContent = '校验失败，请重新选择';
  }
}
document.querySelectorAll('input[name="screen"]').forEach(input => input.addEventListener('change', () => selectVariant(input.value)));
installer.addEventListener('click', event => {
  if (!verified || !selected) { event.preventDefault(); event.stopImmediatePropagation(); }
}, true);
if (isSecureContext && ('serial' in navigator || 'usb' in navigator)) {
  import('./vendor/esp-web-tools/install-button.js').then(() => {
    componentReady = true;
    if (verified) { button.disabled = false; button.textContent = '连接并安装'; }
  }).catch(() => {
    verified = false;
    button.disabled = true;
    status.textContent = '无法加载刷机组件。';
  });
} else {
  status.textContent = '请通过 HTTPS 使用桌面版 Chrome 或 Edge。';
}
