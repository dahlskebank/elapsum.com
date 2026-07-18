'use strict';
/* storage.js — ALL persistence: localStorage state (key days.slate.v1),
   schema migration, export envelope, import parsing. Uses model.js
   globals (msToDateStr, pickDefaultColor, COLORS) — load order matters:
   model.js first, then this file, then app.js. */

const STORE_KEY = 'days.slate.v1';
const DEFAULT_SETTINGS = { theme:'dark', brutal:false, gradient:true, dateFmt:'d.m.Y', dateFmtCustom:'' };

/* ---------- storage ---------- */
function migrate(ev){
  if(!ev.kind) ev.kind = ev.isRange ? 'range' : 'single';
  delete ev.isRange;
  if(ev.pinned === undefined) ev.pinned = false;
  if(ev.units === undefined) ev.units = null;
  return ev;
}
function load(){
  try{
    const raw = localStorage.getItem(STORE_KEY);
    if(raw){
      const s = JSON.parse(raw);
      if(Array.isArray(s.events)){
        return {
          events:s.events.map(migrate),
          sort:s.sort || 'added_desc',
          order:Array.isArray(s.order) ? s.order : [],
          settings:Object.assign({}, DEFAULT_SETTINGS, s.settings)
        };
      }
    }
  }catch(e){ console.error('load failed', e); }
  return { events:[], sort:'added_desc', order:[], settings:Object.assign({},DEFAULT_SETTINGS) };
}
function save(state) {
	try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); return true; }
	catch (e) { console.error('save failed', e); return false; }
}

/* Export envelope. "elapsum" v4 supersedes the prototype's
   "days-slate" v3 — import (below) accepts both, it only looks for
   an events array. exportedIso is a parameter for testability. */
function buildExport(state, exportedIso) {
	return {
		app: 'elapsum', version: 4, exported: exportedIso,
		events: state.events, order: state.order, settings: state.settings
	};
}

/* Import parser. Accepts exactly two formats:
   1. The original Days Counter backup — a raw ARRAY of
      {id,title,description,date(ms),addition_date,widget_id}.
   2. Elapsum's own export (and the old days-slate prototype export) —
      an OBJECT with an events array; migrate() upgrades old fields.
   Returns {ok:false,error} or {ok:true,imported,dupes} where dupes
   lists incoming events whose title+date already exist — the UI asks
   before appending those (importing the same file twice used to
   silently duplicate everything). ids are NOT assigned here; the app
   assigns them on append so they stay unique against live state. */
function parseImport(text, existingEvents) {
	let data;
	try { data = JSON.parse(text); }
	catch (e) { return { ok: false, error: 'Not valid JSON' }; }
	let imported = [];
	if (Array.isArray(data)) {
		imported = data
			.filter(x => x && typeof x.title === 'string' && typeof x.date === 'number')
			.map((x, i) => ({
				id: 0,
				title: x.title.trim(),
				desc: (x.description || '').trim(),
				date: msToDateStr(x.date),
				end: null, kind: 'single', units: null, pinned: false,
				color: pickDefaultColor(i),
				added: typeof x.addition_date === 'number' ? x.addition_date : Date.now()
			}));
	} else if (data && Array.isArray(data.events)) {
		imported = data.events.filter(x => x && x.title && x.date).map(migrate);
	}
	if (imported.length === 0) return { ok: false, error: 'No events found in file' };
	const key = (e) => e.title.trim().toLowerCase() + '|' + e.date;
	const seen = new Set(existingEvents.map(key));
	const dupes = imported.filter(ev => seen.has(key(ev)));
	return { ok: true, imported, dupes };
}
