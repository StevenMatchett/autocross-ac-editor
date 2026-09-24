import venueMetadata from './assets/venue.json';
import {natsCone} from './nats-assets';
import nationalsEast from './examples/nationals-east-2026.json';
export const FOOT = 0.3048;
export const PAD = 25 * FOOT;
export const CONE_HEIGHT = 18 * 0.0254;
export const CONE_BASE = Math.max(...[0,2].map(axis=>natsCone.cone.bounds[axis][1]-natsCone.cone.bounds[axis][0]));
export type Item = {id:string; kind:'cone'|'pointer'|'stage'|'start'|'finish'; x:number; z:number; angle:number; width?:number};
export type Layout = {version:1; name:string; columns:number; rows:number; viewAngle?:number; venue?:'lincoln'; items:Item[]};
export const emptyLayout = ():Layout => ({version:1,name:'Untitled course',columns:24,rows:16,items:[]});
export function validateLayout(value:unknown):Layout {
 const v=value as Layout;
 if(!v || v.version!==1 || typeof v.name!=='string' || v.name.length>120 || !Number.isInteger(v.columns) || !Number.isInteger(v.rows) || v.columns<4 || v.columns>160 || v.rows<4 || v.rows>160 || !Array.isArray(v.items) || v.items.length>10000) throw Error('This is not a supported Padwork layout.');
 if(v.viewAngle!==undefined && (!Number.isFinite(v.viewAngle)||Math.abs(v.viewAngle)>360)) throw Error('Invalid view angle.');
 if(v.venue!==undefined&&(v.venue!=='lincoln'||v.columns!==venueMetadata.columns||v.rows!==venueMetadata.rows))throw Error('Invalid Lincoln venue dimensions.');
 const ids=new Set<string>();
 for(const i of v.items){if(!i || typeof i.id!=='string' || ids.has(i.id) || !['cone','pointer','stage','start','finish'].includes(i.kind) || ![i.x,i.z,i.angle].every(Number.isFinite) || i.x<0 || i.z<0 || i.x>v.columns*PAD || i.z>v.rows*PAD) throw Error('The layout contains invalid or out-of-bounds objects.');if(i.width!==undefined && (!Number.isFinite(i.width)||i.width<=0||i.width>100)) throw Error('Invalid timing gate width.');ids.add(i.id);}
 for(const k of ['stage','start','finish']) if(v.items.filter(i=>i.kind===k).length>1) throw Error('Only one staging point, start, and finish are supported.');
 return structuredClone(v);
}
export function snap(value:number,step:number){return step?Math.round(value/step)*step:value;}
export function demoLayout():Layout {
 return validateLayout(nationalsEast);
}
