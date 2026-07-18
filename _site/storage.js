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
