import {gunzipSync} from 'fflate';
import metadata from './assets/venue.json';
import {RoadSurface} from './road-surface';
import type {Layout} from './model';
export const VENUE=metadata;
export const venueLayout=():Layout=>({version:1,name:'Lincoln Nationals',venue:'lincoln',columns:VENUE.columns,rows:VENUE.rows,items:[{id:'lincoln-stage',kind:'stage',x:480,z:480,angle:0}]});
let road:RoadSurface|undefined,roadRequest:Promise<RoadSurface>|undefined,modelRequest:Promise<Uint8Array>|undefined;
export const venueURL=(file:string)=>`${import.meta.env.BASE_URL}venue/${file}`;
async function compressed(file:string){
 const response=await fetch(venueURL(file));if(!response.ok)throw Error(`Could not load Lincoln venue (${response.status}). Try again.`);
 const bytes=new Uint8Array(await response.arrayBuffer());
 // Some static servers advertise Content-Encoding and the browser decodes it.
 return bytes[0]===0x1f&&bytes[1]===0x8b?gunzipSync(bytes):bytes;
}
export function prepareVenue(){return roadRequest??=(compressed('road.bin.gz').then(bytes=>road=new RoadSurface(bytes)).catch(error=>{roadRequest=undefined;throw error;}));}
export function venueModel(){return modelRequest??=(compressed('lincoln.glb.gz').catch(error=>{modelRequest=undefined;throw error;}));}
export function getRoad(){return road;}
export function groundHeight(layout:Layout,x:number,z:number){return layout.venue?(road?.height(x,z)??0):0;}
export async function loadVenueScene(){
 const [{GLTFLoader},bytes]=await Promise.all([import('three/addons/loaders/GLTFLoader.js'),venueModel()]);
 const result=await new GLTFLoader().parseAsync(bytes.slice().buffer,'');
 result.scene.traverse(object=>{const mesh=object as import('three').Mesh;if(mesh.isMesh)for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material]){const map=(material as import('three').MeshStandardMaterial).map;if(map)map.anisotropy=8;}});
 result.scene.name='Lincoln venue';return result.scene;
}
