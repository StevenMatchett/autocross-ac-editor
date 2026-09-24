// Exact barycentric height queries, accelerated with an 8 m spatial grid.
export class RoadSurface {
 readonly positions:Float32Array;
 readonly indices:Uint32Array;
 private cells=new Map<string,number[]>();
 constructor(bytes:Uint8Array){
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),vertices=view.getUint32(0,true),count=view.getUint32(4,true);
  if(bytes.byteLength!==8+vertices*12+count*4||count%3)throw Error('Invalid venue road data.');
  this.positions=new Float32Array(bytes.slice(8,8+vertices*12).buffer);this.indices=new Uint32Array(bytes.slice(8+vertices*12).buffer);
  for(let i=0;i<count;i+=3){
   const ids=[this.indices[i]*3,this.indices[i+1]*3,this.indices[i+2]*3];
   if(ids.some(id=>id+2>=this.positions.length))throw Error('Invalid venue triangle.');
   const xs=ids.map(id=>this.positions[id]),zs=ids.map(id=>this.positions[id+2]);
   for(let x=Math.floor(Math.min(...xs)/8);x<=Math.floor(Math.max(...xs)/8);x++)for(let z=Math.floor(Math.min(...zs)/8);z<=Math.floor(Math.max(...zs)/8);z++){
    const key=`${x},${z}`;if(!this.cells.has(key))this.cells.set(key,[]);this.cells.get(key)!.push(i);
   }
  }
 }
 height(x:number,z:number):number|null {
  const p=this.positions;let highest:number|null=null;
  for(const index of this.cells.get(`${Math.floor(x/8)},${Math.floor(z/8)}`)??[]){
   const a=this.indices[index]*3,b=this.indices[index+1]*3,c=this.indices[index+2]*3;
   const denominator=(p[b+2]-p[c+2])*(p[a]-p[c])+(p[c]-p[b])*(p[a+2]-p[c+2]);
   if(Math.abs(denominator)<1e-9)continue;
   const u=((p[b+2]-p[c+2])*(x-p[c])+(p[c]-p[b])*(z-p[c+2]))/denominator;
   const v=((p[c+2]-p[a+2])*(x-p[c])+(p[a]-p[c])*(z-p[c+2]))/denominator;
   if(u>=-1e-6&&v>=-1e-6&&u+v<=1+1e-6){const y=u*p[a+1]+v*p[b+1]+(1-u-v)*p[c+1];highest=highest===null?y:Math.max(y,highest);}
  }
  return highest;
 }
}
