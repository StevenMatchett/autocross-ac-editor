import {chromium} from '@playwright/test';
import {mkdir} from 'node:fs/promises';

const output=new URL('../docs/screenshots/',import.meta.url);
await mkdir(output,{recursive:true});
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader']});
try {
 const page=await browser.newPage({viewport:{width:1440,height:950},deviceScaleFactor:1});
 await page.goto('http://localhost:5173');
 await page.locator('#demo').click();
 await page.waitForFunction(()=>document.querySelector('#cone-count').textContent==='301');
 await page.locator('#map').waitFor();
 await page.waitForFunction(()=>!document.querySelector('#toast').classList.contains('visible'));
 await page.mouse.move(10,10);
 await page.screenshot({path:new URL('editor.png',output).pathname});
 await page.locator('#drive').click();
 await page.locator('#drive-viewport canvas').waitFor();
 await page.waitForTimeout(700);
 await page.screenshot({path:new URL('driving.png',output).pathname});
 await page.locator('#drive-setup-toggle').click();
 await page.locator('#drive-setup').waitFor({state:'visible'});
 await page.screenshot({path:new URL('car-setup.png',output).pathname});
} finally {await browser.close();}
