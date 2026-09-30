import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {strFromU8} from 'fflate';
import {buildExport} from '../src/export.ts';
import {completeLayout} from './fixtures.ts';
test('source export carries current compiler source, license and Windows entry point',()=>{
 const bundle=buildExport(completeLayout());
 for(const name of readdirSync(new URL('../scripts/track-build/',import.meta.url)).filter(n=>!n.startsWith('__'))){
  assert.equal(strFromU8(bundle.files[name]),readFileSync(new URL('../scripts/track-build/'+name,import.meta.url),'utf8'));
 }
 assert.equal(JSON.parse(strFromU8(bundle.files['build.json'])).slug,bundle.slug);
 assert.match(strFromU8(bundle.files['COPYING']),/GNU GENERAL PUBLIC LICENSE/);
 assert.match(strFromU8(bundle.files['EXPORTER_NOTICE.txt']),/3940bb90614efb82707a0964836563b11dd11f7f/);
 assert.match(strFromU8(bundle.files[bundle.slug+'/data/surfaces.ini']),/KEY=WALL/);
 assert.equal(strFromU8(bundle.files[bundle.slug+'/ASSET_CREDITS.txt']),strFromU8(bundle.files['ASSET_CREDITS.txt']));
});
