'use strict';
// Alarm module: up to 8 alarms (each with its own time zone), ring settings, and the
// countdown / pomodoro timer. Uses app.js helpers ($, t, api, toast, catalogue, settings).
let alarmData=null,alarmDraft=null,alarmPoll=null,alarmDirty=false,alarmSaving=false;
const ALARM_WEEK=[1,2,3,4,5,6,0];  // Monday first; bit n = weekday n (0 = Sunday)
const ALARM_SUNRISE=[0,5,10,15,20,30];
function alarmZone(id){return catalogue.find(z=>z.id===id);}
function alarmZoneText(id){const z=alarmZone(id);return z?zoneLabel(z):id;}
function alarmPad(n){return String(n).padStart(2,'0');}
function alarmClock(seconds){seconds=Math.max(0,Math.round(seconds));const h=Math.floor(seconds/3600),m=Math.floor(seconds/60)%60,s=seconds%60;return (h?h+':'+alarmPad(m):alarmPad(m))+':'+alarmPad(s);}
function alarmTrim(text){const bytes=new TextEncoder();let value=text;while(bytes.encode(value).length>31)value=value.slice(0,-1);return value;}
function alarmDays(days){if(!days)return t('alarm.once');if(days===127)return t('alarm.everyday');if(days===0x3e)return t('alarm.weekdays');if(days===0x41)return t('alarm.weekend');return ALARM_WEEK.filter(d=>days&(1<<d)).map(d=>t('day.'+d)).join(lang==='zh'||lang==='ja'?'':' ');}
// "Mon 07:00 · Beijing" for an epoch second in an alarm's zone.
function alarmWhen(epoch,zoneId){const z=alarmZone(zoneId),tz=z?.ianaId||zoneId;try{return new Intl.DateTimeFormat(document.documentElement.lang||'en',{weekday:'short',hour:'2-digit',minute:'2-digit',hour12:false,timeZone:tz}).format(new Date(epoch*1000));}catch{return new Date(epoch*1000).toLocaleString();}}
function alarmUntil(seconds){const minutes=Math.max(1,Math.ceil(seconds/60));return t(minutes>=60?'alarm.inHours':'alarm.inMinutes').replace('{h}',Math.floor(minutes/60)).replace('{m}',minutes>=60?minutes%60:minutes);}
function alarmField(key,input){const wrap=document.createElement('div');const label=document.createElement('label');label.dataset.i18n=key;label.textContent=t(key);if(!input.id)input.id='a'+Math.random().toString(36).slice(2,9);label.htmlFor=input.id;wrap.append(label,input);return wrap;}
function alarmSelect(options,value){const select=document.createElement('select');for(const [v,text] of options)select.add(new Option(text,v));select.value=String(value);return select;}
function alarmZoneSelect(value){
  const select=document.createElement('select');
  select.add(new Option(t('alarm.primaryZone')+' · '+alarmZoneText(alarmData.primaryZone),''));
  const mine=document.createElement('optgroup');mine.label=t('alarm.clockZones');
  for(const id of settings.zones||[])mine.append(new Option(alarmZoneText(id),id));
  const all=document.createElement('optgroup');all.label=t('alarm.allZones');
  for(const z of catalogue.slice().sort((a,b)=>zoneLabel(a).localeCompare(zoneLabel(b))))all.append(new Option(zoneLabel(z),z.id));
  select.append(mine,all);select.value=value||'';return select;
}
function alarmTouched(){alarmDirty=true;$('alarmSave').classList.add('pulse');}
function alarmRenderList(){
  const root=$('alarmRows');if(!root||!alarmDraft)return;root.replaceChildren();
  $('alarmCount').textContent=alarmDraft.alarms.length+' / '+(alarmData?.max||8);
  $('alarmAdd').disabled=alarmDraft.alarms.length>=(alarmData?.max||8);
  if(!alarmDraft.alarms.length){const p=document.createElement('p');p.className='hint';p.dataset.i18n='alarm.empty';p.textContent=t('alarm.empty');root.append(p);}
  alarmDraft.alarms.forEach((alarm,index)=>{
    const row=document.createElement('div');row.className='alarm-row'+(alarm.enabled?'':' off');
    const head=document.createElement('div');head.className='alarm-head';
    const toggle=document.createElement('label');toggle.className='switch';const check=document.createElement('input');check.type='checkbox';check.checked=alarm.enabled;check.setAttribute('aria-label',t('alarm.enabled'));check.onchange=()=>{alarm.enabled=check.checked;row.classList.toggle('off',!check.checked);alarmTouched();};toggle.append(check,document.createElement('span'));
    const time=document.createElement('input');time.type='time';time.className='alarm-time';time.required=true;time.value=alarmPad(alarm.hour)+':'+alarmPad(alarm.minute);time.setAttribute('aria-label',t('alarm.time'));time.onchange=()=>{const [h,m]=time.value.split(':').map(Number);if(Number.isFinite(h)&&Number.isFinite(m)){alarm.hour=h;alarm.minute=m;alarmTouched();}};
    const label=document.createElement('input');label.className='alarm-label';label.maxLength=31;label.value=alarm.label;label.placeholder=t('alarm.labelPlaceholder');label.dataset.placeholder='alarm.labelPlaceholder';label.setAttribute('aria-label',t('alarm.label'));label.oninput=()=>{const v=alarmTrim(label.value);if(v!==label.value)label.value=v;alarm.label=v;alarmTouched();};
    const actions=document.createElement('div');actions.className='row-actions';
    actions.append(action('alarm.ringTest','🔔',async()=>{if(alarmDirty)await alarmSave();alarmAction({action:'ring',index});}),action('alarm.remove','✕',()=>{alarmDraft.alarms.splice(index,1);alarmTouched();alarmRenderList();}));
    head.append(toggle,time,label,actions);
    const days=document.createElement('div');days.className='alarm-days';days.setAttribute('role','group');days.setAttribute('aria-label',t('alarm.repeat'));
    for(const d of ALARM_WEEK){const chip=document.createElement('button');chip.type='button';chip.className='day-chip'+(alarm.days&(1<<d)?' on':'');chip.textContent=t('day.'+d);chip.setAttribute('aria-pressed',String(!!(alarm.days&(1<<d))));chip.onclick=()=>{alarm.days^=1<<d;chip.classList.toggle('on');chip.setAttribute('aria-pressed',String(!!(alarm.days&(1<<d))));summary.textContent=alarmDays(alarm.days);alarmTouched();};days.append(chip);}
    const summary=document.createElement('span');summary.className='alarm-summary';summary.textContent=alarmDays(alarm.days);days.append(summary);
    const grid=document.createElement('div');grid.className='alarm-grid';
    const zone=alarmZoneSelect(alarm.zone);zone.onchange=()=>{alarm.zone=zone.value;alarmTouched();};
    const tone=alarmSelect([0,1,2,3].map(i=>['t'+i,t('tone.'+['beep','chime','melody','gentle'][i])]),'t'+alarm.tone);const stations=typeof radioStations==='function'?radioStations():[];const groups={};for(const st of stations){if(!groups[st.category]){const group=document.createElement('optgroup');group.label=t('radio.alarmGroup')+' · '+st.categoryName;tone.append(group);groups[st.category]=group;}groups[st.category].append(new Option('📻 '+st.name,'r'+st.category+':'+st.id));}const picked=alarm.stationId?'r'+alarm.stationCat+':'+alarm.stationId:'';if(picked&&![...tone.options].some(o=>o.value===picked))tone.append(new Option('📻 …',picked));tone.value=picked||'t'+alarm.tone;tone.onchange=()=>{const v=tone.value;delete alarm.station;if(v[0]==='r'){const [c,i]=v.slice(1).split(':');alarm.stationCat=Number(c);alarm.stationId=Number(i);}else{alarm.stationCat=0;alarm.stationId=0;alarm.tone=Number(v.slice(1));}alarmTouched();};
    const snooze=document.createElement('input');snooze.type='number';snooze.min=1;snooze.max=30;snooze.value=alarm.snooze;snooze.onchange=()=>{alarm.snooze=Math.min(30,Math.max(1,Math.round(Number(snooze.value)||9)));snooze.value=alarm.snooze;alarmTouched();};
    const sunrise=alarmSelect(ALARM_SUNRISE.map(m=>[m,m?t('alarm.sunriseBefore').replace('{m}',m):t('alarm.sunriseOff')]),alarm.sunrise);sunrise.onchange=()=>{alarm.sunrise=Number(sunrise.value);alarmTouched();};
    grid.append(alarmField('alarm.zone',zone),alarmField('alarm.tone',tone),alarmField('alarm.snoozeMinutes',snooze),alarmField('alarm.sunrise',sunrise));
    row.append(head,days,grid);root.append(row);
  });
}
function alarmRenderStatus(){
  if(!alarmData||!$('alarmStatus'))return;
  const s=alarmData.state,box=$('alarmStatus');box.replaceChildren();
  const ringing=s.ringing;
  $('alarmRinging').hidden=!ringing;
  if(ringing){const a=alarmData.alarms[s.ringIndex];$('alarmRingTitle').textContent=ringing==='alarm'?(a?.label||t('nav.alarm'))+' · '+alarmPad(a?.hour??0)+':'+alarmPad(a?.minute??0):t(ringing==='timer'?'timer.done':ringing==='focusDone'?'timer.focusDone':ringing==='event'?'calendar.reminder':'timer.restDone');$('alarmSnooze').textContent=ringing==='alarm'?t('alarm.snooze').replace('{m}',a?.snooze??9):t(ringing==='timer'?'timer.plus5':'timer.stop');}
  const line=(key,value)=>{const item=document.createElement('div');const small=document.createElement('small');small.textContent=t(key);const strong=document.createElement('strong');strong.textContent=value;item.append(small,strong);box.append(item);};
  if(s.nextAt){const a=alarmData.alarms[s.nextIndex];const zone=a?.zone||alarmData.primaryZone;line(s.snoozeIndex===s.nextIndex&&s.snoozeUntil===s.nextAt?'alarm.snoozed':'alarm.next',alarmWhen(s.nextAt,zone)+' · '+alarmUntil(s.nextAt-s.now));line('alarm.zone',alarmZoneText(zone));}
  else line('alarm.next',t('alarm.nextNone'));
  if(s.sunrise>=0)line('alarm.sunrise',Math.round(s.sunrise*100)+'%');
  const tm=s.timer,mode=tm.mode;
  $('timerMode').textContent=t(mode==='focus'?'timer.focus':mode==='rest'?'timer.rest':mode==='countdown'?'timer.countdown':'timer.title')+(tm.round&&mode!=='countdown'?' · '+t('timer.round').replace('{n}',tm.round):'');
  $('timerClock').textContent=alarmClock(mode==='idle'?0:tm.remaining);
  $('timerClock').classList.toggle('idle',mode==='idle');
  $('timerBar').style.width=(tm.total?Math.min(100,100*(tm.total-tm.remaining)/tm.total):0)+'%';
  $('timerBar').dataset.mode=mode;
  $('timerPause').textContent=t(tm.running?'timer.pause':'timer.resume');$('timerPause').disabled=mode==='idle';$('timerReset').disabled=mode==='idle';
  $('timerState').textContent=t(mode==='idle'?'timer.idleHint':tm.running?'timer.running':'timer.paused');
}
function alarmLoadDraft(){alarmDraft=JSON.parse(JSON.stringify({volume:alarmData.volume,ringMinutes:alarmData.ringMinutes,brief:alarmData.brief,chime:alarmData.chime,focus:alarmData.focus,rest:alarmData.rest,alarms:alarmData.alarms}));alarmDirty=false;$('alarmSave')?.classList.remove('pulse');
  $('alarmVolume').value=alarmDraft.volume;$('alarmVolumeValue').textContent=alarmDraft.volume+'%';$('alarmRingMinutes').value=alarmDraft.ringMinutes;$('alarmBrief').checked=alarmDraft.brief;$('alarmChime').checked=alarmDraft.chime;$('timerFocus').value=alarmDraft.focus;$('timerRest').value=alarmDraft.rest;alarmRenderList();}
function alarmCollect(){alarmDraft.volume=Number($('alarmVolume').value);alarmDraft.ringMinutes=Math.min(30,Math.max(1,Math.round(Number($('alarmRingMinutes').value)||5)));alarmDraft.brief=$('alarmBrief').checked;alarmDraft.chime=$('alarmChime').checked;alarmDraft.focus=Math.min(120,Math.max(1,Math.round(Number($('timerFocus').value)||25)));alarmDraft.rest=Math.min(60,Math.max(1,Math.round(Number($('timerRest').value)||5)));return alarmDraft;}
async function alarmRefresh(force=false){try{const fresh=await api('/api/alarms');alarmData=fresh;if(force||!alarmDirty)alarmLoadDraft();alarmRenderStatus();}catch(e){if(force)toast(e.message,true);}}
async function alarmAction(body){try{alarmData=await api('/api/alarms/action',body);if(!alarmDirty)alarmLoadDraft();alarmRenderStatus();}catch(e){toast(e.message,true);}}
async function timerAction(body){try{alarmData=await api('/api/timer',body);alarmRenderStatus();}catch(e){toast(e.message,true);}}
async function alarmSave(event){event?.preventDefault();if(alarmSaving)return;alarmSaving=true;$('alarmSave').disabled=true;try{alarmData=await api('/api/alarms',alarmCollect());alarmLoadDraft();alarmRenderStatus();toast(t('app.saved'));}catch(e){toast(e.message,true);}finally{alarmSaving=false;$('alarmSave').disabled=false;}}
function alarmPolling(){clearInterval(alarmPoll);alarmPoll=setInterval(()=>{if(active==='alarm'&&!document.hidden)alarmRefresh();},2000);}
// Digit style of the alarm page, timer and ring screen: like the clock, or its own font,
// colour and per-part animation (POST /api/alarm-digits).
let alarmDigitsDraft=null;
function alarmDigitsRender(force=false){
  const form=$('alarmDigitsForm');if(!form||!settings?.alarmDigits)return;
  if(!force&&alarmDigitsDraft&&form.contains(document.activeElement))return;
  if(force||!alarmDigitsDraft)alarmDigitsDraft=JSON.parse(JSON.stringify(settings.alarmDigits));
  const d=alarmDigitsDraft;
  $('alarmDigitsFollow').checked=d.follow;$('alarmDigitsOwn').hidden=d.follow;
  $('alarmDigitsFont').value=d.font;$('alarmDigitsColor').value=d.color;
  const root=$('alarmDigitsParts');root.replaceChildren();
  ['hour','minute','second'].forEach((part,index)=>{
    const row=document.createElement('div');row.className='clock-part';
    const name=document.createElement('strong');name.textContent=t('clock.'+part);
    const select=document.createElement('select');select.setAttribute('aria-label',t('clock.'+part)+' '+t('clock.effect'));
    (settings.clockEffects||[]).forEach(effect=>select.add(new Option(t('effect.'+effect),effect)));
    select.value=d.effects[index];select.onchange=()=>d.effects[index]=select.value;
    const duration=document.createElement('input');duration.type='number';duration.min=100;duration.max=2000;duration.step=10;duration.required=true;duration.value=d.durations[index];
    duration.setAttribute('aria-label',name.textContent+' '+t('clock.duration'));duration.oninput=()=>d.durations[index]=Number(duration.value);
    const unit=document.createElement('span');unit.className='duration-unit';unit.textContent=t('unit.ms');
    row.append(name,select,duration,unit);root.append(row);
  });
  const separator=$('alarmDigitsSeparator');separator.replaceChildren();
  ['steady','blink','breathe'].forEach(value=>separator.add(new Option(t('separator.'+value),value)));
  separator.value=d.separator;separator.onchange=()=>d.separator=separator.value;
}
async function alarmDigitsSave(event){
  event.preventDefault();const form=$('alarmDigitsForm');if(!form.checkValidity()){form.reportValidity();return;}
  const d=alarmDigitsDraft;d.follow=$('alarmDigitsFollow').checked;d.font=$('alarmDigitsFont').value;d.color=$('alarmDigitsColor').value;
  try{settings=await api('/api/alarm-digits',d);alarmDigitsRender(true);toast(t('app.saved'));}catch(e){toast(e.message,true);}
}
async function alarmInit(){
  if($('alarmDigitsForm')){
    $('alarmDigitsForm').onsubmit=alarmDigitsSave;
    $('alarmDigitsFollow').onchange=()=>{alarmDigitsDraft.follow=$('alarmDigitsFollow').checked;$('alarmDigitsOwn').hidden=alarmDigitsDraft.follow;};
    alarmDigitsRender(true);
  }
  if(!$('alarmForm'))return;
  $('alarmForm').onsubmit=alarmSave;
  $('alarmAdd').onclick=()=>{if(alarmDraft.alarms.length>=(alarmData?.max||8))return;alarmDraft.alarms.push({enabled:true,zone:'',hour:7,minute:0,days:0x3e,tone:1,snooze:9,sunrise:0,stationCat:0,stationId:0,label:''});alarmTouched();alarmRenderList();};
  $('alarmVolume').oninput=()=>{$('alarmVolumeValue').textContent=$('alarmVolume').value+'%';alarmTouched();};
  for(const id of ['alarmRingMinutes','alarmBrief','alarmChime','timerFocus','timerRest'])$(id).addEventListener('change',alarmTouched);
  $('alarmTest').onclick=async()=>{const before=alarmData?.state?.speaker?.notes??0;await alarmAction({action:'test',tone:Number($('alarmTestTone').value),volume:Number($('alarmVolume').value)});setTimeout(async()=>{try{const d=await api('/api/alarms');const sp=d.state.speaker||{};toast(sp.notes>before?t('alarm.testPlaying').replace('{n}',sp.notes-before).replace('{hz}',sp.hz).replace('{duty}',Math.round(sp.duty/5.12)):t('alarm.testSilent'),!(sp.notes>before));}catch(e){toast(e.message,true);}},1200);};
  $('alarmSnooze').onclick=()=>alarmAction({action:'snooze'});
  $('alarmDismiss').onclick=()=>alarmAction({action:'dismiss'});
  $('timerStart').onclick=()=>{const minutes=Number($('timerMinutes').value);if(!(minutes>=1&&minutes<=5999)){toast(t('timer.invalid'),true);return;}timerAction({action:'countdown',seconds:Math.round(minutes*60)});};
  $('timerPomodoro').onclick=async()=>{if(alarmDirty)await alarmSave();timerAction({action:'pomodoro'});};
  $('timerPause').onclick=()=>timerAction({action:alarmData?.state.timer.running?'pause':'resume'});
  $('timerReset').onclick=()=>timerAction({action:'reset'});
  $('timerPlus').onclick=()=>timerAction({action:'add',minutes:5});
  const tones=$('alarmTestTone');tones.replaceChildren();['beep','chime','melody','gentle'].forEach((k,i)=>tones.add(new Option(t('tone.'+k),i)));tones.value='1';
  languageHooks.push(()=>{['beep','chime','melody','gentle'].forEach((k,i)=>tones.options[i].text=t('tone.'+k));alarmRenderList();alarmRenderStatus();});
  await alarmRefresh(true);alarmPolling();
}
