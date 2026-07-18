'use strict';
/* model.js — pure logic: dates, unit breakdown, recurrence, colors,
   date-token formatting, merge-pair detection. No DOM, no storage. */

/* ---------- color helpers ---------- */
function hexToRgb(h){
  const n = parseInt(h.slice(1), 16);
  return [n>>16 & 255, n>>8 & 255, n & 255];
}
function mix(hexA, hexB, t){
  const a = hexToRgb(hexA), b = hexToRgb(hexB);
  return '#' + a.map((v,i)=>Math.round(v+(b[i]-v)*t).toString(16).padStart(2,'0')).join('');
}
/* Tint/shade pair for a card color. The light theme needs different
   mix ratios (lighter backgrounds swallow pale tints), so the caller
   passes light=true/false instead of the model reading app state. */
function tintOf(c, light) { return light ? mix(c, '#ffffff', 0.18) : mix(c, '#ffffff', 0.45); }
function shadeOf(c, light) { return light ? mix(c, '#000000', 0.38) : mix(c, '#000000', 0.32); }

/* ---------- date helpers ---------- */
function todayStr(){
  const d = new Date();
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
function toUTCnoon(s){
  const [y,m,d] = s.split('-').map(Number);
  return Date.UTC(y, m-1, d, 12);
}
function daysBetween(a, b){ return Math.round((toUTCnoon(b)-toUTCnoon(a))/86400000); }
function msToDateStr(ms){
  const d = new Date(ms);
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
const MMM = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MMMM = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DDD = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const DDDD = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
/* WordPress-style token formatter: d j m n y Y M F D l.
   A backslash escapes the next character ("\Y Y" → "Y 2026"): the
   regex consumes backslash+char in a single match, so escaped letters
   never reach the token map. A trailing lone backslash matches
   nothing and is left as-is. */
function fmtTokens(s, pattern) {
	const [y, m, d] = s.split('-').map(Number);
	const dow = new Date(toUTCnoon(s)).getUTCDay();
	const map = {
		d: String(d).padStart(2, '0'), j: String(d),
		m: String(m).padStart(2, '0'), n: String(m),
		y: String(y).slice(2), Y: String(y),
		M: MMM[m - 1], F: MMMM[m - 1], D: DDD[dow], l: DDDD[dow]
	};
	return pattern.replace(/\\(.)|[djmnyYMFDl]/g, (mt, escd) => escd !== undefined ? escd : map[mt]);
}

const DEFAULT_UNITS = {y:false,m:false,w:false,d:true};

/* calendar month stepping with month-end clamp */
function addMonthsUTC(ms, n){
  const d = new Date(ms);
  const day = d.getUTCDate();
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth()+n, 1, 12));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth()+1, 0, 12)).getUTCDate();
  t.setUTCDate(Math.min(day, last));
  return t.getTime();
}
function breakdown(fromS, toS, units){
  const u = units || DEFAULT_UNITS;
  let from = toUTCnoon(fromS), to = toUTCnoon(toS);
  if(from > to){ const t = from; from = to; to = t; }
  const parts = [];
  let cur = from;
  if(u.y){
    let yv = 0;
    while(addMonthsUTC(cur,12) <= to){ cur = addMonthsUTC(cur,12); yv++; }
    parts.push({v:yv, u:'y'});
  }
  if(u.m){
    let mv = 0;
    while(addMonthsUTC(cur,1) <= to){ cur = addMonthsUTC(cur,1); mv++; }
    parts.push({v:mv, u:'m'});
  }
  const rest = Math.round((to-cur)/86400000);
  if(u.w){
    parts.push({v:Math.floor(rest/7), u:'w'});
    if(u.d) parts.push({v:rest%7, u:'d'});
  }else if(u.d){
    parts.push({v:rest, u:'d'});
  }
  if(parts.length === 0) parts.push({v:daysBetween(fromS,toS), u:'d'});
  while(parts.length > 1 && parts[0].v === 0) parts.shift();
  return parts;
}
const UNIT_WORD = {y:['year','years'], m:['month','months'], w:['week','weeks'], d:['day','days']};
function unitWord(u,v){ return UNIT_WORD[u][v===1?0:1]; }
function compact(parts){ return parts.map(p=>p.v+p.u).join(' '); }
function isDaysOnly(units){
  const u = units || DEFAULT_UNITS;
  return u.d && !u.y && !u.m && !u.w;
}
/* yearly recurrence (Feb 29 clamps to Feb 28 in non-leap years) */
function clampDate(y,m,d){
  const last = new Date(Date.UTC(y, m, 0, 12)).getUTCDate();
  return y+'-'+String(m).padStart(2,'0')+'-'+String(Math.min(d,last)).padStart(2,'0');
}
function nextOccurrence(dateS, tS){
  const [by,bm,bd] = dateS.split('-').map(Number);
  const ty = Number(tS.slice(0,4));
  let next = clampDate(ty, bm, bd);
  if(next < tS) next = clampDate(ty+1, bm, bd);
  return { next, daysUntil:daysBetween(tS,next), turns:Number(next.slice(0,4))-by };
}

function evDuration(ev){
  if(ev.kind !== 'range') return 0;
  return daysBetween(ev.date, ev.end || todayStr());
}
