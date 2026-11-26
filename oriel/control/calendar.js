'use strict';
// Calendar: custom events (solar or lunar date; once, yearly or monthly; optional reminder
// that rings on the device) and display options (lunar calendar, first weekday).
let calendarData=null,calendarDraft=[],calendarDirty=false;
const CAL_REPEATS=['once','yearly','monthly'],CAL_LUNAR=['auto','on','off'],CAL_WEEK=['auto','sunday','monday'];
const CAL_LUNAR_MONTHS=['正月','二月','三月','四月','五月','六月','七月','八月','九月','十月','冬月','腊月'];
function calLunarDay(d){const n=['十','一','二','三','四','五','六','七','八','九'];return (d<=10?'初':d<20?'十':d===20?'二':d<30?'廿':'三')+n[d%10];}
function calPad(n){return String(n).padStart(2,'0');}
function calTouched(){calendarDirty=true;$('calendarSave').classList.add('pulse');}
function calMonthLabel(e,m){return e.lunar?CAL_LUNAR_MONTHS[m-1]:t('month.'+m);}
function calDayLabel(e,d){return e.lunar?calLunarDay(d):String(d);}
function calDescribe(e){
  const day=calDayLabel(e,e.day),month=e.repeat==='monthly'?'':(e.leap?'闰':'')+calMonthLabel(e,e.month);
  const date=e.repeat==='once'?(e.lunar?e.year+' '+month+day:e.year+'-'+calPad(e.month)+'-'+calPad(e.day)):e.lunar?month+day:e.repeat==='yearly'?calPad(e.month)+'-'+calPad(e.day):day;
  return t('calendar.repeat.'+e.repeat)+' · '+date;
}
function calNextText(e){
  if(!e.next)return t('calendar.noNext');
  const days=e.inDays,when=days===0?t('calendar.today'):days===1?t('calendar.tomorrow'):t('calendar.inDays').replace('{n}',days);
  return e.next+' · '+when;
}
function calRenderToday(){
  const box=$('calendarToday');if(!box||!calendarData)return;box.replaceChildren();
  const line=(key,value)=>{const item=document.createElement('div');const small=document.createElement('small');small.textContent=t(key);const strong=document.createElement('strong');strong.textContent=value;item.append(small,strong);box.append(item);};
  line('calendar.today',calendarData.today||'—');
  const l=calendarData.lunarToday;if(l)line('calendar.lunarDate',(l.leap?'闰':'')+CAL_LUNAR_MONTHS[l.month-1]+calLunarDay(l.day));
  const next=(calendarData.events||[]).filter(e=>e.next).sort((a,b)=>a.inDays-b.inDays)[0];
  line('calendar.upcoming',next?next.name+' · '+calNextText(next):t('calendar.empty'));
}
function calRenderList(){
  const root=$('calendarRows');if(!root)return;root.replaceChildren();
  const max=calendarData?.max||30;$('calendarAdd').disabled=calendarDraft.length>=max;$('calendarCount').textContent=calendarDraft.length+' / '+max;
  if(!calendarDraft.length){const p=document.createElement('p');p.className='hint';p.textContent=t('calendar.empty');root.append(p);}
  calendarDraft.forEach((e,index)=>{
    const row=document.createElement('div');row.className='alarm-row calendar-row';
    const head=document.createElement('div');head.className='alarm-head';
    const name=document.createElement('input');name.className='alarm-label';name.maxLength=47;name.value=e.name;name.placeholder=t('calendar.name');name.setAttribute('aria-label',t('calendar.name'));name.oninput=()=>{e.name=name.value;calTouched();};
    const select=(options,value,label,format,change)=>{const s=document.createElement('select');options.forEach(o=>s.add(new Option(format(o),o)));s.value=String(value);s.setAttribute('aria-label',t(label));s.onchange=()=>{change(s.value);calTouched();calRenderList();};return s;};
    const kind=select(['solar','lunar'],e.lunar?'lunar':'solar','calendar.kind',k=>t('calendar.kind.'+k),v=>{e.lunar=v==='lunar';if(!e.lunar)e.leap=false;if(e.lunar&&e.day>30)e.day=30;});
    const repeat=select(CAL_REPEATS,e.repeat,'calendar.repeat',r=>t('calendar.repeat.'+r),v=>{e.repeat=v;if(v==='monthly')e.leap=false;});
    const actions=document.createElement('div');actions.className='row-actions';
    const move=d=>{const j=index+d;if(j<0||j>=calendarDraft.length)return;[calendarDraft[index],calendarDraft[j]]=[calendarDraft[j],calendarDraft[index]];calTouched();calRenderList();};
    actions.append(action('button.up','↑',()=>move(-1)),action('button.down','↓',()=>move(1)),action('calendar.remove','✕',()=>{calendarDraft.splice(index,1);calTouched();calRenderList();}));
    head.append(name,kind,repeat,actions);
    const grid=document.createElement('div');grid.className='alarm-grid calendar-grid';
    const field=(label,control)=>{const wrap=document.createElement('label');const span=document.createElement('span');span.textContent=t(label);wrap.append(span,control);grid.append(wrap);};
    if(e.repeat==='once'){const year=document.createElement('input');year.type='number';year.min=1900;year.max=2100;year.value=e.year;year.oninput=()=>{e.year=Number(year.value)||e.year;calTouched();};field('calendar.year',year);}
    if(e.repeat!=='monthly'){
      const month=document.createElement('select');for(let m=1;m<=12;++m)month.add(new Option(calMonthLabel(e,m),m));month.value=e.month;month.onchange=()=>{e.month=Number(month.value);calTouched();};field('calendar.month',month);
      if(e.lunar){const leap=document.createElement('input');leap.type='checkbox';leap.checked=!!e.leap;leap.onchange=()=>{e.leap=leap.checked;calTouched();};const wrap=document.createElement('label');wrap.className='check-line compact';wrap.append(leap,document.createTextNode(t('calendar.leap')));grid.append(wrap);}
    }
    const day=document.createElement('select');for(let d=1;d<=(e.lunar?30:31);++d)day.add(new Option(calDayLabel(e,d),d));day.value=e.day;day.onchange=()=>{e.day=Number(day.value);calTouched();};field('calendar.day',day);
    const remind=document.createElement('input');remind.type='time';remind.value=e.remind>=0?calPad(Math.floor(e.remind/60))+':'+calPad(e.remind%60):'';remind.onchange=()=>{const m=/^(\d\d):(\d\d)/.exec(remind.value);e.remind=m?Number(m[1])*60+Number(m[2]):-1;calTouched();};field('calendar.remind',remind);
    const summary=document.createElement('p');summary.className='alarm-summary';summary.textContent=calDescribe(e)+(e.orig>=0&&!calendarDirty?' · '+calNextText(e):'')+(e.remind>=0?' · 🔔 '+calPad(Math.floor(e.remind/60))+':'+calPad(e.remind%60):'');
    row.append(head,grid,summary);root.append(row);
  });
}
function calLoadDraft(){calendarDraft=(calendarData?.events||[]).map((e,i)=>({...e,orig:i}));calendarDirty=false;$('calendarSave')?.classList.remove('pulse');
  $('calendarLunar').value=calendarData?.lunar||'auto';$('calendarWeek').value=calendarData?.weekStart||'auto';$('calendarPageSeconds').value=calendarData?.pageSeconds||5;calRenderList();calRenderToday();}
async function calRefresh(force=false){try{calendarData=await api('/api/calendar');if(force||!calendarDirty)calLoadDraft();else calRenderToday();}catch(e){if(force)toast(e.message,true);}}
async function calSave(event){
  event?.preventDefault();
  for(const e of calendarDraft)if(!e.name.trim()){toast(t('calendar.needName'),true);return;}
  $('calendarSave').disabled=true;
  try{calendarData=await api('/api/calendar',{lunar:$('calendarLunar').value,weekStart:$('calendarWeek').value,pageSeconds:Math.min(30,Math.max(2,Number($('calendarPageSeconds').value)||5)),events:calendarDraft.map(({name,year,month,day,repeat,lunar,leap,remind})=>({name:name.trim(),year,month,day,repeat,lunar,leap:!!leap,remind}))});calLoadDraft();toast(t('app.saved'));}
  catch(e){toast(e.message,true);}finally{$('calendarSave').disabled=false;}
}
async function calendarInit(){
  if(!$('calendarForm'))return;
  $('calendarForm').onsubmit=calSave;
  const fill=(id,keys,prefix)=>{const s=$(id);s.replaceChildren();keys.forEach(k=>s.add(new Option(t(prefix+k),k)));s.onchange=calTouched;};
  const labels=()=>{const lunar=$('calendarLunar').value,week=$('calendarWeek').value;fill('calendarLunar',CAL_LUNAR,'calendar.lunar.');fill('calendarWeek',CAL_WEEK,'calendar.week.');$('calendarLunar').value=lunar||'auto';$('calendarWeek').value=week||'auto';};
  labels();
  $('calendarAdd').onclick=()=>{const max=calendarData?.max||30;if(calendarDraft.length>=max)return;const today=(calendarData?.today||'2026-01-01').split('-').map(Number);calendarDraft.push({name:'',year:today[0],month:today[1],day:today[2],repeat:'yearly',lunar:false,leap:false,remind:-1,orig:-1});calTouched();calRenderList();$('calendarRows').lastElementChild?.querySelector('input')?.focus();};
  languageHooks.push(()=>{labels();calRenderList();calRenderToday();});
  await calRefresh(true);
  await feedInit();
  setInterval(()=>{if(active==='calendar'&&!document.hidden)calRefresh();},60000);
}
// ---- Subscribed calendars (iCalendar / webcal) ----
let feedData=null,feedDraft=[],feedDirty=false;
function feedTouched(){feedDirty=true;$('feedSave').classList.add('pulse');}
// Feed errors as the device stores them (English) in calendar words; the raw text stays
// in parentheses for diagnosis.
const FEED_ERRORS=[[/^(Low memory|Insufficient)/,'feed.errMemory'],[/^TLS -0x(7F00|3F80|2880|0010|4D80|6180|5180)/,'feed.errMemory'],[/^TLS -0x/,'feed.errSecure'],[/^(Connect failed|HTTP -)/,'feed.errConnect'],[/timeout/i,'feed.errTimeout'],[/^HTTP \d/,'feed.errHttp'],[/Not an iCalendar/,'feed.errFormat'],[/redirect/i,'feed.errRedirect']];
function feedError(message){const rule=FEED_ERRORS.find(([pattern])=>pattern.test(message));return rule?t(rule[1])+' ('+message+')':localError(message);}
function feedStatus(f){
  if(f.orig<0||feedDirty)return {text:t('feed.unsaved'),bad:false};
  if(!f.enabled)return {text:t('feed.disabled'),bad:false};
  if(!f.valid&&!f.error)return {text:t('feed.waiting'),bad:false};
  let text=f.valid?t('feed.loaded').replace('{n}',f.count).replace('{t}',new Date(f.fetched*1000).toLocaleString()):'';
  if(f.seen>f.count)text+=' '+t('feed.limited').replace('{n}',f.seen);
  if(f.truncated)text+=' '+t('feed.truncated');
  if(!f.ok&&f.error)text=(text?text+' · ':'')+feedError(f.error);
  if(f.zone&&f.zoneDiffers&&!f.floating)text+=' · '+t('feed.zoneDiffers').replace('{zone}',f.zone);
  return {text,bad:!f.ok&&!!f.error};
}
function feedRender(){
  const root=$('feedRows');if(!root)return;root.replaceChildren();
  const max=feedData?.max||3;$('feedAdd').disabled=feedDraft.length>=max;$('feedCount').textContent=feedDraft.length+' / '+max;
  feedDraft.forEach((f,index)=>{
    const row=document.createElement('div');row.className='alarm-row calendar-row';
    const head=document.createElement('div');head.className='alarm-head';
    const on=document.createElement('input');on.type='checkbox';on.checked=f.enabled!==false;on.setAttribute('aria-label',t('feed.enabled'));on.onchange=()=>{f.enabled=on.checked;feedTouched();};
    const name=document.createElement('input');name.className='alarm-label';name.maxLength=31;name.value=f.name;name.placeholder=t('feed.name');name.setAttribute('aria-label',t('feed.name'));name.oninput=()=>{f.name=name.value;feedTouched();};
    const actions=document.createElement('div');actions.className='row-actions';
    actions.append(action('calendar.remove','✕',()=>{feedDraft.splice(index,1);feedTouched();feedRender();}));
    head.append(on,name,actions);
    const url=document.createElement('input');url.className='feed-url';url.type='url';url.maxLength=399;url.value=f.url;url.placeholder='webcal://… / https://….ics';url.setAttribute('aria-label',t('feed.url'));url.spellcheck=false;url.oninput=()=>{f.url=url.value.trim();feedTouched();};
    const floating=document.createElement('label');floating.className='check-line compact';const box=document.createElement('input');box.type='checkbox';box.checked=!!f.floating;box.onchange=()=>{f.floating=box.checked;feedTouched();};floating.append(box,document.createTextNode(t('feed.floating')));
    const status=document.createElement('p');const s=feedStatus(f);status.className='feed-status'+(s.bad?' bad':'');status.textContent=s.text;
    row.append(head,url,floating,status);root.append(row);
  });
  const list=$('feedEvents');list.replaceChildren();
  const events=feedData?.events||[];
  if(!events.length){const p=document.createElement('p');p.className='hint';p.textContent=t('feed.none');list.append(p);}
  for(const e of events.slice(0,12)){
    const item=document.createElement('div');item.className='feed-event';
    const when=document.createElement('time');when.textContent=e.date+(e.minute>=0?' '+calPad(Math.floor(e.minute/60))+':'+calPad(e.minute%60):'')+(e.span>1?' +'+(e.span-1)+t('feed.days'):'');
    const what=document.createElement('span');what.textContent=e.summary+(feedData.feeds.length>1?' · '+(feedData.feeds[e.feed]?.name||''):'');what.title=what.textContent;
    item.append(when,what);list.append(item);
  }
}
function feedLoad(){feedDraft=(feedData?.feeds||[]).map((f,i)=>({...f,orig:i}));feedDirty=false;$('feedSave')?.classList.remove('pulse');
  const hours=$('feedHours');hours.replaceChildren();[1,3,6,12,24].forEach(h=>hours.add(new Option(h+' '+t('unit.h'),h)));hours.value=String(feedData?.hours||6);feedRender();}
async function feedRefresh(force=false){try{feedData=await api('/api/calendar/feeds');if(force||!feedDirty)feedLoad();else feedRender();}catch(e){if(force)toast(e.message,true);}}
async function feedSave(event){
  event?.preventDefault();
  for(const f of feedDraft)if(!/^(webcals?|https?):\/\/.{4,}/i.test(f.url)){toast(t('feed.badUrl'),true);return;}
  $('feedSave').disabled=true;
  try{feedData=await api('/api/calendar/feeds',{hours:Number($('feedHours').value),feeds:feedDraft.map(({name,url,enabled,floating})=>({name:name.trim(),url,enabled:enabled!==false,floating:!!floating}))});feedLoad();toast(t('feed.saved'));}
  catch(e){toast(e.message,true);}finally{$('feedSave').disabled=false;}
}
async function feedInit(){
  if(!$('feedForm'))return;
  $('feedForm').onsubmit=feedSave;
  $('feedHours').onchange=feedTouched;
  $('feedAdd').onclick=()=>{if(feedDraft.length>=(feedData?.max||3))return;feedDraft.push({name:'',url:'',enabled:true,floating:false,orig:-1});feedTouched();feedRender();$('feedRows').lastElementChild?.querySelector('.alarm-label')?.focus();};
  $('feedRefresh').onclick=async()=>{try{feedData=await api('/api/calendar/feeds/refresh',{});toast(t('feed.refreshing'));feedRender();}catch(e){toast(e.message,true);}};
  languageHooks.push(()=>{feedLoad();});
  await feedRefresh(true);
  setInterval(()=>{if(active==='calendar'&&!document.hidden)feedRefresh();},15000);
}
