// Actual HTTPS UI acceptance. No localhost routes, mocked API responses,
// credentials in traces, or imports from a development server.
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
import {chromium} from 'playwright';
import {expect} from 'playwright/test';
import {loadHostedQualification,TENANTS,assertHostedGeneration,assertResetAdvance,isQualificationBrowserRequest,ensure,assertQualifiedReceipt} from './hosted-qualification.ts';
import {createSdkAdapter,verifyCanonicalBaseline,preflightHostedClients,verifyCanonicalAfterReset,resetQualificationTenant,requirePostResetPrivateEvidence} from './hosted-runner.ts';
export async function runHostedBrowserQualification(qualification,{privateCleanupEvidenceProvider}={}){
assertQualifiedReceipt(qualification);ensure(typeof privateCleanupEvidenceProvider==='function','PRIVATE_CLEANUP_EVIDENCE_REQUIRED');
let status='PASS';
const tenants=TENANTS;
const staff=Object.fromEntries(tenants.map(t=>[t,qualification.baseline.tenants[t].counts.employees]));
const adapter=createSdkAdapter(qualification),observers=[],cleanup=[];
const landing='https://demo.shiftoryx.gr';
const output=await mkdtemp(join(tmpdir(),'shiftoryx-hosted-browser-'));
const results=[],browser=await chromium.launch({headless:true});let currentPage;
function record(tenant,scenario){results.push({tenant,scenario,result:'PASS'});console.log('HOSTED_PASS '+tenant+' '+scenario);}
async function enter(page,tenant){await page.goto(landing);await expect(page.locator('article')).toHaveCount(4);await page.locator('article#'+tenant).getByRole('button').click();await page.waitForURL(u=>u.hostname===tenant+'.shiftoryx.gr'&&u.pathname==='/app'&&!u.hash,{timeout:90000});await page.getByTestId('scheduler-v3-workspace').waitFor({timeout:60000});}
async function publish(w,version){const ack=w.getByLabel('Διάβασα τις προειδοποιήσεις και επιλέγω δημοσίευση.',{exact:true});await expect(ack).toBeVisible();await ack.check();await w.getByRole('button',{name:'Δημοσίευση νέας έκδοσης',exact:true}).click();await expect(w.getByText(`Δημοσιεύτηκε η έκδοση ${version}.`,{exact:true})).toBeVisible({timeout:60000});}
async function download(page,article,path){const pending=page.waitForEvent('download',{timeout:60000});await article.getByRole('button',{name:'Λήψη PDF',exact:true}).click();await (await pending).saveAs(path);const bytes=await readFile(path);assert.equal(bytes.subarray(0,5).toString(),'%PDF-');return bytes;}
async function ownerUi(page,c){
  c.changed=true;
  const w=page.getByTestId('scheduler-v3-workspace'),tenant=c.tenant,name='Φανταστικός επισκέπτης '+crypto.randomUUID(),renamed=name+' Β';
  await w.getByText('Εργαζόμενοι και απουσίες',{exact:true}).click();
  await w.getByLabel('Ονοματεπώνυμο',{exact:true}).fill(name);await w.getByRole('button',{name:'Προσθήκη εργαζομένου',exact:true}).click();
  await expect(w.getByText(name,{exact:true}).and(w.locator('span'))).toBeVisible();
  let row=w.getByText(name,{exact:true}).and(w.locator('span')).locator('..');await row.getByRole('button',{name:'Επεξεργασία στοιχείων',exact:true}).click();
  const profile=page.locator('form').filter({has:page.getByRole('button',{name:'Αποθήκευση',exact:true})});
  await expect(profile.getByLabel('Email',{exact:true})).toHaveCount(0);await expect(profile.getByLabel('ΑΦΜ',{exact:true})).toHaveCount(0);
  await profile.getByLabel('Ονοματεπώνυμο',{exact:true}).fill(renamed);await profile.getByRole('button',{name:'Αποθήκευση',exact:true}).click();
  await expect(w.getByText(renamed,{exact:true}).and(w.locator('span'))).toBeVisible();
  row=w.getByText(renamed,{exact:true}).and(w.locator('span')).locator('..');await row.getByRole('button',{name:'Απενεργοποίηση',exact:true}).click();
  await expect(row.getByRole('button',{name:'Ενεργοποίηση',exact:true})).toBeVisible();await row.getByRole('button',{name:'Ενεργοποίηση',exact:true}).click();
  await expect(row.getByRole('button',{name:'Απενεργοποίηση',exact:true})).toBeVisible();
  await w.getByText('Εργαζόμενοι και απουσίες',{exact:true}).click();await w.getByText('Ρυθμίσεις και προφίλ εργαζομένων',{exact:true}).click();
  const settings=w.getByRole('form',{name:'Ρυθμίσεις προγράμματος V3',exact:true});await settings.getByRole('combobox',{name:'Εργαζόμενος',exact:true}).selectOption({label:renamed});
  const employeeId=await settings.getByRole('combobox',{name:'Εργαζόμενος',exact:true}).inputValue(),standard=c.fixture.config.shiftTemplates[0];
  await expect(settings.getByRole('combobox',{name:'Συμμετοχή',exact:true})).toHaveValue('NORMAL');
  await settings.getByRole('combobox',{name:'Τυπική έναρξη',exact:true}).selectOption(standard.startTime);await settings.getByRole('combobox',{name:'Τυπική λήξη',exact:true}).selectOption(standard.endTime);
  await settings.getByRole('combobox',{name:'Σταθερό ρεπό',exact:true}).selectOption('1');await settings.getByLabel('Στόχος εβδομαδιαίων ωρών',{exact:true}).fill('32');
  await settings.getByLabel('Αλλαγή βάρδιας κάθε εβδομάδα',{exact:true}).check();await settings.getByRole('button',{name:'Αποθήκευση ρυθμίσεων',exact:true}).click();
  await expect(w.locator('p[role="status"][aria-live="polite"]')).toContainText('Οι ρυθμίσεις αποθηκεύτηκαν.');
  await page.reload();await w.waitFor();await w.getByText('Ρυθμίσεις και προφίλ εργαζομένων',{exact:true}).click();await settings.getByRole('combobox',{name:'Εργαζόμενος',exact:true}).selectOption(employeeId);
  await expect(settings.getByRole('combobox',{name:'Σταθερό ρεπό',exact:true})).toHaveValue('1');await expect(settings.getByLabel('Στόχος εβδομαδιαίων ωρών',{exact:true})).toHaveValue('32');
  await expect(settings.getByLabel('Αλλαγή βάρδιας κάθε εβδομάδα',{exact:true})).toBeChecked();
  await w.getByText('Ρυθμίσεις και προφίλ εργαζομένων',{exact:true}).click();await w.getByText('Εργαζόμενοι και απουσίες',{exact:true}).click();await w.getByTestId('add-absence-button').click();
  const modal=page.getByTestId('absence-modal');await modal.getByTestId('absence-employee-select').selectOption(employeeId);await modal.getByTestId('absence-type-select').selectOption('OTHER');
  const day=modal.locator('[data-testid="absence-calendar-day"][data-date="'+c.fixture.weekStart+'"]');await day.click();await day.click();
  await modal.getByPlaceholder('Προαιρετικό σχόλιο',{exact:true}).fill('Φανταστική απουσία');await modal.getByTestId('save-absence-button').click();await expect(modal).toBeHidden();
  const absence=w.getByTestId('absence-card').filter({hasText:renamed});await expect(absence).toHaveCount(1);
  const saved=(await adapter.list(c,'tenants/'+tenant+'/absences')).filter(r=>r.data.employeeId===employeeId);assert.equal(saved.length,1);
  await absence.getByTestId('edit-absence-button').click();await modal.getByPlaceholder('Προαιρετικό σχόλιο',{exact:true}).fill('Ενημερωμένη φανταστική απουσία');
  await modal.getByTestId('save-absence-button').click();await expect(modal).toBeHidden();await expect(absence).toContainText('Ενημερωμένη φανταστική απουσία');
  page.once('dialog',d=>d.accept());await absence.getByTestId('delete-absence-button').click();await expect(absence).toHaveCount(0);
  const board=w.getByRole('heading',{name:'Πίνακας Ανακοινώσεων',exact:true}).locator('..').locator('..'),title='Φανταστική ανακοίνωση '+crypto.randomUUID();
  await board.getByPlaceholder('Τίτλος ανακοίνωσης',{exact:true}).fill(title);await board.getByPlaceholder('Γράψε την ανακοίνωση...',{exact:true}).fill('Αποκλειστικά δοκιμαστικά δεδομένα.');
  await board.getByRole('button',{name:'Δημοσίευση Ανακοίνωσης',exact:true}).click();const ann=board.locator('article').filter({hasText:title});await expect(ann).toHaveCount(1);
  await ann.getByTitle('Διαγραφή ανακοίνωσης').click();await page.getByRole('dialog').getByRole('button',{name:'Ναι, διαγραφή',exact:true}).click();await expect(ann).toHaveCount(0);
  row=w.getByText(renamed,{exact:true}).and(w.locator('span')).locator('..');page.once('dialog',d=>d.accept());await row.getByRole('button',{name:'Διαγραφή',exact:true}).click();
  await expect(w.getByText(renamed,{exact:true}).and(w.locator('span'))).toHaveCount(0);await w.getByText('Εργαζόμενοι και απουσίες',{exact:true}).click();
  record(tenant,'typed OWNER employee/profile/settings/absence/announcement CRUD and cleanup');
}
try{
  await preflightHostedClients(adapter,qualification,observers);
  for(const tenant of tenants){
    const c=observers.find(c=>c.tenant===tenant);await verifyCanonicalBaseline(adapter,c,qualification);
    const ctx=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true,serviceWorkers:'block'}),page=await ctx.newPage();currentPage=page;page.setDefaultTimeout(30000);const errors=[],typedStages=new Set();page.on('pageerror',()=>errors.push('uncaught browser error'));
    await ctx.route('**/*',async route=>{if(!isQualificationBrowserRequest(qualification,route.request().url())){errors.push('forbidden network target');await route.abort();return;}await route.continue();});
    page.on('response',response=>{if(response.status()===200&&response.url().endsWith('/mutatePublicDemo')){try{typedStages.add(JSON.parse(response.request().postData()||'{}').operation);}catch{errors.push('invalid typed request');}}});
    await page.goto(landing);await expect(page.locator('article')).toHaveCount(4);if(tenant==='demo-fuel')await page.screenshot({path:join(output,'landing.png'),fullPage:true});
    await enter(page,tenant);record(tenant,'HTTPS landing, selection, login and correct redirect');await page.reload();await page.getByTestId('scheduler-v3-workspace').waitFor();record(tenant,'session persists on refresh');
    await page.goto('https://'+tenant+'.shiftoryx.gr/app');await page.getByTestId('scheduler-v3-workspace').waitFor();record(tenant,'direct authorized subdomain');
    const w=page.getByTestId('scheduler-v3-workspace');await w.getByText('Εργαζόμενοι και απουσίες',{exact:true}).click();await expect(w.getByRole('button',{name:'Επεξεργασία στοιχείων',exact:true})).toHaveCount(staff[tenant]);await w.getByText('Εργαζόμενοι και απουσίες',{exact:true}).click();record(tenant,'canonical employee roster');
    await verifyCanonicalBaseline(adapter,c,qualification);await ownerUi(page,c);assertHostedGeneration(qualification,tenant,await adapter.read(c,'demoState/'+tenant));
    await w.getByRole('button',{name:'Δημιουργία',exact:true}).click();await w.getByRole('button',{name:'Αφαίρεση βάρδιας'}).first().waitFor();const count=await w.getByRole('button',{name:'Αφαίρεση βάρδιας'}).count();assert.ok(count>0);await page.screenshot({path:join(output,tenant+'-week.png')});record(tenant,'WEEK generation');
    const stats=w.getByRole('region',{name:'Ώρες εργαζομένων',exact:true}),before=await stats.innerText(),picker=w.getByRole('combobox',{name:'Από',exact:true}).first();await expect(picker.locator('option')).toHaveCount(96);await picker.selectOption('06:15');await expect(stats).not.toHaveText(before);record(tenant,'15-minute time edit recalculates hours');
    const employee=w.getByRole('combobox',{name:'Εργαζόμενος',exact:true}).first(),old=await employee.inputValue();const replacement=await employee.locator('option').evaluateAll((options,old)=>options.find(o=>o.value!==old&&!o.disabled).value,old);await employee.selectOption(replacement);await expect(employee).toHaveValue(replacement);record(tenant,'Preview employee replacement');
    await w.getByRole('button',{name:'+ Προσθήκη εργαζομένου',exact:true}).click();const pending=w.getByRole('group',{name:'Νέα ανάθεση',exact:true});await pending.getByRole('combobox',{name:'Εργαζόμενος',exact:true}).selectOption(replacement);await pending.getByRole('button',{name:'Προσθήκη',exact:true}).click();await expect(w.getByRole('button',{name:'Αφαίρεση βάρδιας'})).toHaveCount(count+1);record(tenant,'manual assignment added');
    await w.getByRole('button',{name:'Αφαίρεση βάρδιας'}).first().click();await expect(w.getByRole('button',{name:'Αφαίρεση βάρδιας'})).toHaveCount(count);await expect(w.getByRole('region',{name:'Προειδοποιήσεις',exact:true})).toContainText('Κάλυψη');record(tenant,'assignment removal and live coverage warnings');
    await publish(w,1);record(tenant,'publish v1 with warnings');const history=w.getByRole('region',{name:'Ιστορικό δημοσιεύσεων',exact:true});await expect(history.getByRole('article')).toHaveCount(1);const v1=history.getByRole('article').first();await v1.getByRole('button',{name:'Προβολή',exact:true}).click();const view=w.getByRole('region',{name:'Προβολή δημοσίευσης',exact:true}),v1Text=await view.innerText();await view.getByRole('button',{name:'Κλείσιμο προβολής',exact:true}).click();const v1Bytes=await download(page,v1,join(output,tenant+'-v1.pdf'));record(tenant,'stored publication PDF downloaded');
    await w.getByRole('button',{name:'Αφαίρεση βάρδιας'}).first().click();await publish(w,2);await w.getByRole('button',{name:'Φόρτωση ιστορικού',exact:true}).click();await expect(history.getByRole('article')).toHaveCount(2);const prior=history.getByRole('article').filter({has:page.getByRole('heading',{level:3,name:/Έκδοση 1$/})});await expect(prior).toHaveCount(1);await prior.getByRole('button',{name:'Προβολή',exact:true}).click();assert.equal(await view.innerText(),v1Text);await view.getByRole('button',{name:'Κλείσιμο προβολής',exact:true}).click();const after=await download(page,prior,join(output,tenant+'-v1-after-v2.pdf'));assert.deepEqual(after,v1Bytes);record(tenant,'history v2 leaves v1 snapshot and stored PDF unchanged');
    await w.getByRole('combobox',{name:'Περίοδος',exact:true}).selectOption('MONTH');await w.getByRole('button',{name:'Δημιουργία',exact:true}).click();await expect.poll(()=>w.getByRole('button',{name:'Αφαίρεση βάρδιας'}).count()).toBeGreaterThan(count);await expect(stats).toBeVisible();await page.screenshot({path:join(output,tenant+'-month.png')});record(tenant,'MONTH generation and employee totals');
    await w.getByText('Εβδομαδιαίοι στόχοι και αποκλίσεις',{exact:true}).click();await expect(w.getByRole('columnheader',{name:'Στόχος',exact:true})).toBeVisible();record(tenant,'weekly targets and deltas visible');
    // A fresh foreign origin must not inherit this tenant's operational session.
    for(const foreign of tenants.filter(t=>t!==tenant)){const other=await ctx.newPage();await other.goto('https://'+foreign+'.shiftoryx.gr/app');await other.waitForURL(u=>u.hostname==='demo.shiftoryx.gr',{timeout:60000});await expect(other.getByTestId('scheduler-v3-workspace')).toHaveCount(0);record(tenant,'foreign hostname cannot expose '+foreign);await other.close();}
    const resetResponse=page.waitForResponse(r=>r.url().endsWith('/resetPublicDemo')&&r.status()===200,{timeout:450000});
    page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Επαναφορά Demo',exact:true}).click();const reset=(await (await resetResponse).json()).result;assertResetAdvance(qualification,tenant,reset);c.changed=false;
    await page.waitForURL(u=>u.hostname==='demo.shiftoryx.gr',{timeout:450000});await enter(page,tenant);await w.getByText('Εργαζόμενοι και απουσίες',{exact:true}).click();await expect(w.getByRole('button',{name:'Επεξεργασία στοιχείων',exact:true})).toHaveCount(staff[tenant]);await w.getByText('Εργαζόμενοι και απουσίες',{exact:true}).click();await w.getByRole('button',{name:'Φόρτωση ιστορικού',exact:true}).click();await expect(history.getByRole('article')).toHaveCount(0);record(tenant,'Demo Reset restores canonical roster and clears history');
    const fresh=await verifyCanonicalAfterReset(adapter,c,qualification,reset);observers.push(fresh);
    const privateEvidence=await requirePostResetPrivateEvidence(c,reset,privateCleanupEvidenceProvider);
    cleanup.push({tenant,generation:reset.generation,status:'PASS',privateEvidence});
    for(const operation of ['emp.create','emp.update','emp.active','emp.delete','abs.create','abs.update','abs.delete','ann.create','ann.delete','set.save','drf.save'])ensure(typedStages.has(operation),'UI_TYPED_PATH_SKIPPED');
    await page.getByRole('button',{name:'Αποσύνδεση',exact:true}).click();await page.waitForURL(u=>u.hostname==='demo.shiftoryx.gr');await enter(page,tenant);record(tenant,'logout and re-enter');assert.deepEqual(errors,[]);record(tenant,'no uncaught browser errors');await ctx.close();
  }
  console.log('HOSTED_BROWSER_CASES_COMPLETE checks='+results.length+' output='+output);
}catch(error){if(currentPage&&!currentPage.isClosed())await currentPage.screenshot({path:join(output,'failure.png')}).catch(()=>{});console.error('HOSTED_BROWSER_FAIL '+(error.code??'HOSTED_UI_FAILED'));status='FAIL';}
finally{
  await browser.close();
  for(const c of observers){if(c.changed){try{const reset=await resetQualificationTenant(adapter,c);const fresh=await verifyCanonicalAfterReset(adapter,c,qualification,reset);
    await adapter.close(fresh);const proof=await requirePostResetPrivateEvidence(c,reset,privateCleanupEvidenceProvider);cleanup.push({tenant:c.tenant,status:'PASS',generation:reset.generation,privateEvidence:proof});}
    catch(error){cleanup.push({tenant:c.tenant,status:'FAIL',code:error.code??'HOSTED_CLEANUP_FAILED'});status='FAIL';}}await adapter.close(c);}
  await writeFile(join(output,'results.json'),JSON.stringify({status,mode:'ACTUAL_HTTPS',qualificationSha:qualification.baseline.qualificationSha,baselineHash:qualification.baselineHash,results,cleanup},null,2));
  console.log('HOSTED_BROWSER_EVIDENCE='+output);
}
console.log('HOSTED_BROWSER_FINAL_STATUS='+status);
return {status,results,output};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{const qualification=loadHostedQualification(process.argv.slice(2));const result=await runHostedBrowserQualification(qualification);if(result.status!=='PASS')process.exitCode=1;}
  catch(error){console.error('HOSTED_PREFLIGHT_REFUSED '+(error.code??'HOSTED_INPUT'));process.exitCode=1;}
}
