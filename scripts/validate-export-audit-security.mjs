import { readFileSync } from 'node:fs';

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function loadExportAuditServiceWithAuditStub(source) {
  const auditStubSource = `
    export const auditCalls = [];
    export async function writeAuditLog(payload) {
      auditCalls.push(payload);
      return { id: 'audit-test-entry' };
    }
  `;
  const auditStubUrl = `data:text/javascript;base64,${Buffer.from(auditStubSource).toString('base64')}`;
  const demoConfigStubUrl = `data:text/javascript;base64,${Buffer.from('export const publicDemoEnabled = false;').toString('base64')}`;
  const mutationStubUrl = `data:text/javascript;base64,${Buffer.from('export function browserDemoMutationTransport() { throw new Error("Normal export cannot use demo transport"); }').toString('base64')}`;
  const instrumentedSource = source.replace(
    "from './auditLogService';",
    `from '${auditStubUrl}';`,
  ).replace("from '../demo/config';",`from '${demoConfigStubUrl}';`)
    .replace("from '../demo/browserMutationTransport.ts';",`from '${mutationStubUrl}';`);

  assert(instrumentedSource !== source, 'Export audit behavior test must replace the normal Firestore audit boundary.');
  assert(!instrumentedSource.includes("from '../demo/config';") &&
    !instrumentedSource.includes("from '../demo/browserMutationTransport.ts';"),
  'Normal export test must isolate demo-only imports without bypassing the normal audit assertion.');

  return {
    auditStub: await import(auditStubUrl),
    exportAudit: await import(`data:text/javascript;base64,${Buffer.from(instrumentedSource).toString('base64')}`),
  };
}

function matchBlock(source, collectionName) {
  const marker = `match /${collectionName}/`;
  const start = source.indexOf(marker);
  if (start === -1) return '';
  const next = source.indexOf('\n    match /', start + marker.length);
  return source.slice(start, next === -1 ? undefined : next);
}

function matchIndentedBlockByMarker(source, marker) {
  const start = source.indexOf(marker);
  if (start === -1) return '';
  const lineStart = source.lastIndexOf('\n', start) + 1;
  const indent = source.slice(lineStart, start);
  const nextPattern = new RegExp(`\\n${indent.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}match\\s+/`, 'g');
  nextPattern.lastIndex = start + marker.length;
  const next = nextPattern.exec(source);
  return source.slice(start, next ? next.index : undefined);
}

const mainDashboard = read('src/components/scheduler/MainDashboard.jsx');
const weekToolbar = read('src/components/scheduler/WeekToolbar.jsx');
const firebaseConfig = read('src/firebase/config.js');
const exportService = read('src/utils/exportService.js');
const exportUtils = read('src/utils/exportUtils.js');
const exportAuditService = read('src/firebase/exportAuditService.js');
const monthlyArchiveService = read('src/firebase/monthlyScheduleArchiveService.js');
const programHistoryPanel = read('src/components/scheduler/ProgramHistoryPanel.jsx');
const repositories = read('src/repositories/index.js');
const firestoreRules = read('firestore.rules');
const storageRules = read('storage.rules');
const firebaseJson = JSON.parse(read('firebase.json'));
const envExample = read('.env.example');

const exportAuditBehavior = await loadExportAuditServiceWithAuditStub(exportAuditService);
await exportAuditBehavior.exportAudit.writeExportAuditLog({
  tenantId: 'bp-kallis',
  exportType: 'PDF',
  exportScope: 'MONTH',
  month: '2026-07',
  fileName: 'program_month_2026-07.pdf',
  archiveAction: 'DOWNLOAD',
});
assert(exportAuditBehavior.auditStub.auditCalls.length === 1, 'Export audit must write exactly one audit entry.');
assert(
  exportAuditBehavior.auditStub.auditCalls[0]?.tenantId === 'bp-kallis',
  'Export audit must forward the sanitized tenantId as the top-level tenant-scoped audit key.',
);

assert(repositories.includes('exportAuditRepository'), 'Repository exports must include exportAuditRepository.');
assert(repositories.includes('monthlyScheduleArchiveRepository'), 'Repository exports must include monthlyScheduleArchiveRepository.');
assert(exportAuditService.includes("action: 'EXPORT'"), 'Export audit service must write EXPORT action logs.');
assert(exportAuditService.includes("status: safeStatus"), 'Export audit logs must include safe status metadata.');
assert(exportAuditService.includes('archiveAction'), 'Export audit logs must include sanitized archive action metadata.');
assert(exportAuditService.includes('throw new Error(\'Η εξαγωγή δεν ολοκληρώθηκε. Δοκίμασε ξανά.\')'), 'Export audit failures must surface a generic safe error.');
assert(!/downloadUrl|signedUrl|publicUrl|storagePath|token|password|secret|fileContent|blob|base64/i.test(exportAuditService), 'Export audit service must not store secrets, URLs, private storage paths, file contents, blobs, or base64 data.');

assert(mainDashboard.includes('runAdminExportWithAudit'), 'MainDashboard must route exports through the shared admin audit guard.');
assert(mainDashboard.includes('exportAuditRepository'), 'MainDashboard must use exportAuditRepository.');
assert(mainDashboard.includes('exportAuthorization'), 'Export calls must pass an explicit export authorization object.');
assert(mainDashboard.includes('onBeforeDownload: async () =>'), 'Export calls must audit before the browser download starts.');
assert(mainDashboard.includes('adminUser?.uid'), 'Export authorization must be based on the existing admin user state.');
assert(!mainDashboard.includes('VITE_ADMIN_EMAIL') && !mainDashboard.includes('adminEmail ==='), 'Exports must not use email-based admin checks.');

assert(weekToolbar.includes('{isAdmin ? (') && weekToolbar.includes('<ExportDropdown'), 'Export dropdown must only render for admins.');
assert(!weekToolbar.includes('Read-only preview'), 'Non-admin toolbar must not show placeholder export/editing panels.');
assert(!weekToolbar.includes('Οριστικοποίηση Εβδομάδας') && !weekToolbar.includes('Finalize / Share'), 'Toolbar must not render legacy finalize/publish controls.');
assert(!mainDashboard.includes('handleFinalizeFromToolbar') && !mainDashboard.includes('finalizeCurrentWeek'), 'Dashboard must not wire legacy finalize actions.');
assert(!mainDashboard.includes('Το περιβάλλον είναι σε προβολή χωρίς δικαίωμα επεξεργασίας.'), 'Public dashboard must not show the read-only access banner.');
assert(!mainDashboard.includes('Τα admin-only actions είναι κλειδωμένα μέχρι login διαχειριστή.'), 'Public dashboard must not show admin-only lock banner text.');
assert(!mainDashboard.includes('HistoryView'), 'Attendance HistoryView must be removed from the dashboard UI.');
assert(!mainDashboard.includes('Ιστορικό Παρουσιών'), 'Attendance history label must not render from the dashboard.');
assert(mainDashboard.includes('ProgramHistoryPanel'), 'Dashboard must render the admin program history panel.');
assert(programHistoryPanel.includes('if (!isAdmin) return null;'), 'Program history panel must be admin-only.');
assert(programHistoryPanel.includes('Ιστορικό Προγραμμάτων'), 'Program history panel must be labeled for schedule history.');
assert(programHistoryPanel.includes('isMonthlyArchiveEnabled'), 'Monthly PDF archive UI must be gated by the feature flag.');

assert(exportService.includes('assertExportAuthorized'), 'Active exportService exports must require explicit authorization.');
assert(exportUtils.includes('assertExportAuthorized'), 'Legacy exportUtils exports must require explicit authorization.');
assert(exportService.includes("typeof onBeforeDownload !== 'function'"), 'Active exportService must require an audit callback.');
assert(exportUtils.includes("typeof onBeforeDownload !== 'function'"), 'Legacy exportUtils must require an audit callback.');
assert(exportService.includes("output = 'download'"), 'Active PDF export must default to browser download mode.');
assert(exportService.includes("output === 'blob'"), 'Active PDF export must support Blob mode for private archive upload.');
assert(exportService.includes("return doc.output('blob')"), 'Active PDF export Blob mode must return a Blob instead of downloading.');

assert(envExample.includes('VITE_ENABLE_MONTHLY_PDF_ARCHIVE=false'), 'Monthly PDF archive feature flag must exist and default false.');
assert(firebaseJson.storage?.rules === 'storage.rules', 'firebase.json must include Storage rules deployment config.');
assert(monthlyArchiveService.includes('tenants/${safeTenant}/monthly_schedule_pdfs/${safeYearMonth}/program_month_${safeYearMonth}.pdf'), 'Monthly archives must use tenant-scoped private Storage paths.');
assert(monthlyArchiveService.includes('uploadBytes') && monthlyArchiveService.includes('getBlob'), 'Monthly archive service must upload and fetch private blobs through Firebase Storage.');
assert(!/getDownloadURL|downloadUrl|signedUrl|publicUrl/i.test(monthlyArchiveService), 'Monthly archive service must not create public or signed URLs.');
assert(firebaseConfig.includes("getStorage(app, `gs://${firebaseEnv.storageBucket}`)"), 'Firebase Storage must be initialized with the configured bucket explicitly.');
assert(!firebaseConfig.includes("replace(/\\.firebasestorage\\.app$/i, '.appspot.com')"), 'Firebase config must not rewrite firebasestorage.app buckets to appspot.com.');

const auditBlock = matchBlock(firestoreRules, 'audit_logs');
assert(auditBlock.includes('allow read, write: if false;'), 'Legacy root audit_logs must deny all client access.');

const tenantAuditBlock = matchIndentedBlockByMarker(firestoreRules, 'match /auditLogs/{auditLogId}');
assert(tenantAuditBlock.includes('allow read: if isTenantAdmin(tenantId);'), 'Tenant audit logs must be readable only by matching tenant admins.');
assert(tenantAuditBlock.includes('allow create: if isTenantAdmin(tenantId) && validAuditLog();'), 'Tenant audit logs must be creatable only by matching tenant admins.');
assert(tenantAuditBlock.includes('allow update, delete: if false;'), 'Tenant audit logs must be immutable from clients.');

const monthlyExportsBlock = matchBlock(firestoreRules, 'monthly_schedule_exports');
assert(monthlyExportsBlock.includes('allow read: if isTenantAdmin(resource.data.tenantId);'), 'Monthly schedule export metadata must be tenant-admin-read only.');
assert(monthlyExportsBlock.includes('allow create, update: if isTenantAdmin(request.resource.data.tenantId) && validMonthlyScheduleExport(exportId);'), 'Monthly schedule export metadata writes must be tenant-admin-only and validated.');
assert(!monthlyExportsBlock.includes('allow read: if true;'), 'Monthly schedule export metadata must not be publicly readable.');
assert(storageRules.includes('match /tenants/{tenantId}/monthly_schedule_pdfs/{yearMonth}/{fileName}'), 'Storage rules must define tenant monthly PDF archive path.');
assert(storageRules.includes('allow read: if isTenantAdmin(tenantId)'), 'Storage archive PDFs must be tenant-admin-read only.');
assert(storageRules.includes('allow write: if isTenantAdmin(tenantId)'), 'Storage archive PDFs must be tenant-admin-write only.');
assert(storageRules.includes("request.resource.contentType == 'application/pdf'"), 'Storage archive writes must require PDF content type.');
assert(!storageRules.includes('allow read: if true;'), 'Storage rules must not expose public reads.');

console.log('Export audit security checks passed');
