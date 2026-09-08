import { AlertTriangle, Info, PanelLeft, Plus, RefreshCw, WifiOff, X } from 'lucide-react';
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { WEEKDAY_LABELS } from '../../data/constants';
import { useSchedulerStore } from '../../hooks/useSchedulerStore';
import useResizableLayout from '../../hooks/useResizableLayout';
import useToastQueue from '../../hooks/useToastQueue';
import { exportAuditRepository, monthlyScheduleArchiveRepository, runtimeEnvironmentRepository } from '../../repositories';
import { calculateWeeklyTotals, getShiftTypeLabel, SHIFT_TYPES } from '../../utils/analytics';
import { createDynamicImportRecoveryError, requestDynamicImportRecovery } from '../../utils/dynamicImportRecovery';
import { getMonthDays } from '../../utils/scheduleUtils';
import { getCurrentTenantHostContext } from '../../utils/tenantHostContext';
import { formatDateGreek, getIsoDate, getMonday, getWeekDays } from '../../utils/time';
import { buildWhatsappSummary } from '../../utils/whatsappExport';
import AnnouncementBoard from './AnnouncementBoard';
import AnalyticsPanel from './AnalyticsPanel';
import ProgramHistoryPanel from './ProgramHistoryPanel';
import SchedulingRulesPanel from './SchedulingRulesPanel';
import SchedulerWorkspaceV3, { SchedulerSetupV3 } from './SchedulerWorkspaceV3';
import { isSchedulerV3Active } from '../../services/schedulerV3Service.ts';
import { validateSchedulerConfigV3 } from '../../scheduler-engine-v3/config.ts';
import SchedulerSidebar from './SchedulerSidebar';
import SpecialDaysPanel from './SpecialDaysPanel';
import UndoSnackbar from './UndoSnackbar';
import WeekToolbar from './WeekToolbar';
import WeeklyGrid from './WeeklyGrid';
import ToastStack from '../feedback/ToastStack';

const AdminLoginModal = lazy(() => import('./AdminLoginModal'));
const AdminDndShell = lazy(() => import('./AdminDndShell'));
const EmployeeProfileModal = lazy(() => import('./EmployeeProfileModal'));

const isFirebaseConfigured = runtimeEnvironmentRepository.isPersistenceConfigured();
const firebaseConfigErrorMessage = runtimeEnvironmentRepository.getPersistenceErrorMessage();
const adminEmail = runtimeEnvironmentRepository.getConfiguredAdminEmail();
const isDemoMode = runtimeEnvironmentRepository.isDemoMode();
const isMonthlyPdfArchiveEnabled = runtimeEnvironmentRepository.isMonthlyPdfArchiveEnabled();

let exportServicePromise;

function loadExportService() {
  if (!exportServicePromise) {
    exportServicePromise = import('../../utils/exportService').catch((error) => {
      exportServicePromise = undefined;
      if (requestDynamicImportRecovery(error)) {
        throw createDynamicImportRecoveryError();
      }
      throw error;
    });
  }
  return exportServicePromise;
}

function createWeekFingerprint(weekShifts = []) {
  return (weekShifts || [])
    .map(
      (shift) =>
        [
          shift.id || '',
          shift.employeeId || '',
          shift.date || '',
          shift.startTime || '',
          shift.endTime || '',
          shift.type || '',
          shift.shiftType || '',
          shift.label || '',
        ].join('|'),
    )
    .join('||');
}

function getMonthCalendarDays(monthDays = []) {
  if (!monthDays.length) return [];
  const firstWeekStart = getIsoDate(getMonday(new Date(`${monthDays[0]}T00:00:00`)));
  const lastMonthDay = monthDays[monthDays.length - 1];
  const lastWeekStart = getIsoDate(getMonday(new Date(`${lastMonthDay}T00:00:00`)));
  const lastWeekDays = getWeekDays(lastWeekStart);
  const lastVisibleDay = lastWeekDays[6] || lastMonthDay;
  const days = [];
  const cursor = new Date(`${firstWeekStart}T00:00:00`);
  const end = new Date(`${lastVisibleDay}T00:00:00`);
  let guard = 0;

  while (cursor <= end && guard < 42) {
    days.push(getIsoDate(cursor));
    cursor.setDate(cursor.getDate() + 1);
    guard += 1;
  }

  return days;
}

function dedupeShiftsByPublicKey(shifts = []) {
  const seen = new Set();
  const deduped = [];

  for (const shift of shifts || []) {
    const key = [
      shift?.id,
      shift?.date,
      shift?.startTime,
      shift?.endTime,
      shift?.employeeId,
      shift?.employeeName,
      shift?.type,
    ].filter(Boolean).join('|');
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(shift);
  }

  return deduped;
}

function downloadBlob(blob, fileName) {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = fileName || 'program_month.pdf';
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}

function humanizeStoreMessage(rawMessage) {
  const message = String(rawMessage || '').trim();
  if (!message) return '';
  const normalized = message.toLowerCase();

  if (normalized.includes('failed to clear week')) {
    return 'Δεν ολοκληρώθηκε ο καθαρισμός εβδομάδας. Μπορεί να έμειναν βάρδιες. Δοκίμασε ξανά.';
  }
  if (normalized.includes('failed to clear month')) {
    return 'Δεν ολοκληρώθηκε ο καθαρισμός μήνα. Μπορεί να έμειναν βάρδιες. Δοκίμασε ξανά.';
  }
  if (normalized.includes('failed to create shift')) {
    return 'Η βάρδια δεν αποθηκεύτηκε. Έλεγξε τα στοιχεία και δοκίμασε ξανά.';
  }
  if (normalized.includes('overlapping shift')) {
    return 'Υπάρχει επικάλυψη βάρδιας για τον ίδιο υπάλληλο. Διόρθωσε τις ώρες και ξαναπροσπάθησε.';
  }
  if (normalized.includes('template') || normalized.includes('custom βαρδι')) {
    return 'Δεν μπορέσαμε να φορτώσουμε τις custom βάρδιες. Οι κάρτες templates μπορεί να λείπουν προσωρινά, οπότε δεν θα μπορείς να τις αναθέσεις. Δοκίμασε ξανά φόρτωση ή ανανέωσε τη σελίδα.';
  }
  if (normalized.includes('history')) {
    return 'Δεν ενημερώθηκε πλήρως το ιστορικό. Οι τελευταίες αλλαγές μπορεί να μην εμφανίζονται άμεσα.';
  }
  if (normalized.includes('clipboard')) {
    return 'Δεν ήταν δυνατή η αντιγραφή στο clipboard. Έλεγξε τα δικαιώματα του browser και δοκίμασε ξανά.';
  }
  if (normalized.includes('pdf') || normalized.includes('excel') || normalized.includes('word')) {
    return 'Η εξαγωγή αρχείου απέτυχε. Δοκίμασε ξανά ή άλλαξε τύπο εξαγωγής.';
  }

  return message;
}

function splitStoreMessages(message) {
  return String(message || '')
    .split(/\s+\|\s+|\n+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatToastMessage(message, maxItems = 5) {
  const parts = splitStoreMessages(message);
  if (parts.length <= 1) return message;
  const visible = parts.slice(0, maxItems);
  const hiddenCount = parts.length - visible.length;
  return [
    ...visible.map((item) => `• ${item}`),
    ...(hiddenCount > 0 ? [`+${hiddenCount} ακόμη προειδοποιήσεις`] : []),
  ].join('\n');
}

function normalizeDashboardScheduleRole(value) {
  const token = `${value || ''}`
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
  if (token.includes('core1') || token.includes('core 1') || token.includes('core_a')) return 'core1';
  if (token.includes('core2') || token.includes('core 2') || token.includes('core_b')) return 'core2';
  if (token.includes('intermediate') || token.includes('coverage') || token.includes('ενδιαμεσ') || token.includes('καλυψ')) {
    return 'intermediate';
  }
  if (token.includes('core') || token.includes('βασ') || token.includes('σταθερ')) return 'core';
  return '';
}

function toActionError(error, fallbackMessage) {
  const rawMessage = error?.message || fallbackMessage;
  return humanizeStoreMessage(rawMessage) || fallbackMessage;
}

function classifyStoreFeedback(message) {
  const normalized = String(message || '').toLowerCase();
  if (!normalized) return 'info';

  const successSignals = ['αποθηκε', 'ολοκληρ', 'δημοσι', 'φορτώθηκε', 'αντιγράφηκε'];
  const errorSignals = ['αποτυχ', 'failed', 'error', 'cannot', 'unable'];
  const warningSignals = ['δεν ', 'επικάλυψη', 'κλειδω', 'προσοχή', 'μερικ'];

  if (errorSignals.some((keyword) => normalized.includes(keyword))) return 'error';
  if (warningSignals.some((keyword) => normalized.includes(keyword))) return 'warning';
  if (successSignals.some((keyword) => normalized.includes(keyword))) return 'success';
  return 'info';
}

function MessageBanner({
  icon: Icon = Info,
  tone = 'info',
  title,
  message,
  impact,
  nextAction,
  actionLabel,
  onAction,
}) {
  const toneClasses = {
    warning: 'border-amber-300/70 text-amber-900 dark:text-amber-100',
    danger: 'border-red-300/70 text-red-800 dark:text-red-200',
    info: 'border-slate-300/70 text-slate-800 dark:text-slate-100',
  };

  return (
    <div className={`glass-soft rounded-xl border p-3 ${toneClasses[tone] || toneClasses.info}`}>
      <div className="flex items-start gap-2">
        <Icon size={18} className="mt-0.5 shrink-0" />
        <div className="space-y-1.5">
          {title ? <p className="text-sm font-semibold">{title}</p> : null}
          <p className="text-sm">{message}</p>
          {impact ? <p className="text-xs opacity-90">{impact}</p> : null}
          {nextAction ? <p className="text-xs opacity-90">{nextAction}</p> : null}
          {actionLabel && typeof onAction === 'function' ? (
            <button
              type="button"
              onClick={onAction}
              className="inline-flex items-center gap-1 rounded-md border border-current/40 px-2 py-1 text-xs font-semibold hover:bg-white/35 dark:hover:bg-slate-900/45"
            >
              <RefreshCw size={12} />
              {actionLabel}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function MainDashboard() {
  const configV3 = useSchedulerStore(state => state.schedulerConfigV3);
  const versionV3 = useSchedulerStore(state => state.schedulerSchemaVersion);
  const [activeDragItem, setActiveDragItem] = useState(null);
  const [profileEmployee, setProfileEmployee] = useState(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [mobileSidebarSection, setMobileSidebarSection] = useState('employees');
  const [scheduleMode, setScheduleMode] = useState('week');
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [monthlyRoleConfig, setMonthlyRoleConfig] = useState({
    coreAId: '',
    coreBId: '',
    intermediateId: '',
  });
  const [quickAssignDraft, setQuickAssignDraft] = useState({
    open: false,
    employeeId: '',
    employeeName: '',
    date: '',
    startTime: '06:00',
    endTime: '14:00',
    type: SHIFT_TYPES.WORK,
  });
  const {
    sidebarWidth,
    sidebarMinWidth,
    sidebarMaxWidth,
    isResizingSidebar,
    mainPanelRef,
    scheduleDensity,
    shellWidthClass,
    handleSidebarResizeStart,
    handleSidebarResizeKeyDown,
  } = useResizableLayout();
  const [actionLoading, setActionLoading] = useState({});
  const [syncStatusOverride, setSyncStatusOverride] = useState({ status: 'saved', label: '' });
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isAdminTransitioning, setIsAdminTransitioning] = useState(false);
  const [monthlyArchives, setMonthlyArchives] = useState([]);
  const [isMonthlyArchiveLoading, setIsMonthlyArchiveLoading] = useState(false);
  const previousWeekFingerprintRef = useRef('');
  const skipNextUnsavedRef = useRef(false);

  const { toasts, pushToast, dismissToast } = useToastQueue({ maxVisible: 3 });

  const {
    employees,
    shifts,
    shiftTemplates,
    absences,
    weekHistory,
    weekTemplates,
    publishedSchedule,
    publishedSchedulesByWeek,
    publishedMonth,
    publishedMonthsByMonth,
    publicEmployees,
    publicAnnouncements,
    generatorRules,
    specialDaysByDate,
    selectedHistoryWeekId,
    selectedTemplateId,
    sundayRuleViolations,
    announcements,
    isAbsencesLoading,
    absencesWarningMessage,
    weekStart,
    isLoading,
    isAuthLoading,
    isSaving,
    warningMessage,
    errorMessage,
    isAdmin,
    adminUser,
    isLoginModalOpen,
    undoState,
    initializeData,
    cleanupData,
    addEmployee,
    editEmployee,
    deleteEmployee,
    createAbsence,
    updateAbsence,
    cancelAbsence,
    deleteAbsence,
    addShift,
    updateShiftDetails,
    deleteShift,
    clearDayShifts,
    clearWeekShifts,
    clearMonthShifts,
    goToPreviousWeek,
    goToNextWeek,
    goToCurrentWeek,
    setWeekFromDate,
    setWarningMessage,
    clearMessages,
    saveGeneratorRules,
    saveEmployeeSchedulingRules,
    upsertSpecialDay,
    removeSpecialDay,
    openLoginModal,
    closeLoginModal,
    loginAsAdmin,
    requestPasswordReset,
    logoutAdmin,
    undoLastAction,
    dismissUndo,
    addShiftTemplate,
    addAnnouncement,
    placeShiftTemplate,
    assignShiftFromTemplate,
    deleteAnnouncement,
    deleteShiftTemplate,
    setSelectedHistoryWeekId,
    setSelectedTemplateId,
    loadSelectedHistoryWeekToGrid,
    saveCurrentWeekManually,
    saveCurrentWeekAsTemplate,
    loadSelectedTemplateIntoCurrentWeek,
    generateMagicWeek,
    generateMagicMonth,
    toggleShiftManualOverride,
    startPublishedMonthSubscription,
    startPublishedScheduleSubscriptions,
  } = useSchedulerStore();

  useEffect(() => {
    initializeData();
    return () => cleanupData();
  }, [initializeData, cleanupData]);

  useEffect(() => {
    if (!undoState.visible) return;
    const timeoutId = setTimeout(() => dismissUndo(), 6000);
    return () => clearTimeout(timeoutId);
  }, [undoState.visible, dismissUndo]);

  const weekDays = useMemo(() => getWeekDays(weekStart), [weekStart]);
  const weekSet = useMemo(() => new Set(weekDays), [weekDays]);
  const monthInfo = useMemo(() => getMonthDays(selectedYear, selectedMonth), [selectedMonth, selectedYear]);
  const monthDays = monthInfo.days;
  const monthSet = useMemo(() => new Set(monthDays), [monthDays]);
  const monthCalendarDays = useMemo(() => getMonthCalendarDays(monthDays), [monthDays]);
  const monthCalendarSet = useMemo(() => new Set(monthCalendarDays), [monthCalendarDays]);
  const monthWeekStarts = useMemo(
    () => monthCalendarDays.filter((date, index) => index % 7 === 0),
    [monthCalendarDays],
  );

  const weekShifts = useMemo(
    () => shifts.filter((shift) => weekSet.has(shift.date)).sort((a, b) => a.date.localeCompare(b.date)),
    [shifts, weekSet],
  );
  const activePublishedSchedule = useMemo(() => {
    if (publishedSchedule?.weekStart === weekStart) return publishedSchedule;
    return publishedSchedulesByWeek?.[weekStart] || null;
  }, [publishedSchedule, publishedSchedulesByWeek, weekStart]);
  const publishedWeekShifts = useMemo(
    () =>
      (activePublishedSchedule?.shifts || [])
        .filter((shift) => weekSet.has(shift.date))
        .sort((a, b) => `${a.date}_${a.startTime}`.localeCompare(`${b.date}_${b.startTime}`)),
    [activePublishedSchedule, weekSet],
  );
  const weekFingerprint = useMemo(() => createWeekFingerprint(weekShifts), [weekShifts]);
  const monthShifts = useMemo(
    () => shifts.filter((shift) => monthSet.has(shift.date)).sort((a, b) => a.date.localeCompare(b.date)),
    [shifts, monthSet],
  );
  const monthCalendarShifts = useMemo(
    () => shifts.filter((shift) => monthCalendarSet.has(shift.date)).sort((a, b) => a.date.localeCompare(b.date)),
    [monthCalendarSet, shifts],
  );
  const selectedYearMonth = useMemo(
    () => `${String(selectedYear).padStart(4, '0')}-${String(selectedMonth + 1).padStart(2, '0')}`,
    [selectedMonth, selectedYear],
  );
  const activePublishedMonth = useMemo(() => {
    if (publishedMonth?.yearMonth === selectedYearMonth) return publishedMonth;
    return publishedMonthsByMonth?.[selectedYearMonth] || null;
  }, [publishedMonth, publishedMonthsByMonth, selectedYearMonth]);
  const publicMonthShifts = useMemo(
    () =>
      (activePublishedMonth?.shifts?.length ? activePublishedMonth.shifts : publishedWeekShifts)
        .filter((shift) => monthSet.has(shift.date)),
    [activePublishedMonth, monthSet, publishedWeekShifts],
  );
  const publicMonthCalendarShifts = useMemo(() => {
    const weekStartSet = new Set(monthWeekStarts);
    const cachedWeekShifts = Object.entries(publishedSchedulesByWeek || {})
      .filter(([publicWeekStart, schedule]) => weekStartSet.has(publicWeekStart) && schedule?.shifts?.length)
      .flatMap(([, schedule]) => schedule.shifts || []);

    return dedupeShiftsByPublicKey([
      ...(activePublishedMonth?.shifts || []),
      ...cachedWeekShifts,
      ...publishedWeekShifts,
    ])
      .filter((shift) => monthCalendarSet.has(shift.date))
      .sort((a, b) => `${a.date}_${a.startTime}`.localeCompare(`${b.date}_${b.startTime}`));
  }, [activePublishedMonth, monthCalendarSet, monthWeekStarts, publishedSchedulesByWeek, publishedWeekShifts]);
  const fallbackPublicEmployees = useMemo(() => {
    const employeeById = new Map();
    [...publishedWeekShifts, ...publicMonthCalendarShifts].forEach((shift, index) => {
      const key = shift.employeeName || `employee-${index}`;
      if (!key || employeeById.has(key)) return;
      employeeById.set(key, {
        id: key,
        fullName: shift.employeeName || 'Άγνωστος',
        role: 'Πρόγραμμα',
        isActive: true,
      });
    });
    return [...employeeById.values()].sort((a, b) => a.fullName.localeCompare(b.fullName, 'el'));
  }, [publishedWeekShifts, publicMonthCalendarShifts]);
  const displayEmployees = isAdmin ? employees : (publicEmployees?.length ? publicEmployees : fallbackPublicEmployees);
  const displayAnnouncements = isAdmin ? announcements : publicAnnouncements;
  const displayWeekShifts = isAdmin ? weekShifts : publishedWeekShifts;
  const displayMonthShifts = isAdmin ? monthShifts : publicMonthShifts;
  const displayMonthCalendarShifts = isAdmin ? monthCalendarShifts : publicMonthCalendarShifts;
  const visibleDays = scheduleMode === 'month' ? monthCalendarDays : weekDays;
  const visibleShifts = scheduleMode === 'month' ? displayMonthCalendarShifts : displayWeekShifts;
  const publicEmployeeIdByName = useMemo(() => {
    if (isAdmin) return new Map();
    return new Map(
      (displayEmployees || [])
        .filter((employee) => employee?.fullName && employee?.id)
        .map((employee) => [employee.fullName, employee.id]),
    );
  }, [displayEmployees, isAdmin]);
  const analyticsWeekShifts = useMemo(() => {
    if (isAdmin) return displayWeekShifts;
    return displayWeekShifts.map((shift) => ({
      ...shift,
      employeeId: shift.employeeId || publicEmployeeIdByName.get(shift.employeeName) || shift.employeeName || '',
    }));
  }, [displayWeekShifts, isAdmin, publicEmployeeIdByName]);
  const analyticsMonthShifts = useMemo(() => {
    if (isAdmin) return displayMonthShifts;
    return displayMonthShifts.map((shift) => ({
      ...shift,
      employeeId: shift.employeeId || publicEmployeeIdByName.get(shift.employeeName) || shift.employeeName || '',
    }));
  }, [displayMonthShifts, isAdmin, publicEmployeeIdByName]);
  const tenantHostContext = useMemo(() => getCurrentTenantHostContext(), []);
  const exportTenantId = tenantHostContext?.tenantSlug || 'bp-kallis';

  useEffect(() => {
    previousWeekFingerprintRef.current = weekFingerprint;
    setHasUnsavedChanges(false);
    setSyncStatusOverride((prev) => ({ ...prev, status: 'saved', label: '' }));
  }, [weekStart]);

  useEffect(() => {
    startPublishedMonthSubscription?.(selectedYearMonth);
  }, [selectedYearMonth, startPublishedMonthSubscription]);

  useEffect(() => {
    if (isAdmin || scheduleMode !== 'month' || !monthWeekStarts.length) return;
    startPublishedScheduleSubscriptions?.(monthWeekStarts);
  }, [isAdmin, monthWeekStarts, scheduleMode, startPublishedScheduleSubscriptions]);

  useEffect(() => {
    const previousFingerprint = previousWeekFingerprintRef.current;
    if (!previousFingerprint) {
      previousWeekFingerprintRef.current = weekFingerprint;
      return;
    }
    if (previousFingerprint === weekFingerprint) return;

    previousWeekFingerprintRef.current = weekFingerprint;
    if (!isAdmin) return;
    if (skipNextUnsavedRef.current) {
      skipNextUnsavedRef.current = false;
      return;
    }
    setHasUnsavedChanges(true);
  }, [isAdmin, weekFingerprint]);

  useEffect(() => {
    if (isAdmin) {
      setIsAdminTransitioning(false);
    }
  }, [isAdmin]);

  const weeklyAnalytics = useMemo(
    () => calculateWeeklyTotals(analyticsWeekShifts, displayEmployees, weekDays),
    [analyticsWeekShifts, displayEmployees, weekDays],
  );
  const monthlyAnalytics = useMemo(
    () => calculateWeeklyTotals(analyticsMonthShifts, displayEmployees, monthDays),
    [analyticsMonthShifts, displayEmployees, monthDays],
  );
  const analytics = scheduleMode === 'month' ? monthlyAnalytics : weeklyAnalytics;
  const hasExplicitEmployeeScheduleRoles = useMemo(
    () =>
      employees.some((employee) =>
        ['core1', 'core2', 'core', 'intermediate'].includes(
          normalizeDashboardScheduleRole(employee.scheduleRole || employee.roleType),
        ),
      ),
    [employees],
  );

  useEffect(() => {
    const activeEmployees = employees
      .filter((employee) => employee?.isActive !== false)
      .sort((a, b) => (a.fullName || '').localeCompare(b.fullName || '', 'el'));

    setMonthlyRoleConfig((prev) => {
      const validPrevCoreA = activeEmployees.some((item) => item.id === prev.coreAId) ? prev.coreAId : '';
      const coreAId = validPrevCoreA || activeEmployees[0]?.id || '';

      const validPrevCoreB =
        activeEmployees.some((item) => item.id === prev.coreBId) && prev.coreBId !== coreAId ? prev.coreBId : '';
      const coreBId = validPrevCoreB || activeEmployees.find((item) => item.id !== coreAId)?.id || '';

      const validPrevIntermediate =
        activeEmployees.some((item) => item.id === prev.intermediateId) &&
        prev.intermediateId !== coreAId &&
        prev.intermediateId !== coreBId
          ? prev.intermediateId
          : '';
      const intermediateId =
        validPrevIntermediate ||
        activeEmployees.find((item) => item.id !== coreAId && item.id !== coreBId)?.id ||
        '';

      if (coreAId === prev.coreAId && coreBId === prev.coreBId && intermediateId === prev.intermediateId) {
        return prev;
      }

      return { coreAId, coreBId, intermediateId };
    });
  }, [employees]);

  const loadMonthlyArchives = useCallback(async () => {
    if (!isAdmin || !isMonthlyPdfArchiveEnabled) {
      setMonthlyArchives([]);
      setIsMonthlyArchiveLoading(false);
      return;
    }

    setIsMonthlyArchiveLoading(true);
    try {
      const archives = await monthlyScheduleArchiveRepository.list({ tenantId: exportTenantId });
      setMonthlyArchives(archives);
    } catch {
      setMonthlyArchives([]);
      pushToast({
        type: 'warning',
        title: 'Προσοχή',
        message: 'Δεν φορτώθηκε το ιστορικό PDF μηνών.',
      });
    } finally {
      setIsMonthlyArchiveLoading(false);
    }
  }, [exportTenantId, isAdmin, pushToast]);

  useEffect(() => {
    loadMonthlyArchives();
  }, [loadMonthlyArchives]);

  const handleToggleManualOverride = useCallback(
    (shiftId, value) => toggleShiftManualOverride({ shiftId, value }),
    [toggleShiftManualOverride],
  );

  const handleCloseProfileModal = useCallback(() => setProfileEmployee(null), []);

  const handleOpenAdminLogin = useCallback(() => {
    setIsAdminTransitioning(false);
    openLoginModal();
  }, [openLoginModal]);

  const handleCloseAdminLogin = useCallback(() => {
    setIsAdminTransitioning(false);
    closeLoginModal();
  }, [closeLoginModal]);

  const handleAdminLogin = useCallback(
    async (credentials) => {
      const success = await loginAsAdmin(credentials);
      if (success) {
        setIsAdminTransitioning(true);
      }
      return success;
    },
    [loginAsAdmin],
  );

  const handleLogoutAdmin = useCallback(async () => {
    setIsAdminTransitioning(false);
    await logoutAdmin();
  }, [logoutAdmin]);

  const setActionBusy = useCallback((actionKey, isBusy) => {
    setActionLoading((current) => ({ ...current, [actionKey]: isBusy }));
  }, []);

  const markSynced = useCallback(() => {
    skipNextUnsavedRef.current = true;
    previousWeekFingerprintRef.current = weekFingerprint;
    setHasUnsavedChanges(false);
    setLastSavedAt(new Date());
    setSyncStatusOverride({ status: 'saved', label: 'Αποθηκευμένο' });
  }, [weekFingerprint]);

  async function runActionWithFeedback({
    actionKey,
    execute,
    loadingMessage,
    successMessage,
    errorMessageFallback,
    pendingMessage = 'Εκτέλεση ενέργειας...',
    markAsSynced = false,
    retryAction,
  }) {
    setActionBusy(actionKey, true);
    setSyncStatusOverride({ status: 'saving', label: pendingMessage });
    const loadingToast = loadingMessage
      ? pushToast({
          type: 'info',
          title: 'Σε εξέλιξη',
          message: loadingMessage,
          duration: 0,
          dedupe: false,
        })
      : null;

    try {
      const result = await execute();
      if (result === false || result === null) {
        const failureMessage = humanizeStoreMessage(errorMessageFallback);
        setSyncStatusOverride({ status: 'error', label: 'Η ενέργεια απέτυχε' });
        pushToast({
          type: 'error',
          title: 'Αποτυχία',
          message: failureMessage,
          actionLabel: retryAction ? 'Δοκίμασε ξανά' : '',
          onAction: retryAction,
        });
        return false;
      }

      if (markAsSynced) {
        markSynced();
      } else {
        setSyncStatusOverride({ status: 'saved', label: '' });
      }

      const resolvedSuccessMessage =
        typeof successMessage === 'function' ? successMessage(result) : successMessage;
      if (resolvedSuccessMessage) {
        pushToast({ type: 'success', title: 'Έγινε', message: resolvedSuccessMessage });
      }
      return true;
    } catch (error) {
      const failureMessage = toActionError(error, errorMessageFallback);
      setSyncStatusOverride({ status: 'error', label: 'Η ενέργεια απέτυχε' });
      pushToast({
        type: 'error',
        title: 'Αποτυχία',
        message: failureMessage,
        actionLabel: retryAction ? 'Δοκίμασε ξανά' : '',
        onAction: retryAction,
      });
      return false;
    } finally {
      if (loadingToast?.id) {
        dismissToast(loadingToast.id);
      }
      setActionBusy(actionKey, false);
    }
  }

  async function handleDragEnd(event) {
    const { active, over } = event;
    setActiveDragItem(null);

    if (!isAdmin || !active || !over) return;

    const activeData = active.data.current;
    const overData = over.data.current;

    if (activeData?.type === 'employee' && overData?.type === 'day-box') {
      const employeeId = activeData.employee?.id;
      const employeeName = activeData.employee?.fullName || '';
      const date = overData.day?.date || '';
      if (!employeeId || !date) return;

      setQuickAssignDraft({
        open: true,
        employeeId,
        employeeName,
        date,
        startTime: '06:00',
        endTime: '14:00',
        type: SHIFT_TYPES.WORK,
      });
      return;
    }

    if (activeData?.type === 'employee' && overData?.type === 'template-assignment') {
      await assignShiftFromTemplate({
        templateId: overData.template?.id,
        employeeId: activeData.employee?.id,
      });
      return;
    }

    if (activeData?.type === 'shift-template' && overData?.type === 'day-box') {
      const template = activeData.template;
      const date = overData.day?.date;
      if (!template || !date) return;

      await placeShiftTemplate({ templateId: template.id, date });
    }
  }

  function handleDragStart(event) {
    if (!isAdmin) return;
    const activeData = event.active.data.current;

    if (activeData?.type === 'employee') {
      setActiveDragItem({ type: 'employee', label: activeData.employee.fullName });
      return;
    }

    if (activeData?.type === 'shift-template') {
      const template = activeData.template;
      setActiveDragItem({
        type: 'shift-template',
        label: `${template.label} (${template.startTime}-${template.endTime})`,
      });
    }
  }

  async function handleCopyWhatsapp() {
    await runActionWithFeedback({
      actionKey: 'copyWhatsapp',
      execute: async () => {
        createExportAuthorization();
        const text = buildWhatsappSummary({
          shifts: displayWeekShifts,
          employees: displayEmployees,
          weekDays,
          weekdayLabels: WEEKDAY_LABELS,
        });
        await writeExportAudit({
          exportType: 'WHATSAPP',
          exportScope: 'WEEK',
          dateRange: getDateRangeForDays(weekDays),
          week: weekDays[0] || '',
          recordCount: displayWeekShifts.length,
          shiftCount: displayWeekShifts.length,
          status: 'SUCCESS',
        });
        await navigator.clipboard.writeText(text);
        return true;
      },
      successMessage: 'Το πρόγραμμα αντιγράφηκε στο clipboard για WhatsApp.',
      errorMessageFallback: 'Δεν ήταν δυνατή η αντιγραφή στο clipboard.',
      pendingMessage: 'Αντιγραφή προγράμματος...',
      retryAction: handleCopyWhatsapp,
    });
  }

  async function handleSaveProfile(profilePayload) {
    return editEmployee(profilePayload);
  }

  async function handleQuickAssignSave(event) {
    event.preventDefault();
    const { employeeId, date, startTime, endTime, type } = quickAssignDraft;
    if (!employeeId || !date) return;

    const shiftData = {
      employeeId,
      date,
      startTime,
      endTime,
      type,
      label: getShiftTypeLabel(type),
      trackUndo: true,
    };

    try {
      const saved = await addShift(shiftData);
      if (!saved) return;
      setQuickAssignDraft((prev) => ({ ...prev, open: false }));
    } catch (error) {
      setWarningMessage(error?.message || 'Αποτυχία αποθήκευσης ανάθεσης.');
    }
  }

  function getExportPayload() {
    return {
      weekDays,
      weekdayLabels: WEEKDAY_LABELS,
      shifts: displayWeekShifts,
      employees: displayEmployees,
    };
  }

  function createExportAuthorization() {
    if (!isAdmin || !adminUser?.uid) {
      throw new Error('Η εξαγωγή απαιτεί σύνδεση διαχειριστή.');
    }

    return {
      isAdmin: true,
      auditRequired: true,
    };
  }

  function getExportTenantId() {
    return exportTenantId;
  }

  function getDateRangeForDays(days = []) {
    return {
      start: days[0] || '',
      end: days[days.length - 1] || days[0] || '',
    };
  }

  function getMonthAuditLabel(year, month) {
    return `${year}-${String(month + 1).padStart(2, '0')}`;
  }

  async function writeExportAudit(metadata) {
    await exportAuditRepository.writeExportAuditLog({
      tenantId: getExportTenantId(),
      uid: adminUser?.uid || '',
      userEmail: adminUser?.email || '',
      ...metadata,
    });
  }

  async function createMonthlyArchiveSnapshot({ year, month, days, monthScheduleShifts }) {
    if (!isMonthlyPdfArchiveEnabled) return null;
    const exportAuthorization = createExportAuthorization();

    const { exportScheduleToPdf } = await loadExportService();
    const monthLabel = getMonthAuditLabel(year, month);
    const fileName = `program_month_${monthLabel}.pdf`;
    const pdfBlob = await exportScheduleToPdf({
      mode: 'month',
      output: 'blob',
      days,
      shifts: monthScheduleShifts,
      employees,
      absences,
      month,
      year,
      exportAuthorization,
    });

    const archive = await monthlyScheduleArchiveRepository.save({
      tenantId: getExportTenantId(),
      yearMonth: monthLabel,
      pdfBlob,
      createdBy: adminUser?.email || adminUser?.uid || '',
      shiftCount: monthScheduleShifts.length,
    });

    await writeExportAudit({
      exportType: 'PDF',
      exportScope: 'MONTH',
      dateRange: getDateRangeForDays(days),
      month: monthLabel,
      fileName,
      recordCount: monthScheduleShifts.length,
      shiftCount: monthScheduleShifts.length,
      archiveAction: 'GENERATE',
      status: 'SUCCESS',
    });

    await loadMonthlyArchives();
    return archive;
  }

  async function runAdminExportWithAudit({
    exportType,
    exportScope,
    days = [],
    month = '',
    week = '',
    fileName = '',
    recordCount = 0,
    shiftCount = 0,
    showSuccess,
    performExport,
  }) {
    const exportAuthorization = createExportAuthorization();

    await performExport({
      exportAuthorization,
      onBeforeDownload: async () => {
        await writeExportAudit({
          exportType,
          exportScope,
          dateRange: getDateRangeForDays(days),
          month,
          week,
          fileName,
          recordCount,
          shiftCount,
          status: 'SUCCESS',
        });

        if (typeof showSuccess === 'function') {
          await showSuccess();
        }
      },
    });

    return true;
  }

  async function showExportSuccessBeforeDownload({ title, message }) {
    pushToast({
      type: 'success',
      title,
      message,
      duration: 7000,
      dedupe: false,
    });

    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  async function handleExportWeekPdf() {
    await runActionWithFeedback({
      actionKey: 'exportWeekPdf',
      loadingMessage: 'Γίνεται εξαγωγή PDF εβδομάδας...',
      execute: async () => {
        const { exportScheduleToPdf } = await loadExportService();
        return runAdminExportWithAudit({
          exportType: 'PDF',
          exportScope: 'WEEK',
          days: weekDays,
          week: weekDays[0] || '',
          fileName: `program_week_pdf_${weekDays[0] || 'week'}_${weekDays[weekDays.length - 1] || 'end'}.pdf`,
          recordCount: displayWeekShifts.length,
          shiftCount: displayWeekShifts.length,
          showSuccess: () =>
            showExportSuccessBeforeDownload({
              title: 'Επιτυχής εξαγωγή PDF',
              message: 'Το PDF εβδομάδας δημιουργήθηκε και η λήψη ξεκινά.',
            }),
          performExport: ({ exportAuthorization, onBeforeDownload }) =>
            exportScheduleToPdf({
              mode: 'week',
              days: weekDays,
              shifts: displayWeekShifts,
              employees: displayEmployees,
              absences,
              exportAuthorization,
              onBeforeDownload,
            }),
        });
      },
      errorMessageFallback: 'Αποτυχία εξαγωγής PDF εβδομάδας.',
      pendingMessage: 'Εξαγωγή PDF εβδομάδας...',
      retryAction: handleExportWeekPdf,
    });
  }

  async function handleExportMonthPdf() {
    await runActionWithFeedback({
      actionKey: 'exportMonthPdf',
      loadingMessage: 'Γίνεται εξαγωγή PDF μήνα...',
      execute: async () => {
        const { exportScheduleToPdf } = await loadExportService();
        const monthLabel = getMonthAuditLabel(selectedYear, selectedMonth);
        return runAdminExportWithAudit({
          exportType: 'PDF',
          exportScope: 'MONTH',
          days: monthDays,
          month: monthLabel,
          fileName: `program_month_${monthLabel}.pdf`,
          recordCount: displayMonthShifts.length,
          shiftCount: displayMonthShifts.length,
          showSuccess: () =>
            showExportSuccessBeforeDownload({
              title: 'Επιτυχής εξαγωγή PDF',
              message: 'Το PDF μήνα δημιουργήθηκε και η λήψη ξεκινά.',
            }),
          performExport: ({ exportAuthorization, onBeforeDownload }) =>
            exportScheduleToPdf({
              mode: 'month',
              days: monthDays,
              shifts: displayMonthShifts,
              employees: displayEmployees,
              absences,
              month: selectedMonth,
              year: selectedYear,
              exportAuthorization,
              onBeforeDownload,
            }),
        });
      },
      errorMessageFallback: 'Αποτυχία εξαγωγής PDF μήνα.',
      pendingMessage: 'Εξαγωγή PDF μήνα...',
      retryAction: handleExportMonthPdf,
    });
  }

  async function handleCreateMonthlyArchiveSnapshot() {
    await runActionWithFeedback({
      actionKey: 'archiveMonthPdf',
      loadingMessage: 'Αποθήκευση PDF μήνα στο ιστορικό...',
      execute: async () => {
        await createMonthlyArchiveSnapshot({
          year: selectedYear,
          month: selectedMonth,
          days: monthDays,
          monthScheduleShifts: monthShifts,
        });
        return true;
      },
      successMessage: 'Το PDF μήνα αποθηκεύτηκε στο ιστορικό προγραμμάτων.',
      errorMessageFallback: 'Αποτυχία αποθήκευσης αρχείου ιστορικού.',
      pendingMessage: 'Αποθήκευση PDF μήνα...',
      retryAction: handleCreateMonthlyArchiveSnapshot,
    });
  }

  async function handleDownloadMonthlyArchive(archive) {
    await runActionWithFeedback({
      actionKey: 'downloadMonthlyArchive',
      loadingMessage: 'Γίνεται λήψη PDF μήνα...',
      execute: async () => {
        createExportAuthorization();
        await writeExportAudit({
          exportType: 'PDF',
          exportScope: 'MONTH',
          month: archive?.yearMonth || '',
          fileName: archive?.fileName || '',
          recordCount: archive?.shiftCount || 0,
          shiftCount: archive?.shiftCount || 0,
          archiveAction: 'DOWNLOAD',
          status: 'SUCCESS',
        });
        const blob = await monthlyScheduleArchiveRepository.fetchBlob({ storagePath: archive?.storagePath });
        downloadBlob(blob, archive?.fileName || `program_month_${archive?.yearMonth || 'month'}.pdf`);
        return true;
      },
      successMessage: 'Το μηνιαίο PDF κατέβηκε.',
      errorMessageFallback: 'Αποτυχία λήψης μηνιαίου PDF.',
      pendingMessage: 'Λήψη μηνιαίου PDF...',
      retryAction: () => handleDownloadMonthlyArchive(archive),
    });
  }

  async function handleExportExcel() {
    await runActionWithFeedback({
      actionKey: 'exportExcel',
      loadingMessage: 'Γίνεται εξαγωγή Excel...',
      execute: async () => {
        const { exportScheduleToExcel } = await loadExportService();
        return runAdminExportWithAudit({
          exportType: 'EXCEL',
          exportScope: 'WEEK',
          days: weekDays,
          week: weekDays[0] || '',
          fileName: `program_excel_${weekDays[0] || 'week'}_${weekDays[weekDays.length - 1] || 'end'}.xlsx`,
          recordCount: displayWeekShifts.length,
          shiftCount: displayWeekShifts.length,
          showSuccess: () =>
            showExportSuccessBeforeDownload({
              title: 'Επιτυχής εξαγωγή Excel',
              message: 'Το αρχείο Excel δημιουργήθηκε και η λήψη ξεκινά.',
            }),
          performExport: ({ exportAuthorization, onBeforeDownload }) =>
            exportScheduleToExcel({
              ...getExportPayload(),
              exportAuthorization,
              onBeforeDownload,
            }),
        });
      },
      errorMessageFallback: 'Αποτυχία εξαγωγής Excel.',
      pendingMessage: 'Εξαγωγή Excel...',
      retryAction: handleExportExcel,
    });
  }

  async function handleExportWord() {
    await runActionWithFeedback({
      actionKey: 'exportWord',
      loadingMessage: 'Γίνεται εξαγωγή Word...',
      execute: async () => {
        const { exportScheduleToWord } = await loadExportService();
        return runAdminExportWithAudit({
          exportType: 'WORD',
          exportScope: 'WEEK',
          days: weekDays,
          week: weekDays[0] || '',
          fileName: `program_word_${weekDays[0] || 'week'}_${weekDays[weekDays.length - 1] || 'end'}.docx`,
          recordCount: displayWeekShifts.length,
          shiftCount: displayWeekShifts.length,
          showSuccess: () =>
            showExportSuccessBeforeDownload({
              title: 'Επιτυχής εξαγωγή Word',
              message: 'Το αρχείο Word δημιουργήθηκε και η λήψη ξεκινά.',
            }),
          performExport: ({ exportAuthorization, onBeforeDownload }) =>
            exportScheduleToWord({
              ...getExportPayload(),
              exportAuthorization,
              onBeforeDownload,
            }),
        });
      },
      errorMessageFallback: 'Αποτυχία εξαγωγής Word.',
      pendingMessage: 'Εξαγωγή Word...',
      retryAction: handleExportWord,
    });
  }

  async function handleGenerateMonthlySchedule() {
    await runActionWithFeedback({
      actionKey: 'magicMonth',
      execute: async () => {
        const result = await generateMagicMonth({
          month: selectedMonth,
          year: selectedYear,
          roleConfig: hasExplicitEmployeeScheduleRoles ? {} : monthlyRoleConfig,
          rules: {
            ...generatorRules,
            specialDaysByDate,
          },
        });

        if (result?.ok && isMonthlyPdfArchiveEnabled) {
          try {
            await createMonthlyArchiveSnapshot({
              year: result.year,
              month: result.month,
              days: result.monthDays,
              monthScheduleShifts: result.shifts,
            });
          } catch {
            pushToast({
              type: 'warning',
              title: 'Προσοχή',
              message: 'Ο μήνας δημιουργήθηκε, αλλά δεν αποθηκεύτηκε το PDF ιστορικού. Δοκίμασε ξανά από το Ιστορικό Προγραμμάτων.',
              duration: 9000,
            });
          }
        }

        return result;
      },
      successMessage: 'Ο μηνιαίος προγραμματισμός ολοκληρώθηκε.',
      errorMessageFallback: 'Αποτυχία αυτόματης δημιουργίας μηνιαίου προγράμματος.',
      pendingMessage: 'Δημιουργία μηνιαίου προγράμματος...',
      retryAction: handleGenerateMonthlySchedule,
      markAsSynced: true,
    });
  }

  async function handleSaveSpecialDay(payload) {
    await upsertSpecialDay(payload);
  }

  const handleSaveTemplateFromToolbar = useCallback(
    async (name) => {
      if (!name) return;
      await runActionWithFeedback({
        actionKey: 'saveTemplate',
        execute: () => saveCurrentWeekAsTemplate(name),
        successMessage: 'Το πρότυπο αποθηκεύτηκε.',
        errorMessageFallback: 'Αποτυχία αποθήκευσης προτύπου.',
        pendingMessage: 'Αποθήκευση προτύπου...',
      });
    },
    [runActionWithFeedback, saveCurrentWeekAsTemplate],
  );

  const handleSaveWeekFromToolbar = useCallback(
    () =>
      runActionWithFeedback({
        actionKey: 'saveWeek',
        execute: saveCurrentWeekManually,
        successMessage: (result) =>
          result?.publicUpdated === false
            ? 'Η εβδομάδα αποθηκεύτηκε, αλλά η δημόσια προβολή δεν ενημερώθηκε.'
            : 'Η εβδομάδα αποθηκεύτηκε.',
        errorMessageFallback: 'Αποτυχία αποθήκευσης εβδομάδας.',
        pendingMessage: 'Αποθήκευση εβδομάδας...',
        markAsSynced: true,
      }),
    [runActionWithFeedback, saveCurrentWeekManually],
  );

  const handleMagicWeekFromToolbar = useCallback(
    () =>
      runActionWithFeedback({
        actionKey: 'magicWeek',
        execute: generateMagicWeek,
        successMessage: 'Η αυτόματη δημιουργία εβδομάδας ολοκληρώθηκε.',
        errorMessageFallback: 'Αποτυχία αυτόματης δημιουργίας εβδομάδας.',
        pendingMessage: 'Δημιουργία εβδομαδιαίου προγράμματος...',
        markAsSynced: true,
      }),
    [generateMagicWeek, runActionWithFeedback],
  );

  const handleClearWeekFromToolbar = useCallback(
    () =>
      runActionWithFeedback({
        actionKey: 'clearWeek',
        execute: clearWeekShifts,
        successMessage: 'Η εβδομάδα καθαρίστηκε.',
        errorMessageFallback: 'Αποτυχία καθαρισμού εβδομάδας.',
        pendingMessage: 'Καθαρισμός εβδομάδας...',
      }),
    [clearWeekShifts, runActionWithFeedback],
  );

  const handleClearMonthFromToolbar = useCallback(
    () =>
      runActionWithFeedback({
        actionKey: 'clearMonth',
        execute: () => clearMonthShifts({ year: selectedYear, month: selectedMonth }),
        successMessage: (result) =>
          result?.removedCount === 0
            ? 'Δεν βρέθηκαν βάρδιες για καθαρισμό στον επιλεγμένο μήνα.'
            : `Ο μήνας καθαρίστηκε (${result?.removedCount ?? 0} βάρδιες).`,
        errorMessageFallback: 'Αποτυχία καθαρισμού μήνα.',
        pendingMessage: 'Καθαρισμός μήνα...',
      }),
    [clearMonthShifts, runActionWithFeedback, selectedMonth, selectedYear],
  );

  const handleLoadTemplateFromToolbar = useCallback(
    () =>
      runActionWithFeedback({
        actionKey: 'loadTemplate',
        execute: loadSelectedTemplateIntoCurrentWeek,
        successMessage: 'Το πρότυπο φορτώθηκε στην εβδομάδα.',
        errorMessageFallback: 'Αποτυχία φόρτωσης προτύπου.',
        pendingMessage: 'Φόρτωση προτύπου...',
        markAsSynced: true,
      }),
    [loadSelectedTemplateIntoCurrentWeek, runActionWithFeedback],
  );

  const handleRetryDataLoad = useCallback(() => {
    clearMessages();
    cleanupData();
    initializeData();
  }, [clearMessages, cleanupData, initializeData]);

  useEffect(() => {
    if (!errorMessage) return;
    const readableError = humanizeStoreMessage(errorMessage);
    pushToast({
      type: 'error',
      title: 'Πρόβλημα φόρτωσης',
      message: readableError,
      actionLabel: isFirebaseConfigured ? 'Δοκίμασε ξανά' : '',
      onAction: isFirebaseConfigured ? handleRetryDataLoad : undefined,
    });
    setSyncStatusOverride({ status: 'error', label: 'Σφάλμα συγχρονισμού' });
  }, [errorMessage, handleRetryDataLoad, pushToast]);

  useEffect(() => {
    if (!warningMessage) return;
    const tone = classifyStoreFeedback(warningMessage);
    const readableWarning = humanizeStoreMessage(warningMessage);
    const warningParts = splitStoreMessages(readableWarning);
    pushToast({
      type: tone,
      title:
        tone === 'success'
          ? 'Ολοκληρώθηκε'
          : tone === 'error'
            ? 'Αποτυχία'
            : tone === 'warning'
              ? warningParts.length > 1
                ? `Προσοχή (${warningParts.length})`
                : 'Προσοχή'
              : 'Ενημέρωση',
      message: formatToastMessage(readableWarning),
      duration: tone === 'warning' && warningParts.length > 1 ? 0 : undefined,
    });
  }, [pushToast, warningMessage]);

  useEffect(() => {
    if (!isAdmin) {
      setSyncStatusOverride({ status: 'saved', label: '' });
      return;
    }
    if (isSaving) {
      setSyncStatusOverride({ status: 'saving', label: 'Αποθήκευση...' });
      return;
    }
    if (syncStatusOverride.status === 'error') return;
    if (hasUnsavedChanges) {
      setSyncStatusOverride({ status: 'unsaved', label: 'Μη αποθηκευμένες αλλαγές' });
      return;
    }
    setSyncStatusOverride({ status: 'saved', label: '' });
  }, [hasUnsavedChanges, isAdmin, isSaving, syncStatusOverride.status]);

  const normalizedErrorMessage = humanizeStoreMessage(errorMessage);
  const normalizedWarningMessage = humanizeStoreMessage(warningMessage);

  const warningFeedbackTone = classifyStoreFeedback(warningMessage);

  const prioritizedStatusBanner = errorMessage
    ? {
        tone: 'danger',
        title: 'Δεν φορτώθηκαν πλήρως τα δεδομένα',
        message: normalizedErrorMessage,
        impact: 'Κάποια στοιχεία του scheduler μπορεί να είναι ελλιπή ή μη ενημερωμένα.',
        nextAction: 'Δοκίμασε ξανά φόρτωση. Αν επιμένει, έλεγξε σύνδεση ή ρυθμίσεις Firebase.',
        actionLabel: 'Δοκίμασε ξανά',
        onAction: isFirebaseConfigured ? handleRetryDataLoad : undefined,
      }
    : warningMessage && warningFeedbackTone === 'warning'
      ? {
          tone: 'warning',
          title: 'Χρειάζεται προσοχή',
          message: normalizedWarningMessage,
          impact: 'Η τελευταία ενέργεια ίσως ολοκληρώθηκε μερικώς.',
          nextAction: 'Έλεγξε τα στοιχεία που επηρεάζονται και επανάλαβε αν χρειάζεται.',
        }
      : null;

  const syncStatus = useMemo(() => {
    if (syncStatusOverride.status === 'saved' && lastSavedAt) {
      return {
        status: 'saved',
        label: `Αποθηκευμένο ${lastSavedAt.toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit' })}`,
      };
    }
    return {
      status: syncStatusOverride.status,
      label: syncStatusOverride.label,
    };
  }, [lastSavedAt, syncStatusOverride.label, syncStatusOverride.status]);

  if (isLoading || isAuthLoading) {
    return <p className="p-8 text-center font-medium text-slate-900 dark:text-slate-100">Φόρτωση προγράμματος...</p>;
  }

  const v3Active = isAdmin && isSchedulerV3Active(import.meta.env.VITE_ENABLE_SCHEDULER_V3, versionV3);
  const v3Workspace = v3Active ? (validateSchedulerConfigV3(configV3).valid
    ? <SchedulerWorkspaceV3 key={`${configV3.tenantId}:${adminUser?.uid}`} config={configV3} employees={employees} absences={absences} uid={adminUser?.uid} onLogout={handleLogoutAdmin} />
    : <p role="alert">Οι ρυθμίσεις V3 δεν είναι έγκυρες. Χρειάζεται διόρθωση πριν τη δημιουργία προγράμματος.</p>) : null;

  const dashboardContent = (
    <>
      <main className={`scheduler-layout-shell mx-auto flex w-full ${shellWidthClass} flex-col gap-4 px-3 py-4 text-slate-900 sm:gap-5 sm:px-4 lg:px-5 xl:w-[calc(100%-24px)] 2xl:px-6 dark:text-slate-100`}>
        <WeekToolbar
          weekDays={weekDays}
          weekTemplates={weekTemplates}
          selectedTemplateId={selectedTemplateId}
          selectedMonth={selectedMonth}
          selectedYear={selectedYear}
          isAdmin={isAdmin}
          isAdminTransitioning={isAdminTransitioning}
          onOpenAdminLogin={handleOpenAdminLogin}
          onLogoutAdmin={handleLogoutAdmin}
          onSaveWeek={handleSaveWeekFromToolbar}
          onSaveTemplate={handleSaveTemplateFromToolbar}
          onSelectTemplate={setSelectedTemplateId}
          onLoadSelectedTemplate={handleLoadTemplateFromToolbar}
          onCopyWhatsapp={handleCopyWhatsapp}
          onClearWeek={handleClearWeekFromToolbar}
          onClearMonth={handleClearMonthFromToolbar}
          onMagicWand={handleMagicWeekFromToolbar}
          onExportWeekPdf={handleExportWeekPdf}
          onExportMonthPdf={handleExportMonthPdf}
          onExportExcel={handleExportExcel}
          onExportWord={handleExportWord}
          syncStatus={syncStatus}
          actionLoading={actionLoading}
        />

        {!isFirebaseConfigured ? (
          <MessageBanner
            icon={WifiOff}
            tone="warning"
            title="Το Firebase δεν είναι έτοιμο"
            message={firebaseConfigErrorMessage || 'Η σύνδεση με τη βάση δεν είναι διαθέσιμη.'}
            impact="Το dashboard εμφανίζεται, αλλά δεδομένα και αποθήκευση μπορεί να λείπουν."
            nextAction="Έλεγξε τα env vars στο local ή στο deployment environment."
          />
        ) : null}

        {prioritizedStatusBanner ? (
          <MessageBanner
            icon={AlertTriangle}
            tone={prioritizedStatusBanner.tone}
            title={prioritizedStatusBanner.title}
            message={prioritizedStatusBanner.message}
            impact={prioritizedStatusBanner.impact}
            nextAction={prioritizedStatusBanner.nextAction}
            actionLabel={prioritizedStatusBanner.actionLabel}
            onAction={prioritizedStatusBanner.onAction}
          />
        ) : null}

        <div
          className={`flex w-full min-w-0 flex-col items-stretch gap-4 lg:gap-5 xl:flex-row ${isResizingSidebar ? 'select-none' : ''}`}
          style={{ '--scheduler-sidebar-width': `${sidebarWidth}px` }}
        >
          <div className="order-1 min-w-0 xl:order-1 xl:w-[var(--scheduler-sidebar-width)] xl:basis-[var(--scheduler-sidebar-width)] xl:shrink-0">
            <div className="hidden md:block">
              <SchedulerSidebar
                employees={displayEmployees}
                shiftTemplates={shiftTemplates}
                absences={absences}
                isAbsencesLoading={isAbsencesLoading}
                absencesWarningMessage={absencesWarningMessage}
                weekDays={weekDays}
                visibleDays={visibleDays}
                isAdmin={isAdmin}
                isSaving={isSaving}
                scheduleMode={scheduleMode}
                onModeChange={setScheduleMode}
                selectedMonth={selectedMonth}
                selectedYear={selectedYear}
                analytics={analytics}
                onAddEmployee={addEmployee}
                onDeleteEmployee={deleteEmployee}
                onOpenAdminLogin={handleOpenAdminLogin}
                onOpenProfile={setProfileEmployee}
                onCreateAbsence={createAbsence}
                onUpdateAbsence={updateAbsence}
                onCancelAbsence={cancelAbsence}
                onDeleteAbsence={deleteAbsence}
                onAddShiftTemplate={addShiftTemplate}
                onDeleteShiftTemplate={deleteShiftTemplate}
                onCreateShift={addShift}
              />
            </div>
          </div>

          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Αλλαγή πλάτους sidebar"
            aria-valuemin={sidebarMinWidth}
            aria-valuemax={sidebarMaxWidth}
            aria-valuenow={sidebarWidth}
            tabIndex={0}
            onPointerDown={handleSidebarResizeStart}
            onKeyDown={handleSidebarResizeKeyDown}
            className={`order-2 hidden w-3 shrink-0 cursor-col-resize touch-none items-stretch justify-center rounded-full outline-none transition focus-visible:ring-2 focus-visible:ring-brand-300/70 xl:flex ${
              isResizingSidebar ? 'bg-brand-500/15' : 'hover:bg-slate-900/5 dark:hover:bg-cyan-300/10'
            }`}
          >
            <span className={`my-3 w-1 rounded-full transition ${isResizingSidebar ? 'bg-brand-500 dark:bg-cyan-300' : 'bg-slate-300 dark:bg-cyan-300/35'}`} />
          </div>

          <div ref={mainPanelRef} className="order-3 min-w-0 flex-1 xl:order-3">
            <div className="min-w-0 space-y-4 lg:space-y-5">
              <WeeklyGrid
                weekDays={weekDays}
                monthDays={monthDays}
                shifts={visibleShifts}
                shiftTemplates={shiftTemplates}
                employees={displayEmployees}
                weekHistory={weekHistory}
                weekTemplates={weekTemplates}
                selectedHistoryWeekId={selectedHistoryWeekId}
                selectedTemplateId={selectedTemplateId}
                selectedMonth={selectedMonth}
                selectedYear={selectedYear}
                scheduleMode={scheduleMode}
                monthlyRoleConfig={monthlyRoleConfig}
                sundayRuleViolations={sundayRuleViolations}
                specialDaysByDate={specialDaysByDate}
                onChangeScheduleMode={setScheduleMode}
                onSelectMonth={setSelectedMonth}
                onSelectYear={setSelectedYear}
                onChangeMonthlyRoleConfig={setMonthlyRoleConfig}
                onSelectHistoryWeek={setSelectedHistoryWeekId}
                onLoadSelectedHistoryWeek={loadSelectedHistoryWeekToGrid}
                onSaveAsTemplate={saveCurrentWeekAsTemplate}
                onSelectTemplate={setSelectedTemplateId}
                onLoadSelectedTemplate={loadSelectedTemplateIntoCurrentWeek}
                onMagicWand={generateMagicWeek}
                onGenerateMonthlySchedule={handleGenerateMonthlySchedule}
                onPrevWeek={goToPreviousWeek}
                onCurrentWeek={goToCurrentWeek}
                onNextWeek={goToNextWeek}
                onJumpToWeekDate={setWeekFromDate}
                onCreateShift={addShift}
                onUpdateShift={updateShiftDetails}
                onDeleteShift={deleteShift}
                onToggleManualOverride={handleToggleManualOverride}
                onDeleteShiftTemplate={deleteShiftTemplate}
                onClearDayShifts={clearDayShifts}
                canManage={isAdmin}
                isWeekLocked={false}
                isSaving={isSaving}
                density={scheduleDensity}
              />

              <AnnouncementBoard
                announcements={displayAnnouncements}
                isAdmin={isAdmin}
                isSaving={isSaving}
                onAddAnnouncement={addAnnouncement}
                onDeleteAnnouncement={deleteAnnouncement}
              />

              <div className={`grid gap-4 lg:gap-5 ${isAdmin ? 'xl:grid-cols-2' : ''}`}>
                <AnalyticsPanel
                  employees={displayEmployees}
                  mode={scheduleMode}
                  onModeChange={setScheduleMode}
                  selectedMonth={selectedMonth}
                  selectedYear={selectedYear}
                  totalsByEmployee={analytics.totalsByEmployee}
                  totalHours={analytics.totalHours}
                  leaveDaysByEmployee={analytics.leaveDaysByEmployee}
                  totalsByType={analytics.totalsByType}
                  shiftsCountByEmployee={analytics.shiftsCountByEmployee}
                  workBreakdownByEmployee={analytics.workBreakdownByEmployee}
                  showAbsenceBreakdown={isAdmin}
                />
                {isAdmin ? (
                  <ProgramHistoryPanel
                    isAdmin={isAdmin}
                    employees={employees}
                    weekHistory={weekHistory}
                    monthlyArchives={monthlyArchives}
                    isMonthlyArchiveEnabled={isMonthlyPdfArchiveEnabled}
                    isMonthlyArchiveLoading={isMonthlyArchiveLoading}
                    selectedYear={selectedYear}
                    selectedMonth={selectedMonth}
                    actionLoading={actionLoading}
                    onCreateMonthlyArchive={handleCreateMonthlyArchiveSnapshot}
                    onDownloadMonthlyArchive={handleDownloadMonthlyArchive}
                  />
                ) : null}
              </div>

              {isAdmin ? (
                <div className="grid gap-4 lg:grid-cols-2 lg:gap-5">
                  {import.meta.env.VITE_ENABLE_SCHEDULER_V3 === 'true' && !v3Active && <SchedulerSetupV3 tenantId={getCurrentTenantHostContext().tenantSlug} employees={employees} />}
                  <SchedulingRulesPanel
                    isAdmin={isAdmin}
                    isSaving={isSaving}
                    employees={employees}
                    generatorRules={generatorRules}
                    onSaveRules={saveGeneratorRules}
                    onSaveEmployeeRules={saveEmployeeSchedulingRules}
                  />

                  <SpecialDaysPanel
                    isAdmin={isAdmin}
                    isSaving={isSaving}
                    specialDaysByDate={specialDaysByDate}
                    onSaveSpecialDay={handleSaveSpecialDay}
                    onRemoveSpecialDay={removeSpecialDay}
                  />
                </div>
              ) : null}

            </div>
          </div>
        </div>
      </main>

      <div className="fixed bottom-6 right-6 z-[65] flex flex-col gap-2 md:hidden">
        <button
          type="button"
          onClick={() => {
            setMobileSidebarSection('employees');
            setIsSidebarOpen(true);
          }}
          className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-white/35 bg-white/80 text-slate-900 shadow-xl shadow-slate-900/20 backdrop-blur-md transition hover:bg-white dark:border-cyan-300/35 dark:bg-slate-900/70 dark:text-slate-100 dark:hover:bg-slate-900/85"
          aria-label="Άνοιγμα sidebar"
        >
          <PanelLeft size={20} />
        </button>
        {isAdmin ? (
          <button
            type="button"
            onClick={() => {
              setMobileSidebarSection('manual');
              setIsSidebarOpen(true);
            }}
            className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-brand-500 text-white shadow-xl shadow-slate-900/20 transition hover:bg-brand-600"
            aria-label="Γρήγορη χειροκίνητη βάρδια"
          >
            <Plus size={24} />
          </button>
        ) : null}
      </div>

      {isSidebarOpen && typeof document !== 'undefined' ? createPortal(
        <div className="fixed inset-0 z-[70] md:hidden" role="dialog" aria-modal="true">
          <button
            type="button"
            aria-label="Κλείσιμο"
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            onClick={() => setIsSidebarOpen(false)}
          />
          <div className="absolute inset-0 flex flex-col overflow-hidden bg-slate-100/95 p-3 shadow-2xl backdrop-blur-md dark:bg-slate-950/95">
            <div className="mb-3 flex min-h-12 items-center justify-between gap-3 rounded-2xl border border-white/45 bg-white/55 px-3 py-2 dark:border-cyan-300/30 dark:bg-slate-900/55">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                  Εργαλεία
                </p>
                <p className="truncate text-sm font-bold text-slate-900 dark:text-white">
                  Πίνακας πλαϊνής καρτέλας
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsSidebarOpen(false)}
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-slate-300/70 bg-white/70 text-slate-800 transition hover:bg-white dark:border-cyan-300/35 dark:bg-slate-950/70 dark:text-slate-100 dark:hover:bg-slate-900"
                aria-label="Κλείσιμο sidebar"
              >
                <X size={18} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto pb-5">
                <SchedulerSidebar
                  employees={displayEmployees}
                  shiftTemplates={shiftTemplates}
                  absences={absences}
                  isAbsencesLoading={isAbsencesLoading}
                  absencesWarningMessage={absencesWarningMessage}
                  weekDays={weekDays}
                  visibleDays={visibleDays}
                  isAdmin={isAdmin}
                  isSaving={isSaving}
                  scheduleMode={scheduleMode}
                  onModeChange={setScheduleMode}
                  selectedMonth={selectedMonth}
                  selectedYear={selectedYear}
                  analytics={analytics}
                  onAddEmployee={addEmployee}
                  onDeleteEmployee={deleteEmployee}
                  onOpenAdminLogin={handleOpenAdminLogin}
                  onOpenProfile={setProfileEmployee}
                  onCreateAbsence={createAbsence}
                  onUpdateAbsence={updateAbsence}
                  onCancelAbsence={cancelAbsence}
                  onDeleteAbsence={deleteAbsence}
                  onAddShiftTemplate={addShiftTemplate}
                  onDeleteShiftTemplate={deleteShiftTemplate}
                  onCreateShift={addShift}
                  defaultSection={mobileSidebarSection}
                  compact
                />
            </div>
          </div>
        </div>,
        document.body,
      ) : null}

      <Suspense fallback={null}>
        <AdminLoginModal
          open={isLoginModalOpen}
          onClose={handleCloseAdminLogin}
          onLogin={handleAdminLogin}
          onRequestPasswordReset={requestPasswordReset}
          isFirebaseConfigured={isFirebaseConfigured}
          defaultEmail={adminEmail}
          isDemoMode={isDemoMode}
        />
      </Suspense>

      <Suspense fallback={null}>
        <EmployeeProfileModal
          open={Boolean(profileEmployee)}
          employee={profileEmployee}
          isAdmin={isAdmin}
          onClose={handleCloseProfileModal}
          onSave={handleSaveProfile}
        />
      </Suspense>

      {quickAssignDraft.open ? (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/55 p-4 sm:items-center" role="dialog" aria-modal="true">
          <div className="glass-panel w-full max-w-md rounded-2xl p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Γρήγορη Ανάθεση</h3>
              <button
                type="button"
                onClick={() => setQuickAssignDraft((prev) => ({ ...prev, open: false }))}
                className="rounded px-2 py-1 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Κλείσιμο
              </button>
            </div>

            <p className="mb-3 text-sm text-slate-700 dark:text-slate-300">
              {quickAssignDraft.employeeName} - {formatDateGreek(quickAssignDraft.date)}
            </p>

            <form onSubmit={handleQuickAssignSave} className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <label className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  Ώρα Έναρξης
                  <input
                    type="time"
                    value={quickAssignDraft.startTime}
                    onChange={(event) => setQuickAssignDraft((prev) => ({ ...prev, startTime: event.target.value }))}
                    className="input-glass mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 dark:border-cyan-300/45 dark:text-white"
                    required
                  />
                </label>
                <label className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  Ώρα Λήξης
                  <input
                    type="time"
                    value={quickAssignDraft.endTime}
                    onChange={(event) => setQuickAssignDraft((prev) => ({ ...prev, endTime: event.target.value }))}
                    className="input-glass mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 dark:border-cyan-300/45 dark:text-white"
                    required
                  />
                </label>
              </div>

              <label className="block text-sm font-medium text-slate-900 dark:text-slate-100">
                Τύπος
                <select
                  value={quickAssignDraft.type}
                  onChange={(event) => setQuickAssignDraft((prev) => ({ ...prev, type: event.target.value }))}
                  className="input-glass mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 dark:border-cyan-300/45 dark:text-white"
                >
                  <option value={SHIFT_TYPES.WORK}>Εργασία</option>
                  <option value={SHIFT_TYPES.REST}>Ρεπό</option>
                  <option value={SHIFT_TYPES.LEAVE}>Άδεια</option>
                  <option value={SHIFT_TYPES.SICK}>Ασθένεια</option>
                </select>
              </label>

              <button
                type="submit"
                className="w-full rounded-lg bg-brand-500 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
                disabled={isSaving}
              >
                {isSaving ? 'Αποθήκευση...' : 'Αποθήκευση'}
              </button>
            </form>
          </div>
        </div>
      ) : null}

      <ToastStack toasts={toasts} onDismiss={dismissToast} />
      <UndoSnackbar undoState={undoState} onUndo={undoLastAction} onDismiss={dismissUndo} isAdmin={isAdmin} />
    </>
  );

  if (!isAdmin) {
    return dashboardContent;
  }

  const legacyTools = (
    <Suspense fallback={dashboardContent}>
      <AdminDndShell onDragStart={handleDragStart} onDragEnd={handleDragEnd} activeDragItem={activeDragItem}>
        {dashboardContent}
      </AdminDndShell>
    </Suspense>
  );
  if (v3Active) return <>{v3Workspace}<details className="mx-auto max-w-6xl rounded border p-4"><summary>Προηγούμενα προγράμματα και εργαλεία</summary><p>Ιστορικό, εξαγωγές και εργαλεία V2. Οι αλλαγές εδώ αφορούν τα προηγούμενα προγράμματα, όχι το ανοιχτό προσχέδιο V3.</p>{legacyTools}</details></>;
  return legacyTools;
}





