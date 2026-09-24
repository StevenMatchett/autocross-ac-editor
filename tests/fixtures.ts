import {emptyLayout} from '../src/model.ts';
export function completeLayout(){
 const layout=emptyLayout();
 layout.items=[{id:'start',kind:'start',x:10,z:10,angle:0},{id:'finish',kind:'finish',x:60,z:80,angle:180},{id:'a',kind:'cone',x:20,z:20,angle:0},{id:'b',kind:'pointer',x:22,z:20,angle:90}];
 layout.items.push({id:'stage',kind:'stage',x:10,z:20,angle:0});
 return layout;
}
