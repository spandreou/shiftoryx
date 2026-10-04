import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const output=await mkdtemp(join(tmpdir(),'shiftoryx-demo-visual-')),browser=await chromium.launch({headless:true});
const results=[];
try{
  const context=await browser.newContext({serviceWorkers:'block',reducedMotion:'reduce'});await context.routeWebSocket('**/*',s=>s.close());
  await context.route('**/*',async route=>{const u=new URL(route.request().url());if(u.hostname==='demo.shiftoryx.gr'){await route.fulfill({response:await route.fetch({url:'http://127.0.0.1:5201'+u.pathname+u.search,maxRedirects:0})});return;}if(u.hostname==='127.0.0.1'&&['9308','8197','9408','5111'].includes(u.port)){await route.continue();return;}await route.abort();});
  const page=await context.newPage(),errors=[];page.on('pageerror',()=>errors.push('uncaught page error'));
  for(const width of [320,390,768,1440,1920]){
    await page.setViewportSize({width,height:900});await page.goto('https://demo.shiftoryx.gr');await page.getByRole('heading',{level:1}).waitFor();
    assert.equal(await page.locator('article').count(),4);assert.equal(await page.locator('article button').count(),4);
    const layout=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth}));assert.ok(layout.scrollWidth<=layout.width,'no horizontal clipping at '+width);
    await page.screenshot({path:join(output,'landing-'+width+'.png'),fullPage:true});results.push({width,overflow:false,cards:4});
  }
  await page.keyboard.press('Tab');assert.equal(await page.locator(':focus').getAttribute('href'),'#demo-intro');
  await page.keyboard.press('Tab');assert.ok((await page.locator(':focus').getAttribute('aria-label')).includes('Δοκιμή Demo'));
  assert.deepEqual(errors,[]);await writeFile(join(output,'results.json'),JSON.stringify({mode:'LOCAL_EMULATOR_NOT_HOSTED',results,keyboard:true,pageErrors:0},null,2));console.log('DEMO_VISUAL_PASS viewports=5 keyboard=true pageErrors=0 output='+output);
}finally{await browser.close();}
