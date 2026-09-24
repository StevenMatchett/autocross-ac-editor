import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:950}});page.setDefaultTimeout(60000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/road.bin.gz',route=>route.fulfill({status:503,body:'Unavailable'}));
 await page.goto(process.env.PADWORK_TEST_URL??'http://localhost:5173');
 await page.waitForFunction(()=>document.querySelector('#toast').textContent.includes('503'));
 assert.equal(await page.locator('#course-name').inputValue(),'Lincoln Nationals');
 await page.unroute('**/road.bin.gz');await page.reload();
 await page.waitForFunction(()=>document.querySelector('#course-name').value==='Lincoln Nationals');
 assert.equal(await page.locator('#venue').count(),0);
 assert.equal(await page.locator('#columns').isDisabled(),true);assert.equal(await page.locator('#grid').isChecked(),false);
 await page.waitForFunction(()=>!document.querySelector('#toast').classList.contains('visible'));await page.screenshot({path:'/tmp/padwork-venue-editor.png'});
 const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('padwork')));assert.equal(stored.venue,'lincoln');assert.equal(stored.items.length,1);
 await page.locator('#demo').click();await page.waitForFunction(()=>document.querySelector('#cone-count').textContent==='301');
 const example=await page.evaluate(()=>JSON.parse(localStorage.getItem('padwork')));
 assert.equal(example.venue,'lincoln');assert.equal(example.columns,stored.columns);assert.equal(example.rows,stored.rows);
 assert.equal(example.items.filter(i=>i.kind==='stage').length,1);assert.equal(await page.locator('#columns').isDisabled(),true);
 await page.locator('#undo').click();assert.equal(await page.locator('#cone-count').textContent(),'0');
 await page.locator('#redo').click();assert.equal(await page.locator('#cone-count').textContent(),'301');
 await page.locator('#demo').click();assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('padwork'))),example);
 await page.waitForFunction(()=>!document.querySelector('#toast').classList.contains('visible'));
 await page.screenshot({path:'/tmp/padwork-venue-example.png'});

 await page.locator('#drive').click();await page.locator('#drive-viewport canvas').waitFor();
 await page.keyboard.down('w');await page.waitForFunction(()=>Number(document.querySelector('#drive-speed').textContent)>0);await page.keyboard.up('w');
 await page.locator('#drive-reset').click();await page.screenshot({path:'/tmp/padwork-venue-driving.png'});
 await page.locator('#drive-close').click();await page.locator('#drive-dialog').waitFor({state:'detached'});
 await page.locator('#preview').click();await page.locator('#three canvas').waitFor();await page.waitForTimeout(1500);await page.screenshot({path:'/tmp/padwork-venue-preview.png'});await page.locator('#close-preview').click();
 await page.reload();assert.equal(await page.locator('#columns').isDisabled(),true);assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('padwork'))),example);
 await page.locator('#new').click();assert.equal(await page.locator('#columns').isDisabled(),true);assert.equal(await page.locator('#cone-count').textContent(),'0');
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('padwork')).venue),'lincoln');
 await page.locator('#undo').click();assert.equal(await page.locator('#columns').isDisabled(),true);
 assert.deepEqual(errors,[]);console.log('Venue browser checks passed: load, ground-aware driving, preview, persistence, new course and undo.');
}finally{await browser.close();}
