import { test } from 'node:test';
import assert from 'node:assert/strict';
import { unzlibSync, unzipSync } from 'fflate';
import { coneColor, coneTexture, coneTexturePNG } from '../src/cone-material.ts';
import {buildExport} from '../src/export.ts';
import {completeLayout} from './fixtures.ts';

test('wear is repeatable per cone, and differs between cones',()=>{
 assert.deepEqual(coneTexture('cone-a'),coneTexture('cone-a'));
 assert.notDeepEqual(coneTexture('cone-a').pixels,coneTexture('cone-b').pixels);
 const {pixels}=coneTexture('cone-a');let orange=0,dark=0;
 for(let p=0;p<pixels.length;p+=4){if(pixels[p]>pixels[p+1]*1.8&&pixels[p]>160)orange++;if(pixels[p]<100)dark++;assert.equal(pixels[p+3],255);}
 assert.ok(orange>pixels.length/4*.75);assert.ok(dark>0);
 assert.ok(coneColor('cone-a')[0]>220);
});
test('PNG contains lossless RGBA texture pixels',()=>{
 const texture=coneTexture('cone-a'),png=coneTexturePNG(texture);
 assert.deepEqual([...png.subarray(0,8)],[137,80,78,71,13,10,26,10]);
 const view=new DataView(png.buffer);assert.equal(view.getUint32(16),texture.width);assert.equal(view.getUint32(20),texture.height);
 const idatLength=view.getUint32(33);const raw=unzlibSync(png.subarray(41,41+idatLength));
 for(let y=0;y<texture.height;y++){const offset=y*(texture.width*4+1);assert.equal(raw[offset],0);assert.deepEqual(raw.subarray(offset+1,offset+1+texture.width*4),texture.pixels.subarray(y*texture.width*4,(y+1)*texture.width*4));}
});
test('export bundles original Nationals texture and stable per-cone tints',()=>{
 const l=completeLayout();const a=buildExport(l);const first=l.items[2];const second=l.items[3];
 first.x+=1;l.items[2]=second;l.items[3]=first;const b=buildExport(l);
 assert.deepEqual(a.files['texture/ConePaintTexture.png'],b.files['texture/ConePaintTexture.png']);
 const decode=(bundle:ReturnType<typeof buildExport>)=>JSON.parse(new TextDecoder().decode(bundle.files['cone-assets.json']));
 assert.equal(decode(a).tints['2'],decode(b).tints['3']);
 const files=unzipSync(a.zip);assert.equal(Object.keys(files).filter(k=>k.endsWith('.png')).length,1);
 assert.ok(files['ASSET_CREDITS.txt']);
});
