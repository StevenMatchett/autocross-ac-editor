export const SETUP_FIELDS = [
 {key:'grip',label:'Tire grip',min:7,max:20,step:.1,value:12.8,unit:'m/s²'},
 {key:'acceleration',label:'Acceleration',min:.5,max:2,step:.05,value:1,unit:'×'},
 {key:'braking',label:'Brake strength',min:.5,max:2,step:.05,value:1,unit:'×'},
 {key:'steering',label:'Steering lock',min:.5,max:1.5,step:.05,value:1,unit:'×'},
 {key:'response',label:'Steering response',min:.5,max:2,step:.05,value:1,unit:'×'},
 {key:'topSpeed',label:'Top speed',min:25,max:100,step:1,value:65,unit:'mph'},
] as const;
export type CarSetup=Record<(typeof SETUP_FIELDS)[number]['key'],number>;
export function normalizeSetup(value:unknown):CarSetup {
 const source=value&&typeof value==='object'?value as Record<string,unknown>:{};
 return Object.fromEntries(SETUP_FIELDS.map(field=>{
  const v=source[field.key];
  return [field.key,typeof v==='number'&&Number.isFinite(v)?Math.max(field.min,Math.min(field.max,v)):field.value];
 })) as CarSetup;
}
export const SETUP_STORAGE='padwork-car-setup';
