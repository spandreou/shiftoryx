import { test, expect } from 'playwright/test';
import { makeDefaultConfigV3 } from '../src/services/schedulerV3Service.ts';
const url=process.env.E2E_BASE_URL||'http://127.0.0.1:5187';
for (const width of [390,1440]) test(`V3 draft and settings at ${width}px`,async({page},info)=>{
  await page.setViewportSize({width,height:900});
  await page.goto(url);await page.waitForFunction(()=>window.__gasStationSchedulerStore);
  await page.evaluate(config=>{
    const store=window.__gasStationSchedulerStore;store.getState().cleanupData();
    store.setState({isAdmin:true,adminUser:{uid:'test-owner',tenantId:'tenant-a'},isLoading:false,isAuthLoading:false,schedulerSchemaVersion:3,schedulerConfigV3:config,employees:[{id:'a',fullName:'Μαρία',isActive:true},{id:'b',fullName:'Νίκος',isActive:true}],absences:[]});
  },makeDefaultConfigV3('tenant-a'));
  const workspace=page.getByTestId('scheduler-v3-workspace');await expect(workspace).toBeVisible();
  await workspace.getByLabel('Ημερομηνία',{exact:true}).fill('2026-09-07');await workspace.getByRole('button',{name:'Δημιουργία',exact:true}).click();
  await expect(page.getByText('Προσχέδιο — επεξεργασία πριν τη δημοσίευση')).toBeVisible();
  await expect(page.getByRole('button',{name:'Αφαίρεση βάρδιας'})).toHaveCount(6);
  await page.getByRole('button',{name:'Αφαίρεση βάρδιας'}).first().click();
  await expect(page.getByRole('region', { name: 'Προειδοποιήσεις', exact: true })).toContainText('Κάλυψη 0/1');
  await expect(page.getByRole('button',{name:'Αποθήκευση προσχεδίου'})).toBeEnabled();
  await expect(page.getByRole('button',{name:'Δημοσίευση νέας έκδοσης'})).toBeDisabled();
  await page.getByLabel('Διάβασα τις προειδοποιήσεις και επιλέγω δημοσίευση.').check();
  await expect(page.getByRole('button',{name:'Δημοσίευση νέας έκδοσης'})).toBeEnabled();
  await page.getByText('Ρυθμίσεις και προφίλ εργαζομένων',{exact:true}).click();
  await expect(page.getByRole('form',{name:'Ρυθμίσεις προγράμματος V3'})).toBeVisible();
  await page.getByRole('button',{name:'Προσθήκη βάρδιας',exact:true}).click();
  await expect(page.getByRole('button',{name:'Διαγραφή Νέα βάρδια'})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  await workspace.screenshot({path:info.outputPath(`v3-${width}.png`)});
  await page.getByText('Προηγούμενα προγράμματα και εργαλεία',{exact:true}).click();
  await expect(page.getByText('Πίνακας Ανακοινώσεων',{exact:true})).toBeVisible();
  await expect(workspace.getByRole('button',{name:'Αφαίρεση βάρδιας'})).toHaveCount(5);
  const legacyWriteResults=await page.evaluate(async()=>{
    const state=window.__gasStationSchedulerStore.getState();
    return [await state.refreshPublicWeekSnapshot(),await state.refreshPublicMonthSnapshot({year:2026,month:8}),await state.clearMonthShifts({year:2026,month:8})];
  });
  expect(legacyWriteResults).toEqual([false,false,false]);
});
