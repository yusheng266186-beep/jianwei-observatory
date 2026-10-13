import {validDate,todayLocal} from './training.js?v=optics-v28';
export const pad=value=>String(value).padStart(2,'0');
export const dateString=d=>String(d.getUTCFullYear()).padStart(4,'0')+'-'+pad(d.getUTCMonth()+1)+'-'+pad(d.getUTCDate());
export function addDays(value,days){const date=new Date(value+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+days);return dateString(date);}
export function shiftMonth(value,delta){const date=new Date(value+'T12:00:00Z'),day=date.getUTCDate();date.setUTCDate(1);date.setUTCMonth(date.getUTCMonth()+delta);const end=new Date(date);end.setUTCMonth(end.getUTCMonth()+1);end.setUTCDate(0);date.setUTCDate(Math.min(day,end.getUTCDate()));return dateString(date);}
export function calendarDays(month,{selected='',min='',today=todayLocal(),active=''}={}){
 const first=new Date(month.slice(0,7)+'-01T12:00:00Z'),offset=(first.getUTCDay()+6)%7,start=addDays(dateString(first),-offset);
 return Array.from({length:42},(_,i)=>{const value=addDays(start,i);return {value,day:Number(value.slice(8)),outside:value.slice(0,7)!==month.slice(0,7),selected:value===selected,today:value===today,active:value===active,disabled:!!min&&value<min};});
}
export function parseDateText(value){const text=String(value).trim(),date=(/^\d{8}$/.test(text)?text.slice(0,4)+'-'+text.slice(4,6)+'-'+text.slice(6):text).replace(/[/.]/g,'-'),match=date.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);if(!match)return null;const normalized=match[1]+'-'+pad(match[2])+'-'+pad(match[3]);return validDate(normalized)?normalized:null;}
export function parseTimeText(value){const match=String(value).trim().match(/^(\d{1,2}):(\d{1,2})$/);if(!match||Number(match[1])>23||Number(match[2])>59)return null;return pad(match[1])+':'+pad(match[2]);}
export function clampWhole(value,min,max){const number=Number(value);return Math.max(min,Math.min(max,Number.isFinite(number)?Math.round(number):min));}
