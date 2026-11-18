'use strict';
const $=id=>document.getElementById(id),status=$('status'),canvas=$('screen');
const decoder=new CWBSMUSB.ScreenDecoder(),encoder=new TextEncoder();
let port=null,writer=null,reader=null,readTask=null,closing=false,busy=false,timer=null,handshake=null,activeOp=null,info=null,pressed=null;
function controls(){ $('connect').disabled=!!port;$('disconnect').disabled=!port;$('capture').disabled=!writer||busy;$('save').disabled=!writer||busy||!info?.setup; }
function finish(){clearTimeout(timer);clearInterval(handshake);handshake=null;activeOp=null;busy=false;controls();}
async function send(value){
 if(!writer)throw Error('请先连接设备');if(busy)throw Error('请等待当前操作完成');
 busy=true;activeOp=value.op;controls();timer=setTimeout(()=>{decoder.reset();finish();status.textContent='设备响应超时，请重试或重新连接';},20000);
 try{
  const bytes=encoder.encode('\nCWBSM '+JSON.stringify(value)+'\n');
  await writer.write(bytes);
  // Some USB adapters reset the board when opened. Only the read-only handshake
  // is retried; configuration and touch commands are never replayed.
  if(value.op==='info'&&busy)handshake=setInterval(()=>{if(writer)writer.write(bytes).catch(()=>finish());},2000);
 }catch(e){finish();throw e;}
}
async function disconnect(){
 if(closing)return;closing=true;clearTimeout(timer);clearInterval(handshake);handshake=null;
 try{if(reader)await reader.cancel();if(readTask)await readTask;if(writer){writer.releaseLock();writer=null;}if(port)await port.close();}
 catch(e){status.textContent=e.message;}
 finally{port=null;reader=null;readTask=null;info=null;pressed=null;decoder.reset();busy=false;closing=false;controls();}
}
async function readLoop(){
 const textDecoder=new TextDecoder();let pending='';
 try{while(true){const {value,done}=await reader.read();if(done)break;pending+=textDecoder.decode(value,{stream:true});let end;
 while((end=pending.indexOf('\n'))>=0){const line=pending.slice(0,end).trim();pending=pending.slice(end+1);if(!line.startsWith('CWBSM '))continue;
 try{const msg=JSON.parse(line.slice(6));
 if(!busy)continue;
 if(msg.op&&msg.op!==activeOp&&!(activeOp==='screen'&&['pixels','screen-end'].includes(msg.op)))continue;
 if(msg.error)throw Error(msg.error);
 if(['screen','pixels','screen-end'].includes(msg.op)){
  const frame=decoder.accept(msg);if(frame){canvas.width=frame.width;canvas.height=frame.height;canvas.getContext('2d').putImageData(new ImageData(frame.pixels,frame.width,frame.height),0,0);finish();status.textContent='屏幕已刷新';}continue;
 }
 finish();
 if(msg.op==='info'){info=msg;controls();status.textContent=`版本：${msg.version}\n配网模式：${msg.setup?'是':'否'}\nIP：${msg.ip||'未联网'}`;
  $('lan').hidden=!msg.ip;if(msg.ip){const url=new URL('http://'+msg.ip);$('lan').href=url.origin;}
 }else if(msg.op==='touch'){decoder.reset();await send({op:'screen'});}
 else if(msg.saved){info=null;decoder.reset();controls();status.textContent='配置已保存，设备正在重启，请断开后重新连接。';}
 }catch(e){decoder.reset();finish();status.textContent='设备响应：'+e.message;}}
 if(pending.length>8192)throw Error('串口数据过长');
 }}catch(e){if(!closing)status.textContent='连接中断：'+e.message;}
 finally{reader.releaseLock();reader=null;if(!closing){status.textContent='设备已断开，请重新连接';setTimeout(disconnect,0);}}
}
$('connect').onclick=async()=>{try{
 if(!navigator.serial)throw Error('请使用支持 Web Serial 的桌面 Chrome / Edge');
 $('connect').disabled=true;port=await navigator.serial.requestPort();await port.open({baudRate:115200});
 writer=port.writable.getWriter();reader=port.readable.getReader();readTask=readLoop();status.textContent='已连接，正在读取设备信息…';controls();await send({op:'info'});
}catch(e){const message=e.message;await disconnect();status.textContent=message;}};
$('disconnect').onclick=async()=>{await disconnect();status.textContent='已断开';};
$('capture').onclick=()=>{decoder.reset();send({op:'screen'}).catch(e=>status.textContent=e.message);};
$('wifi').onsubmit=async e=>{e.preventDefault();try{
 if(!info?.setup)throw Error('设备必须处于配网模式');const ssid=$('ssid').value,password=$('password').value;
 if(!encoder.encode(ssid).length||encoder.encode(ssid).length>32||encoder.encode(password).length>63)throw Error('Wi-Fi 名称最多 32 字节，密码最多 63 字节');
 await send({op:'wifi',ssid,password});$('password').value='';
}catch(e){status.textContent=e.message;}};
function point(e){const r=canvas.getBoundingClientRect();return {x:Math.max(0,Math.min(canvas.width-1,Math.floor((e.clientX-r.left)*canvas.width/r.width))),y:Math.max(0,Math.min(canvas.height-1,Math.floor((e.clientY-r.top)*canvas.height/r.height)))};}
canvas.onpointerdown=e=>{if(decoder.token===null||busy)return;pressed={...point(e),at:Date.now(),id:e.pointerId};canvas.setPointerCapture(e.pointerId);};
canvas.onpointercancel=()=>{pressed=null;};
canvas.onpointerup=async e=>{if(!pressed||pressed.id!==e.pointerId)return;const from=pressed,to=point(e);pressed=null;try{await send({op:'touch',x:from.x,y:from.y,toX:to.x,toY:to.y,hold:Date.now()-from.at>=600&&Math.abs(to.x-from.x)<=24&&Math.abs(to.y-from.y)<=24,token:decoder.token});}catch(error){status.textContent=error.message;}};
controls();
