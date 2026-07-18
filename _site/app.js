'use strict';
/* app.js — DOM orchestration. Pure logic lives in model.js, storage
   in storage.js; this file owns state, rendering and events. */
const APP_VERSION = 'v1.0.0'; /* bump with sw.js CACHE on every deploy */
let reloadPending = false; /* set when a deployed update wants to reload while a sheet is open */

let state = load();
let editingId = null;
let editKind = 'single';
let editColor = COLORS[0];
let editPinned = false;
let tab = 'counter';
let searchQ = '';
let lastDeleted = null; /* { event, orderIdx } for undo */

function persist() { if (!save(state)) toast('Could not save — storage full?'); }

function currentPattern(){
  const f = state.settings.dateFmt;
  return f === 'CUSTOM' ? (state.settings.dateFmtCustom || 'd.m.Y') : f;
}
function fmtDate(s){ return fmtTokens(s, currentPattern()); }

/* ---------- render ---------- */
const listEl = document.getElementById('list');

function sortEvents(evs){
  const s = state.sort;
  const arr = [...evs];
  let sorted;
  if(tab === 'yearly'){
    const t = todayStr();
    sorted = arr.sort((a,b)=>nextOccurrence(a.date,t).daysUntil - nextOccurrence(b.date,t).daysUntil);
  }else if(s === 'custom'){
    const pos = new Map(state.order.map((id,i)=>[id,i]));
    sorted = arr.sort((a,b)=>{
      const pa = pos.has(a.id)?pos.get(a.id):1e9+a.added;
      const pb = pos.has(b.id)?pos.get(b.id):1e9+b.added;
      return pa-pb;
    });
  }else{
    const cmp = {
      title_asc:(a,b)=>a.title.localeCompare(b.title,'nb'),
      title_desc:(a,b)=>b.title.localeCompare(a.title,'nb'),
      date_asc:(a,b)=>a.date.localeCompare(b.date),
      date_desc:(a,b)=>b.date.localeCompare(a.date),
      dur_desc:(a,b)=>evDuration(b)-evDuration(a),
      dur_asc:(a,b)=>evDuration(a)-evDuration(b),
      added_asc:(a,b)=>a.added-b.added,
      added_desc:(a,b)=>b.added-a.added,
    }[s] || ((a,b)=>b.added-a.added);
    sorted = arr.sort(cmp);
  }
  /* pinned first, stable */
  return [...sorted.filter(e=>e.pinned), ...sorted.filter(e=>!e.pinned)];
}
function esc(t){
  const div = document.createElement('div');
  div.textContent = t;
  return div.innerHTML;
}
const PIN_SVG = `<svg class="pin-ico" viewBox="0 0 24 24" fill="currentColor"><path d="M16 3l5 5-6 2-3 6-3-3-6 6-1-1 6-6-3-3 6-3z"/></svg>`;

function countHTML(fromS, toS, dirLabel, units){
  const parts = breakdown(fromS, toS, units);
  const head = parts[0], rest = parts.slice(1);
  const restHtml = rest.length ? `<div class="rest">${rest.map(p=>p.v+' '+p.u).join(' ')}</div>` : '';
  return `<div class="count">
    <div class="dir">${dirLabel}</div>
    <div class="n${rest.length?' multi':''}">${head.v}</div>
    <div class="unit">${unitWord(head.u, head.v)}</div>
    ${restHtml}</div>`;
}
function statHTML(fromS, toS, label, cls, units){
  const parts = breakdown(fromS, toS, units);
  const only = isDaysOnly(units);
  const val = only ? String(parts[0].v) : compact(parts);
  return `<div class="stat ${cls}"><div class="n${only?'':' multi'}">${val}</div><div class="l">${label}</div></div>`;
}

function cardHTML(ev){
  const today = todayStr();
  const color = ev.color || COLORS[2];
  const tint = tintOf(color, state.settings.theme === 'light'), shade = shadeOf(color, state.settings.theme === 'light');
  const style = `--spine:${color};--tint:${tint};--shade:${shade}`;
  const descHtml = ev.desc ? `<div class="desc">${esc(ev.desc)}</div>` : '';
  const pinHtml = ev.pinned ? PIN_SVG : '';

  if(ev.kind === 'yearly'){
    const occ = nextOccurrence(ev.date, today);
    const isToday = occ.daysUntil === 0;
    const big = isToday
      ? `<div class="count"><div class="dir">Today</div><div class="n">🎉</div><div class="unit">turns ${occ.turns}</div></div>`
      : `<div class="count"><div class="dir">Until</div><div class="n">${occ.daysUntil}</div><div class="unit">${unitWord('d',occ.daysUntil)}</div></div>`;
    return `<div class="card" data-id="${ev.id}" style="${style}">${pinHtml}
      <div class="row"><div>
        <div class="title">${esc(ev.title)}</div>
        <div class="date">${fmtDate(ev.date)}</div>
        <div class="turns">${isToday ? 'turns '+occ.turns+' today' : 'turns '+occ.turns+' on '+fmtDate(occ.next)}</div>
        ${descHtml}
      </div>${big}</div></div>`;
  }

  if(ev.kind === 'range'){
    const sinceStart = daysBetween(ev.date, today);
    const gradCls = (ev.end && state.settings.gradient) ? ' grad' : '';
    if(!ev.end){
      const future = sinceStart < 0;
      const badge = future
        ? `<div class="badge"><span class="dot"></span>Starts in ${-sinceStart} days</div>`
        : `<div class="badge"><span class="dot"></span>Ongoing · day ${sinceStart}</div>`;
      return `<div class="card${gradCls}" data-id="${ev.id}" style="${style}">${pinHtml}
        <div class="row"><div>
          <div class="title">${esc(ev.title)}</div>
          <div class="date">${fmtDate(ev.date)} <span class="arrow">→</span> …</div>
          ${descHtml}${badge}
        </div>
        ${countHTML(ev.date, today, future?'Until start':'Running', ev.units)}
        </div></div>`;
    }
    const sinceEnd = daysBetween(ev.end, today);
    return `<div class="card${gradCls}" data-id="${ev.id}" style="${style}">${pinHtml}
      <div class="row"><div>
        <div class="title">${esc(ev.title)}</div>
        <div class="date">${fmtDate(ev.date)} <span class="arrow">→</span> ${fmtDate(ev.end)}</div>
        ${descHtml}
      </div></div>
      <div class="stats">
        ${statHTML(ev.date, ev.end, 'Duration', 'dur', ev.units)}
        ${statHTML(ev.date, today, sinceStart<0?'Until start':'Since start', 's1', ev.units)}
        ${statHTML(ev.end, today, sinceEnd<0?'Until end':'Since end', 's2', ev.units)}
      </div></div>`;
  }

  const diff = daysBetween(ev.date, today);
  return `<div class="card" data-id="${ev.id}" style="${style}">${pinHtml}
    <div class="row"><div>
      <div class="title">${esc(ev.title)}</div>
      <div class="date">${fmtDate(ev.date)}</div>
      ${descHtml}
    </div>
    ${countHTML(ev.date, today, diff>=0?'Passed':'Until', ev.units)}
    </div></div>`;
}

function visibleEvents(){
  let evs = state.events.filter(e => (tab==='yearly') === (e.kind==='yearly'));
  if(searchQ){
    const q = searchQ.toLowerCase();
    evs = evs.filter(e => e.title.toLowerCase().includes(q) || (e.desc||'').toLowerCase().includes(q));
  }
  return evs;
}
function render(){
  const evs = visibleEvents();
  if(evs.length === 0){
    const msg = searchQ
      ? `No matches for "<b>${esc(searchQ)}</b>".`
      : (tab === 'yearly'
        ? `No yearly events yet.<br>Tap <b>+</b> to add a birthday or anniversary.`
        : `No events yet.<br>Tap <b>+</b> to add one, or import your old<br>Days Counter backup in <b>Settings</b>.`);
    listEl.innerHTML = `<div class="empty">${msg}</div>`;
    return;
  }
  listEl.innerHTML = sortEvents(evs).map(cardHTML).join('');
}

/* tap to edit */
let suppressClick = false;
listEl.addEventListener('click', e=>{
  if(suppressClick){ suppressClick = false; return; }
  const card = e.target.closest('.card');
  if(card) openEdit(Number(card.dataset.id));
});

/* ---------- tabs ---------- */
function setTab(t){
  tab = t;
  document.getElementById('tabCounter').classList.toggle('on', t==='counter');
  document.getElementById('tabYearly').classList.toggle('on', t==='yearly');
  render();
}
document.getElementById('tabCounter').addEventListener('click', ()=>setTab('counter'));
document.getElementById('tabYearly').addEventListener('click', ()=>setTab('yearly'));

/* ---------- search ---------- */
const searchbar = document.getElementById('searchbar');
const searchInput = document.getElementById('searchInput');
document.getElementById('searchBtn').addEventListener('click', ()=>{
  const open = searchbar.classList.toggle('open');
  if(open) searchInput.focus();
  else { searchInput.value=''; searchQ=''; render(); }
});
searchInput.addEventListener('input', ()=>{ searchQ = searchInput.value.trim(); render(); });

/* ---------- slide panels: EDGE swipe; mid-screen swipe = tab switch ---------- */
const content = document.getElementById('content');
const panelLeft = document.getElementById('panelLeft');
const panelRight = document.getElementById('panelRight');
const PANEL_W = Math.min(300, window.innerWidth * 0.82);
const EDGE = 28;
let panelState = 0;

function setPanel(p){
  panelState = p;
  content.classList.remove('dragging');
  content.style.transform = 'translateX(' + (p*PANEL_W) + 'px)';
  content.classList.toggle('shifted', p!==0);
  panelLeft.classList.toggle('show', p===1);
  panelRight.classList.toggle('show', p===-1);
}
document.getElementById('scrim').addEventListener('click', ()=>setPanel(0));
document.getElementById('sortBtn').addEventListener('click', ()=>{ syncSortUI(); setPanel(1); });
document.getElementById('settingsBtn').addEventListener('click', ()=>setPanel(-1));

let swX=0, swY=0, swActive=false, swIntent=null, swBase=0, swMode=null;
content.addEventListener('touchstart', e=>{
  if(dragEv) return;
  const x = e.touches[0].clientX;
  swX = x; swY = e.touches[0].clientY;
  swActive = true; swIntent = null; swBase = panelState*PANEL_W;
  /* if a panel is open, any swipe manipulates the panel; otherwise edges = panel, middle = tab */
  swMode = (panelState!==0 || x < EDGE || x > window.innerWidth-EDGE) ? 'panel' : 'tab';
}, {passive:true});
content.addEventListener('touchmove', e=>{
  if(!swActive || dragEv) return;
  const dx = e.touches[0].clientX - swX;
  const dy = e.touches[0].clientY - swY;
  if(swIntent === null){
    if(Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy)+6) swIntent='h';
    else if(Math.abs(dy) > 12) swIntent='v';
  }
  if(swIntent !== 'h') return;
  if(swMode === 'panel'){
    e.preventDefault();
    let x = Math.max(-PANEL_W, Math.min(PANEL_W, swBase+dx));
    content.classList.add('dragging');
    content.style.transform = 'translateX('+x+'px)';
    panelLeft.classList.toggle('show', x>0);
    panelRight.classList.toggle('show', x<0);
  }
}, {passive:false});
content.addEventListener('touchend', e=>{
  if(!swActive) return;
  swActive = false;
  if(swIntent !== 'h') return;
  const dx = e.changedTouches[0].clientX - swX;
  if(swMode === 'panel'){
    const x = Math.max(-PANEL_W, Math.min(PANEL_W, swBase+dx));
    if(x > PANEL_W*0.4){ syncSortUI(); setPanel(1); }
    else if(x < -PANEL_W*0.4) setPanel(-1);
    else setPanel(0);
  }else if(Math.abs(dx) > 60){
    setTab(dx < 0 ? 'yearly' : 'counter');
  }
});

/* ---------- sort panel ---------- */
function syncSortUI(){
  document.querySelectorAll('#panelLeft .menu-item').forEach(b=>{
    b.classList.toggle('sel', b.dataset.sort === state.sort);
  });
}
document.querySelectorAll('#panelLeft .menu-item').forEach(b=>{
  b.addEventListener('click', ()=>{
    state.sort = b.dataset.sort;
    if(state.sort==='custom' && state.order.length===0){
      state.order = sortEvents(state.events.filter(e=>e.kind!=='yearly')).map(e=>e.id);
    }
    persist(); render(); syncSortUI(); setPanel(0);
  });
});

/* ---------- settings ---------- */
function applySettings(){
  document.body.classList.toggle('light', state.settings.theme==='light');
  document.body.classList.toggle('brutal', !!state.settings.brutal);
  document.getElementById('tglTheme').classList.toggle('on', state.settings.theme==='light');
  document.getElementById('tglBrutal').classList.toggle('on', !!state.settings.brutal);
  document.getElementById('tglGrad').classList.toggle('on', !!state.settings.gradient);
  const sel = document.getElementById('fmtSel');
  sel.value = ['d.m.Y','m/d/Y','Y-m-d','j M Y'].includes(state.settings.dateFmt) ? state.settings.dateFmt : 'CUSTOM';
  document.getElementById('fmtCustomWrap').style.display = sel.value==='CUSTOM' ? '' : 'none';
  document.getElementById('fmtCustom').value = state.settings.dateFmtCustom || '';
  updateFmtPreview();
  const meta = document.querySelector('meta[name=theme-color]');
  if(meta) meta.content = state.settings.theme==='light' ? '#f1f0f3' : '#101014';
}
function updateFmtPreview(){
  const p = document.getElementById('fmtPreview');
  try{ p.textContent = 'Preview: ' + fmtTokens(todayStr(), state.settings.dateFmtCustom || 'd.m.Y'); }
  catch(e){ p.textContent = 'Invalid pattern'; }
}
function bindToggle(id, fn){
  const el = document.getElementById(id);
  const h = ()=>{ fn(); applySettings(); persist(); render(); };
  el.addEventListener('click', h);
  el.addEventListener('keydown', e=>{ if(e.key===' '||e.key==='Enter'){ e.preventDefault(); h(); } });
}
bindToggle('tglTheme', ()=>{ state.settings.theme = state.settings.theme==='light'?'dark':'light'; });
bindToggle('tglBrutal', ()=>{ state.settings.brutal = !state.settings.brutal; });
bindToggle('tglGrad', ()=>{ state.settings.gradient = !state.settings.gradient; });
document.getElementById('fmtSel').addEventListener('change', e=>{
  if(e.target.value === 'CUSTOM'){
    state.settings.dateFmt = 'CUSTOM';
    document.getElementById('fmtCustomWrap').style.display = '';
  }else{
    state.settings.dateFmt = e.target.value;
    document.getElementById('fmtCustomWrap').style.display = 'none';
  }
  persist(); render();
});
document.getElementById('fmtCustom').addEventListener('input', e=>{
  state.settings.dateFmtCustom = e.target.value;
  updateFmtPreview();
  persist(); render();
});

/* ---------- drag & drop (long-press, counters tab only) ---------- */
let dragEv=null, holdTimer=null, dragCand=null, dragCandY=0;
listEl.addEventListener('touchstart', e=>{
  /* no drag while a search filter is active — reordering a filtered list would persist the subset as the whole custom order */
  if(tab==='yearly' || searchQ) return;
  const card = e.target.closest('.card');
  if(!card) return;
  dragCand=card; dragCandY=e.touches[0].clientY;
  holdTimer=setTimeout(()=>{
    dragEv=dragCand; dragEv.classList.add('lifted');
    if(navigator.vibrate) navigator.vibrate(15);
  },350);
},{passive:true});
listEl.addEventListener('touchmove', e=>{
  const y=e.touches[0].clientY;
  if(!dragEv){
    if(holdTimer && Math.abs(y-dragCandY)>10){ clearTimeout(holdTimer); holdTimer=null; }
    return;
  }
  e.preventDefault();
  reorderAt(y);
},{passive:false});
function reorderAt(y){
  const cards=[...listEl.querySelectorAll('.card')];
  for(const c of cards){
    if(c===dragEv) continue;
    const r=c.getBoundingClientRect();
    const mid=r.top+r.height/2;
    const dr=dragEv.getBoundingClientRect();
    if(y<mid && dr.top>r.top){ listEl.insertBefore(dragEv,c); break; }
    if(y>mid && dr.top<r.top){ listEl.insertBefore(dragEv,c.nextSibling); break; }
  }
}
function endDrag(){
  clearTimeout(holdTimer); holdTimer=null;
  if(!dragEv) return;
  dragEv.classList.remove('lifted');
  dragEv=null;
  suppressClick=true;
  /* persist visible order for counters; keep yearly ids out */
  const visIds=[...listEl.querySelectorAll('.card')].map(c=>Number(c.dataset.id));
  state.order = visIds;
  if(state.sort!=='custom'){ state.sort='custom'; toast('Custom order'); }
  persist(); syncSortUI();
}
listEl.addEventListener('touchend', endDrag);
listEl.addEventListener('touchcancel', endDrag);
listEl.addEventListener('mousedown', e=>{
  if(tab==='yearly' || searchQ) return;
  const card=e.target.closest('.card');
  if(!card) return;
  dragCand=card; dragCandY=e.clientY;
  holdTimer=setTimeout(()=>{ dragEv=dragCand; dragEv.classList.add('lifted'); },350);
  const mm=ev=>{
    if(!dragEv){
      if(holdTimer && Math.abs(ev.clientY-dragCandY)>10){ clearTimeout(holdTimer); holdTimer=null; }
      return;
    }
    ev.preventDefault(); reorderAt(ev.clientY);
  };
  const mu=()=>{ document.removeEventListener('mousemove',mm); document.removeEventListener('mouseup',mu); endDrag(); };
  document.addEventListener('mousemove',mm);
  document.addEventListener('mouseup',mu);
});

/* ---------- FAB ---------- */
const fab=document.getElementById('fabBtn');
let lastScroll=window.scrollY;
window.addEventListener('scroll', ()=>{
  const y=window.scrollY;
  if(y>lastScroll+6 && y>60) fab.classList.add('hide');
  else if(y<lastScroll-6) fab.classList.remove('hide');
  lastScroll=y;
},{passive:true});

/* ---------- overlays ---------- */
const overlays=document.querySelectorAll('.overlay');
function openOv(id){ document.getElementById(id).classList.add('open'); }
function closeOv(id){ document.getElementById(id).classList.remove('open'); maybeDeferredReload(); }
overlays.forEach(ov=>{
  ov.addEventListener('click', e=>{ if(e.target===ov){ ov.classList.remove('open'); maybeDeferredReload(); } });
});
document.addEventListener('keydown', e=>{
  if(e.key==='Escape'){ overlays.forEach(ov=>ov.classList.remove('open')); setPanel(0); maybeDeferredReload(); }
});

/* ---------- add / edit ---------- */
const fTitle=document.getElementById('fTitle');
const fDate=document.getElementById('fDate');
const fEnd=document.getElementById('fEnd');
const fDesc=document.getElementById('fDesc');
const fEndWrap=document.getElementById('fEndWrap');
const kindHint=document.getElementById('kindHint');
const fDateLbl=document.getElementById('fDateLbl');
const unitsField=document.getElementById('unitsField');
const swWrap=document.getElementById('swatches');
const tglPin=document.getElementById('tglPin');

function buildSwatches(){
  swWrap.innerHTML = COLORS.map(c=>
    `<button type="button" class="sw${c===editColor?' on':''}" data-c="${c}" style="--sw:${c}" aria-label="Color ${c}"></button>`
  ).join('');
}
swWrap.addEventListener('click', e=>{
  const b=e.target.closest('.sw');
  if(!b) return;
  editColor=b.dataset.c;
  buildSwatches();
});
tglPin.addEventListener('click', ()=>{ editPinned=!editPinned; tglPin.classList.toggle('on', editPinned); });
tglPin.addEventListener('keydown', e=>{
  if(e.key===' '||e.key==='Enter'){ e.preventDefault(); editPinned=!editPinned; tglPin.classList.toggle('on', editPinned); }
});
function setKind(k){
  editKind=k;
  document.querySelectorAll('#editOv .seg button').forEach(b=>b.classList.toggle('on', b.dataset.kind===k));
  fEndWrap.style.display = k==='range' ? '' : 'none';
  unitsField.style.display = k==='yearly' ? 'none' : '';
  fDateLbl.textContent = k==='range' ? 'Start date' : (k==='yearly' ? 'Original date' : 'Date');
  if(k==='range'){ kindHint.textContent='Leave end date empty for an ongoing period.'; kindHint.style.display=''; }
  else if(k==='yearly'){ kindHint.textContent='Repeats every year — e.g. a birthday or anniversary.'; kindHint.style.display=''; }
  else kindHint.style.display='none';
}
document.querySelectorAll('#editOv .seg button').forEach(b=>{
  b.addEventListener('click', ()=>setKind(b.dataset.kind));
});
function getEditUnits(){
  const u={};
  document.querySelectorAll('#unitsField [data-u]').forEach(ch=>u[ch.dataset.u]=ch.checked);
  if(!u.y && !u.m && !u.w && !u.d) u.d=true;
  return u;
}
function setEditUnits(u){
  const units = u || DEFAULT_UNITS;
  document.querySelectorAll('#unitsField [data-u]').forEach(ch=>ch.checked=!!units[ch.dataset.u]);
}
function openEdit(id){
  editingId=id;
  const ev = id!=null ? state.events.find(x=>x.id===id) : null;
  document.getElementById('editTitle').textContent = ev ? 'Edit event' : 'New event';
  document.getElementById('deleteBtn').style.display = ev ? '' : 'none';
  fTitle.value = ev ? ev.title : '';
  fDate.value = ev ? ev.date : todayStr();
  fEnd.value = (ev && ev.end) ? ev.end : '';
  fDesc.value = ev ? (ev.desc||'') : '';
  editColor = ev ? (ev.color || COLORS[0]) : pickDefaultColor(state.events.length);
  editPinned = ev ? !!ev.pinned : false;
  tglPin.classList.toggle('on', editPinned);
  setEditUnits(ev ? ev.units : null);
  setKind(ev ? ev.kind : (tab==='yearly' ? 'yearly' : 'single'));
  buildSwatches();
  openOv('editOv');
  if(!ev) setTimeout(()=>fTitle.focus(),60);
}
fab.addEventListener('click', ()=>openEdit(null));
document.getElementById('cancelBtn').addEventListener('click', ()=>closeOv('editOv'));
document.getElementById('saveBtn').addEventListener('click', ()=>{
  const title=fTitle.value.trim();
  if(!title){ toast('Title is required'); fTitle.focus(); return; }
  if(!fDate.value){ toast('Date is required'); fDate.focus(); return; }
  let end=null;
  if(editKind==='range' && fEnd.value){
    end=fEnd.value;
    if(end<fDate.value){ toast('End date is before start date'); return; }
  }
  const units = editKind==='yearly' ? null : getEditUnits();
  if(editingId!=null){
    const ev=state.events.find(x=>x.id===editingId);
    if(ev){
      ev.title=title; ev.date=fDate.value; ev.desc=fDesc.value.trim();
      ev.kind=editKind; ev.end=editKind==='range'?end:null;
      ev.color=editColor; ev.pinned=editPinned; ev.units=units;
    }
  }else{
    const nid=nextId();
    state.events.push({
      id:nid, title, desc:fDesc.value.trim(),
      date:fDate.value, end:editKind==='range'?end:null,
      kind:editKind, units, pinned:editPinned,
      color:editColor, added:Date.now()
    });
    if(state.sort==='custom' && editKind!=='yearly') state.order.push(nid);
  }
  persist(); render(); closeOv('editOv');
});
function nextId(){ return state.events.reduce((m,e)=>Math.max(m,e.id),0)+1; }

/* ---------- delete with undo ---------- */
document.getElementById('deleteBtn').addEventListener('click', ()=>{
  const ev=state.events.find(x=>x.id===editingId);
  if(!ev) return;
  lastDeleted={ event:ev, orderIdx:state.order.indexOf(ev.id) };
  state.events=state.events.filter(x=>x.id!==ev.id);
  state.order=state.order.filter(id=>id!==ev.id);
  persist(); render(); closeOv('editOv');
  toast('Deleted "'+ev.title+'"', 'Undo', ()=>{
    if(!lastDeleted) return;
    state.events.push(lastDeleted.event);
    if(lastDeleted.orderIdx>=0) state.order.splice(lastDeleted.orderIdx,0,lastDeleted.event.id);
    lastDeleted=null;
    persist(); render();
  });
});

/* ---------- delete all (double confirm) ---------- */
const wipeInput=document.getElementById('wipeInput');
const wipeConfirmBtn=document.getElementById('wipe2Confirm');
document.getElementById('wipeBtn').addEventListener('click', ()=>{
  const n=state.events.length;
  if(n===0){ toast('Nothing to delete'); return; }
  document.getElementById('wipeCount').textContent = n+' event'+(n>1?'s':'');
  setPanel(0); openOv('wipe1Ov');
});
document.getElementById('wipe1Cancel').addEventListener('click', ()=>closeOv('wipe1Ov'));
document.getElementById('wipe1Next').addEventListener('click', ()=>{
  /* open step-2 before closing step-1 — a deferred update reload must never find a no-overlay gap mid-confirm */
  wipeInput.value=''; wipeConfirmBtn.disabled=true; wipeConfirmBtn.style.opacity=.4;
  openOv('wipe2Ov');
  closeOv('wipe1Ov');
});
wipeInput.addEventListener('input', ()=>{
  const ok=wipeInput.value.trim().toUpperCase()==='DELETE';
  wipeConfirmBtn.disabled=!ok;
  wipeConfirmBtn.style.opacity=ok?1:.4;
});
document.getElementById('wipe2Cancel').addEventListener('click', ()=>closeOv('wipe2Ov'));
wipeConfirmBtn.addEventListener('click', ()=>{
  if(wipeInput.value.trim().toUpperCase()!=='DELETE') return;
  state.events=[]; state.order=[];
  persist(); render(); closeOv('wipe2Ov');
  toast('All events deleted');
});

/* ---------- export / import ---------- */
document.getElementById('exportBtn').addEventListener('click', () => {
	const blob = new Blob(
		[JSON.stringify(buildExport(state, new Date().toISOString()), null, 2)],
		{ type: 'application/json' });
	const a = document.createElement('a');
	a.href = URL.createObjectURL(blob);
	a.download = 'elapsum-backup-' + todayStr() + '.json';
	a.click();
	URL.revokeObjectURL(a.href);
});

document.getElementById('importBtn').addEventListener('click', () => document.getElementById('importFile').click());
document.getElementById('importFile').addEventListener('change', e => {
	const file = e.target.files[0];
	e.target.value = '';
	if (!file) return;
	const reader = new FileReader();
	reader.onload = () => {
		const r = parseImport(reader.result, state.events);
		if (!r.ok) { toast(r.error); return; }
		if (r.dupes.length) { openDupSheet(r); return; }
		appendImported(r.imported);
	};
	reader.onerror = () => toast('Could not read file');
	reader.readAsText(file);
});

/* Appending assigns fresh ids HERE (not in the parser) so they are
   unique against whatever is in state right now. */
function appendImported(events) {
	let id = nextId();
	events.forEach(ev => {
		ev.id = id++;
		state.events.push(ev);
		if (state.sort === 'custom' && ev.kind !== 'yearly') state.order.push(ev.id);
	});
	persist(); render(); setPanel(0); closeOv('dupOv');
	toast('Imported ' + events.length + ' event' + (events.length === 1 ? '' : 's'));
}

/* Duplicate confirm sheet: same title+date already exists. */
let pendingImport = null;
function openDupSheet(r) {
	pendingImport = r;
	document.getElementById('dupInfo').textContent =
		r.dupes.length + ' of ' + r.imported.length +
		' events already exist (same title and date). Import them anyway?';
	document.getElementById('dupList').innerHTML = r.dupes.map(d =>
		`<div class="pair"><div><div class="pname">${esc(d.title)}</div>
		<div class="pdates">${fmtDate(d.date)}</div></div></div>`).join('');
	setPanel(0); openOv('dupOv');
}
document.getElementById('dupCancel').addEventListener('click', () => { pendingImport = null; closeOv('dupOv'); });
document.getElementById('dupAll').addEventListener('click', () => {
	if (pendingImport) appendImported(pendingImport.imported);
	pendingImport = null;
});
document.getElementById('dupSkip').addEventListener('click', () => {
	if (pendingImport) {
		const dup = new Set(pendingImport.dupes.map(dupeKey));
		const fresh = pendingImport.imported.filter(ev => !dup.has(dupeKey(ev)));
		if (fresh.length) appendImported(fresh);
		else { closeOv('dupOv'); toast('Nothing new to import'); }
	}
	pendingImport = null;
});

/* The shared scrim-click / Escape handlers close #dupOv without going
   through the three buttons — drop the pending payload then too, so
   the sheet's state machine never depends on the overlay CSS alone. */
document.getElementById('dupOv').addEventListener('click', e => {
	if (e.target.id === 'dupOv') pendingImport = null;
});
document.addEventListener('keydown', e => {
	if (e.key === 'Escape') pendingImport = null;
});

/* ---------- merge Start/End pairs ---------- */
let mergePairs=[];
document.getElementById('mergeBtn').addEventListener('click', ()=>{
  mergePairs = detectPairs(state.events);
  const info=document.getElementById('mergeInfo');
  const list=document.getElementById('mergeList');
  if(mergePairs.length===0){
    info.textContent='No "X Start" + "X End" pairs found among single events.';
    list.innerHTML='';
    document.getElementById('mergeConfirm').style.display='none';
  }else{
    info.textContent='Found '+mergePairs.length+' pair'+(mergePairs.length>1?'s':'')+
      '. Each becomes one period; the two originals are removed.';
    document.getElementById('mergeConfirm').style.display='';
    list.innerHTML=mergePairs.map((p,i)=>`
      <label class="pair">
        <input type="checkbox" data-i="${i}" checked>
        <div><div class="pname">${esc(p.base)}</div>
        <div class="pdates">${fmtDate(p.start.date)} → ${fmtDate(p.end.date)}
        (${daysBetween(p.start.date,p.end.date)} days)</div></div>
      </label>`).join('');
  }
  setPanel(0); openOv('mergeOv');
});
document.getElementById('mergeCancel').addEventListener('click', ()=>closeOv('mergeOv'));
document.getElementById('mergeConfirm').addEventListener('click', ()=>{
  const checks=document.querySelectorAll('#mergeList input:checked');
  let count=0;
  checks.forEach(ch=>{
    const p=mergePairs[Number(ch.dataset.i)];
    if(!p || p.end.date<p.start.date) return;
    state.events.push({
      id:nextId(), title:p.base,
      desc:[p.start.desc,p.end.desc].filter(Boolean).join(' / '),
      date:p.start.date, end:p.end.date, kind:'range',
      units:null, pinned:false,
      color:p.start.color||COLORS[0],
      added:Math.min(p.start.added||Date.now(), p.end.added||Date.now())
    });
    state.events=state.events.filter(e=>e.id!==p.start.id && e.id!==p.end.id);
    state.order=state.order.filter(id=>id!==p.start.id && id!==p.end.id);
    count++;
  });
  persist(); render(); closeOv('mergeOv');
  toast(count?('Merged '+count+' pair'+(count>1?'s':'')):'Nothing merged');
});

/* ---------- toast (with optional action, e.g. Undo) ---------- */
let toastTimer=null;
const toastEl=document.getElementById('toast');
const toastMsg=document.getElementById('toastMsg');
const toastAct=document.getElementById('toastAct');
let toastFn=null;
toastAct.addEventListener('click', ()=>{
  if(toastFn) toastFn();
  toastEl.classList.remove('show');
  toastAct.classList.remove('show');
  toastFn=null;
});
function toast(msg, actionLabel, actionFn){
  toastMsg.textContent=msg;
  if(actionLabel && actionFn){
    toastAct.textContent=actionLabel;
    toastAct.classList.add('show');
    toastFn=actionFn;
  }else{
    toastAct.classList.remove('show');
    toastFn=null;
  }
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>{
    toastEl.classList.remove('show');
    toastAct.classList.remove('show');
    toastFn=null;
  }, actionFn ? 6000 : 2600);
}

/* ---------- midnight rollover ---------- */
function scheduleRefresh(){
  const now=new Date();
  const next=new Date(now.getFullYear(),now.getMonth(),now.getDate()+1,0,0,5);
  setTimeout(()=>{ render(); scheduleRefresh(); }, next-now);
}

/* ---------- version + deck footer ---------- */
document.getElementById('aboutVersion').textContent = APP_VERSION;
document.getElementById('footYear').textContent = String(new Date().getFullYear());
document.getElementById('footVersion').textContent = APP_VERSION;

/* A deployed update must not yank the page out from under an open
   sheet — a typed-but-unsaved event would be lost. If any overlay is
   open when the new SW takes over, hold the reload until the UI is
   idle again. */
function maybeDeferredReload() {
	if (!reloadPending) return;
	if (document.querySelector('.overlay.open')) return;
	reloadPending = false;
	location.reload();
}

/* ---------- service worker ---------- */
if ('serviceWorker' in navigator) {
	window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js'));
	/* Reload once when a NEW deploy's SW takes over. hadController
	   distinguishes a real update from the very first install claiming
	   the page — clients.claim() on first visit must not reload the
	   app out from under a user who is mid-edit. */
	const hadController = !!navigator.serviceWorker.controller;
	let reloaded = false;
	navigator.serviceWorker.addEventListener('controllerchange', () => {
		if (reloaded || !hadController) return;
		reloaded = true;
		if (document.querySelector('.overlay.open')) { reloadPending = true; return; }
		location.reload();
	});
}

/* ---------- init ---------- */
applySettings();
render();
scheduleRefresh();
