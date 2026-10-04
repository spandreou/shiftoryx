import { writeAuditLog } from './auditLogService';
import { publicDemoEnabled } from '../demo/config';
import { browserDemoMutationTransport } from '../demo/browserMutationTransport.ts';

const SAFE_EXPORT_TYPES = new Set(['PDF', 'EXCEL', 'WORD', 'WHATSAPP', 'SCHEDULE']);
const SAFE_EXPORT_SCOPES = new Set(['WEEK', 'MONTH', 'SCHEDULE']);
const SAFE_ARCHIVE_ACTIONS = new Set(['', 'GENERATE', 'DOWNLOAD']);
const DEFAULT_TENANT_ID = 'bp-kallis';
const MAX_TEXT_LENGTH = 160;

function safeText(value, fallback = '') {
  const text = String(value || fallback || '').trim();
  return text.slice(0, MAX_TEXT_LENGTH);
}

function safeExportType(value) {
  const normalized = String(value || '').trim().toUpperCase();
  return SAFE_EXPORT_TYPES.has(normalized) ? normalized : 'SCHEDULE';
}

function safeExportScope(value) {
  const normalized = String(value || '').trim().toUpperCase();
  return SAFE_EXPORT_SCOPES.has(normalized) ? normalized : 'SCHEDULE';
}

function safeArchiveAction(value) {
  const normalized = String(value || '').trim().toUpperCase();
  return SAFE_ARCHIVE_ACTIONS.has(normalized) ? normalized : '';
}

function safeCount(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) && numericValue >= 0 ? Math.floor(numericValue) : 0;
}

function safeDateRange(value = {}) {
  const start = safeText(value.start);
  const end = safeText(value.end);
  return {
    start,
    end,
  };
}

export async function writeExportAuditLog({
  exportType,
  exportScope,
  tenantId = DEFAULT_TENANT_ID,
  uid = '',
  userEmail = '',
  dateRange = {},
  month = '',
  week = '',
  recordCount = 0,
  shiftCount = 0,
  fileName = '',
  archiveAction = '',
  status = 'SUCCESS',
} = {}) {
  try {
    const safeStatus = status === 'FAILED' ? 'FAILED' : 'SUCCESS';
    const safeTenantId = safeText(tenantId, DEFAULT_TENANT_ID) || DEFAULT_TENANT_ID;
    const safeType = safeExportType(exportType);
    const safeScope = safeExportScope(exportScope);
    const sanitizedArchiveAction = safeArchiveAction(archiveAction);

    if (publicDemoEnabled) {
      await browserDemoMutationTransport(safeTenantId).run('aud.export', {
        exportType: safeType, exportScope: safeScope, status: safeStatus,
      });
      return true;
    }

    await writeAuditLog({
      tenantId: safeTenantId,
      action: 'EXPORT',
      actor: {
        uid: safeText(uid),
        email: safeText(userEmail),
      },
      target: {
        collection: 'exports',
        id: '',
        scope: `${safeScope}:${safeType}`,
      },
      before: null,
      after: null,
      metadata: {
        exportType: safeType,
        exportScope: safeScope,
        tenantId: safeTenantId,
        dateRange: safeDateRange(dateRange),
        month: safeText(month),
        week: safeText(week),
        recordCount: safeCount(recordCount),
        shiftCount: safeCount(shiftCount),
        fileName: safeText(fileName),
        archiveAction: sanitizedArchiveAction,
        status: safeStatus,
      },
    });

    return true;
  } catch {
    throw new Error('Η εξαγωγή δεν ολοκληρώθηκε. Δοκίμασε ξανά.');
  }
}
