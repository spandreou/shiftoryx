import { create } from 'zustand';
import {
  absencesRepository,
  announcementsRepository,
  auditLogRepository,
  authRepository,
  employeesRepository,
  publishedSchedulesRepository,
  schedulerSettingsRepository,
  shiftsRepository,
  templatesRepository,
  weekHistoryRepository,
} from '../repositories';
import {
  evaluateSundayRuleViolation,
  getWeekIdFromWeekStart,
} from '../utils/autoSchedulerService';
import {
  generateEngineMonthSchedule,
  generateEngineWeekSchedule,
  allPersistenceResultsSucceeded,
  persistValidatedSchedule,
  revalidateScheduleCandidate,
  validateSchedulerEmployeeCapacity,
  validateSchedulerRoleConfiguration,
} from '../utils/schedulerEngineAdapter';
import { hasTimeOverlap } from '../utils/overlap';
import { calculateWeeklyTotals, SHIFT_TYPES } from '../utils/analytics';
import { getMonthDays, inferShiftTypeFromTimes } from '../utils/scheduleUtils';
import { verifyTenantAccessForHost, TENANT_ACCESS_MESSAGES } from '../services/tenantAccessService';
import { formatDateGreek, getIsoDate, getMonday, getWeekDays, isValidTimeLabel, timeToMinutes } from '../utils/time';
import { getCurrentTenantHostContext } from '../utils/tenantHostContext';
import { mergeSchedulerConfigSpecialDays, validateSchedulerConfig } from '../scheduler-engine';

const isFirebaseConfigured = authRepository.isPersistenceConfigured();
const firebaseConfigErrorMessage = authRepository.getPersistenceErrorMessage?.() || '';

const {
  sendAdminPasswordResetEmail,
  signInAdmin,
  signOutAdmin,
  subscribeAuth,
} = authRepository;

const {
  createAnnouncement,
  deleteAnnouncement: removeAnnouncement,
  subscribeAnnouncements,
} = announcementsRepository;

const {
  cancelAbsence: cancelEmployeeAbsence,
  createAbsence: createEmployeeAbsence,
  deleteAbsence: removeEmployeeAbsence,
  subscribeAbsences: subscribeEmployeeAbsences,
  subscribePublicAbsences: subscribePublicEmployeeAbsences,
  updateAbsence: updateEmployeeAbsence,
} = absencesRepository;

const {
  createEmployee,
  deleteEmployee: removeEmployee,
  subscribeEmployees,
  updateEmployee,
} = employeesRepository;

const {
  createShift,
  createShiftTemplate,
  deleteShift: removeShift,
  deleteShiftTemplate: removeShiftTemplate,
  deleteShiftsByDates: removeShiftsByDates,
  deleteShiftsByEmployee: removeShiftsByEmployee,
  hasConsecutiveSundayAssignment,
  listShiftsByDates: fetchShiftsByDates,
  replaceShiftsBatch,
  restoreShift,
  subscribeShifts,
  subscribeShiftTemplates,
  updateShift,
  updateShiftTemplate,
} = shiftsRepository;

const {
  subscribeSettings: subscribeSchedulerSettings,
  upsertSettings: upsertSchedulerSettings,
} = schedulerSettingsRepository;

const {
  getLatestWeekSnapshotByWeekId: fetchLatestWeekSnapshotByWeekId,
  listAttendanceHistoryByMonth: fetchAttendanceHistoryByMonth,
  listWeekHistory: fetchWeekHistoryList,
  saveWeekSnapshot: saveWeekHistorySnapshot,
} = weekHistoryRepository;

const {
  createWeekTemplate: saveWeekTemplate,
  listWeekTemplates: fetchWeekTemplates,
} = templatesRepository;

const { writeAuditLog } = auditLogRepository;

const {
  deleteMonth: deletePublishedMonth,
  deleteByWeekStarts: deletePublishedSchedulesByWeekStarts,
  deletePublicAnnouncement,
  publishMonthSchedule,
  publishPublicAnnouncement,
  publishPublicEmployees,
  publishWeekSchedule,
  subscribePublishedMonth,
  subscribePublishedSchedule,
  subscribePublicAnnouncements,
  subscribePublicEmployees,
} = publishedSchedulesRepository;

function getCurrentWeekStart() {
  return getIsoDate(getMonday(new Date()));
}

function getWeekStartsForDates(dates = []) {
  return [
    ...new Set(
      (dates || [])
        .filter(Boolean)
        .map((dateValue) => getIsoDate(getMonday(new Date(`${dateValue}T00:00:00`)))),
    ),
  ];
}

function getCurrentYearMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function getPublicTenantId() {
  const tenantSlug = getCurrentTenantHostContext()?.tenantSlug;
  if (!tenantSlug) {
    throw new Error('Δεν βρέθηκε tenant context για το κατάστημα.');
  }
  return tenantSlug;
}

function getTenantArgs() {
  return { tenantId: getPublicTenantId() };
}

function getYearMonthFromParts(year, month) {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`;
}

function getMonthDateSet(year, month) {
  const { days } = getMonthDays(year, month);
  return new Set(days);
}

function parseShiftInput(startTime, endTime) {
  if (!isValidTimeLabel(startTime) || !isValidTimeLabel(endTime)) {
    throw new Error('Η ώρα πρέπει να είναι σε μορφή ΩΩ:ΛΛ.');
  }

  if (timeToMinutes(startTime) >= timeToMinutes(endTime)) {
    throw new Error('Η ώρα λήξης πρέπει να είναι μετά την ώρα έναρξης.');
  }
}

function buildNormalizedShiftPayload({
  employeeId,
  date,
  startTime,
  endTime,
  label,
  shiftType,
  customLabel,
  type,
  notes,
  isHoliday,
  isSpecialDay,
  specialDayLabel,
  isManualOverride,
}) {
  const normalizedShiftType = shiftType || inferShiftTypeFromTimes(startTime, endTime);
  const normalizedLabel = label?.trim() || 'Χειροκίνητη';

  return {
    employeeId,
    date,
    startTime,
    endTime,
    type: type || SHIFT_TYPES.WORK,
    label: normalizedLabel,
    notes: notes || '',
    shiftType: normalizedShiftType,
    customLabel:
      normalizedShiftType === 'custom' ? customLabel?.trim() || normalizedLabel || 'Προσαρμοσμένη' : '',
    isHoliday: Boolean(isHoliday),
    isSpecialDay: Boolean(isSpecialDay || isHoliday),
    specialDayLabel: specialDayLabel?.trim() || '',
    isManualOverride: Boolean(isManualOverride),
  };
}

function isShiftInWeekRange(shift, weekDays) {
  if (!shift?.date || !Array.isArray(weekDays)) return false;
  return weekDays.includes(shift.date);
}

function requireAdmin(get, set) {
  if (get().isAdmin) return true;
  set({ warningMessage: 'Η ενέργεια απαιτεί σύνδεση διαχειριστή.' });
  return false;
}

function stopAdminDataSubscriptions(get) {
  const {
    _unsubscribeEmployees,
    _unsubscribeShifts,
    _unsubscribeTemplates,
    _unsubscribeAnnouncements,
    _unsubscribeSchedulerSettings,
  } = get();
  _unsubscribeEmployees?.();
  _unsubscribeShifts?.();
  _unsubscribeTemplates?.();
  _unsubscribeAnnouncements?.();
  _unsubscribeSchedulerSettings?.();
}

function clearAdminDataState() {
  return {
    schedulerConfigV3: null,
    schedulerSchemaVersion: 2,
    employees: [],
    shifts: [],
    shiftTemplates: [],
    announcements: [],
    attendanceHistory: [],
    weekHistory: [],
    weekTemplates: [],
    _attendanceHistoryCacheKey: '',
    _attendanceHistoryFetchedAt: 0,
    _attendanceHistoryInflightKey: '',
    _attendanceHistoryInflightPromise: null,
    _weekHistoryFetchedAt: 0,
    _weekTemplatesFetchedAt: 0,
    _unsubscribeEmployees: null,
    _unsubscribeShifts: null,
    _unsubscribeTemplates: null,
    _unsubscribeAnnouncements: null,
    _unsubscribeSchedulerSettings: null,
  };
}

function getAuditActor(state) {
  return {
    uid: state.adminUser?.uid || '',
    email: state.adminUser?.email || '',
  };
}

function createGenerationRunId(scope) {
  const randomValue =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `${scope}_${randomValue}`;
}

async function recordAuditLog(get, payload) {
  try {
    await writeAuditLog({
      tenantId: getPublicTenantId(),
      ...payload,
      actor: getAuditActor(get()),
    });
    return true;
  } catch {
    return false;
  }
}

function isProtectedSchedulerEntry(shift) {
  return Boolean(shift?.isManualOverride || (shift?.type && shift.type !== SHIFT_TYPES.WORK));
}

function buildUndoState(actionType, message, payload) {
  return {
    visible: true,
    actionType,
    message,
    payload,
    createdAt: Date.now(),
  };
}

function isDateInWeek(date, weekDays) {
  return new Set(weekDays).has(date);
}

function sortShiftsByDateAndStart(shifts = []) {
  return [...shifts].sort((a, b) =>
    `${a.date || ''}_${a.startTime || ''}_${a.employeeId || ''}`.localeCompare(
      `${b.date || ''}_${b.startTime || ''}_${b.employeeId || ''}`,
    ),
  );
}

function sortAbsencesByDate(absences = []) {
  return [...absences].sort(
    (a, b) =>
      `${a.startDate || ''}_${a.endDate || ''}_${a.employeeId || ''}`.localeCompare(
        `${b.startDate || ''}_${b.endDate || ''}_${b.employeeId || ''}`,
      ),
  );
}

function hasWeekShiftData(shifts = [], weekDays = []) {
  if (!Array.isArray(shifts) || !Array.isArray(weekDays) || !weekDays.length) return false;
  const weekSet = new Set(weekDays);
  return shifts.some((shift) => shift?.date && weekSet.has(shift.date));
}

function isWeekEditingLocked() {
  return false;
}

function isIsoDateString(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
}

function dateRangesOverlap(startA, endA, startB, endB) {
  return isIsoDateString(startA) && isIsoDateString(endA) && isIsoDateString(startB) && isIsoDateString(endB) && startA <= endB && endA >= startB;
}

function getAbsencesForRange(absences = [], startDate, endDate) {
  return (absences || []).filter(
    (absence) => absence?.status !== 'CANCELLED' && dateRangesOverlap(absence.startDate, absence.endDate, startDate, endDate),
  );
}

function normalizeAbsenceInput(input = {}, current = {}) {
  const employeeId = `${input.employeeId ?? current.employeeId ?? ''}`.trim();
  const type = `${input.type ?? current.type ?? 'LEAVE'}`.trim();
  const startDate = `${input.startDate ?? current.startDate ?? ''}`.trim();
  const endDate = `${input.endDate ?? current.endDate ?? startDate}`.trim();
  const replacementMode = `${input.replacementMode ?? current.replacementMode ?? 'AUTO'}`.trim();
  const manualReplacementEmployeeId = `${input.manualReplacementEmployeeId ?? current.manualReplacementEmployeeId ?? ''}`.trim();

  if (!employeeId) throw new Error('Επίλεξε υπάλληλο για την άδεια.');
  if (!['LEAVE', 'SICK', 'OTHER'].includes(type)) throw new Error('Επίλεξε έγκυρο τύπο απουσίας.');
  if (!isIsoDateString(startDate) || !isIsoDateString(endDate)) throw new Error('Επίλεξε έγκυρο εύρος ημερομηνιών.');
  if (startDate > endDate) throw new Error('Η ημερομηνία έναρξης πρέπει να είναι πριν ή ίδια με τη λήξη.');
  if (!['AUTO', 'MANUAL', 'NO_REPLACEMENT'].includes(replacementMode)) throw new Error('Επίλεξε έγκυρη αντικατάσταση.');
  if (replacementMode === 'MANUAL' && !manualReplacementEmployeeId) {
    throw new Error('Επίλεξε χειροκίνητο αντικαταστάτη.');
  }
  if (manualReplacementEmployeeId && manualReplacementEmployeeId === employeeId) {
    throw new Error('Ο αντικαταστάτης πρέπει να είναι διαφορετικός υπάλληλος.');
  }

  return {
    employeeId,
    type,
    startDate,
    endDate,
    scope: input.scope || current.scope || 'FULL_DAY',
    replacementMode,
    manualReplacementEmployeeId: replacementMode === 'MANUAL' ? manualReplacementEmployeeId : '',
    note: `${input.note ?? current.note ?? ''}`.trim(),
    status: input.status || current.status || 'ACTIVE',
  };
}

function getEmployeeName(employees = [], employeeId = '') {
  return employees.find((employee) => employee.id === employeeId)?.fullName || '';
}

const emptyUndoState = { visible: false, actionType: '', message: '', payload: null, createdAt: 0 };
const defaultGeneratorRules = {
  weeklyRotationEnabled: true,
  avoidConsecutiveSundays: true,
  allowManualOverride: true,
  startWithCoreAMorning: true,
  generationMode: 'balanced',
};
const ATTENDANCE_HISTORY_TTL_MS = 60 * 1000;
const WEEK_HISTORY_TTL_MS = 60 * 1000;
const WEEK_TEMPLATES_TTL_MS = 5 * 60 * 1000;
const SHIFT_TEMPLATES_LOAD_WARNING =
  'Δεν μπορέσαμε να φορτώσουμε τις custom βάρδιες. Οι κάρτες templates μπορεί να λείπουν προσωρινά, οπότε δεν θα μπορείς να τις αναθέσεις. Δοκίμασε ξανά φόρτωση ή ανανέωσε τη σελίδα.';
const SHIFT_TEMPLATES_RETRY_LIMIT = 2;
const SHIFT_TEMPLATES_RETRY_DELAY_MS = 1200;
const ADMIN_ABSENCES_LOAD_WARNING = 'Δεν ήταν δυνατή η φόρτωση των αδειών διαχειριστή.';

function isShiftTemplatesLoadWarning(message) {
  return String(message || '') === SHIFT_TEMPLATES_LOAD_WARNING;
}

function normalizeGeneratorRules(value = {}) {
  const mode = value?.generationMode;
  const generationMode = mode === 'strict' || mode === 'manual_assist' || mode === 'balanced'
    ? mode
    : defaultGeneratorRules.generationMode;
  return {
    ...defaultGeneratorRules,
    ...(value || {}),
    generationMode,
  };
}

export const useSchedulerStore = create((set, get) => ({
  employees: [],
  shifts: [],
  shiftTemplates: [],
  absences: [],
  announcements: [],
  attendanceHistory: [],
  weekHistory: [],
  weekTemplates: [],
  publishedSchedule: null,
  publishedSchedulesByWeek: {},
  publishedMonth: null,
  publishedMonthsByMonth: {},
  publicEmployees: [],
  publicAnnouncements: [],
  generatorRules: { ...defaultGeneratorRules },
  schedulerConfigV2: null,
  schedulerConfigV3: null,
  schedulerSchemaVersion: 2,
  specialDaysByDate: {},
  selectedHistoryWeekId: '',
  selectedTemplateId: '',
  sundayRuleViolations: {},
  historyFilters: {
    employeeId: '',
    yearMonth: getCurrentYearMonth(),
  },
  isHistoryLoading: false,
  isAbsencesLoading: true,
  absencesWarningMessage: '',
  isWeekLocked: false,
  isLoading: true,
  isAuthLoading: true,
  isSaving: false,
  errorMessage: '',
  warningMessage: '',
  weekStart: getCurrentWeekStart(),
  isAdmin: false,
  adminUser: null,
  isLoginModalOpen: false,
  undoState: emptyUndoState,
  _unsubscribeEmployees: null,
  _unsubscribeShifts: null,
  _unsubscribeTemplates: null,
  _unsubscribeAbsences: null,
  _unsubscribeAnnouncements: null,
  _unsubscribeSchedulerSettings: null,
  _unsubscribePublishedSchedule: null,
  _unsubscribePublishedSchedulesByWeek: {},
  _unsubscribePublishedMonth: null,
  _unsubscribePublicEmployees: null,
  _unsubscribePublicAnnouncements: null,
  _unsubscribeAuth: null,
  _shiftTemplatesRetryTimer: null,
  _shiftTemplatesRetryCount: 0,
  _attendanceHistoryCacheKey: '',
  _attendanceHistoryFetchedAt: 0,
  _attendanceHistoryInflightKey: '',
  _attendanceHistoryInflightPromise: null,
  _weekHistoryFetchedAt: 0,
  _weekTemplatesFetchedAt: 0,

  startShiftTemplatesSubscription: () => {
    if (!isFirebaseConfigured) return null;

    const existingTimer = get()._shiftTemplatesRetryTimer;
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const existingUnsubscribe = get()._unsubscribeTemplates;
    existingUnsubscribe?.();

    const unsubscribeTemplates = subscribeShiftTemplates(
      getTenantArgs(),
      (shiftTemplates) => {
        const retryTimer = get()._shiftTemplatesRetryTimer;
        if (retryTimer) {
          clearTimeout(retryTimer);
        }

        set((state) => ({
          shiftTemplates,
          _shiftTemplatesRetryTimer: null,
          _shiftTemplatesRetryCount: 0,
          errorMessage: isShiftTemplatesLoadWarning(state.errorMessage) ? '' : state.errorMessage,
          warningMessage: isShiftTemplatesLoadWarning(state.warningMessage) ? '' : state.warningMessage,
        }));
      },
      () => {
        const retryCount = get()._shiftTemplatesRetryCount || 0;

        if (retryCount < SHIFT_TEMPLATES_RETRY_LIMIT) {
          const retryTimer = setTimeout(() => {
            set({ _shiftTemplatesRetryTimer: null });
            get().startShiftTemplatesSubscription();
          }, SHIFT_TEMPLATES_RETRY_DELAY_MS);

          set({
            _shiftTemplatesRetryTimer: retryTimer,
            _shiftTemplatesRetryCount: retryCount + 1,
          });
          return;
        }

        set({
          _shiftTemplatesRetryTimer: null,
          warningMessage: SHIFT_TEMPLATES_LOAD_WARNING,
        });
      },
    );

    set({
      _unsubscribeTemplates: unsubscribeTemplates,
      _shiftTemplatesRetryTimer: null,
    });

    return unsubscribeTemplates;
  },

  startAbsencesSubscription: ({ adminOnly = false } = {}) => {
    if (!isFirebaseConfigured) return null;

    const existingUnsubscribe = get()._unsubscribeAbsences;
    existingUnsubscribe?.();

    const subscribe = adminOnly ? subscribeEmployeeAbsences : subscribePublicEmployeeAbsences;
    const unsubscribeAbsences = subscribe(
      getTenantArgs(),
      (absences) => set({ absences, isAbsencesLoading: false, absencesWarningMessage: '' }),
      () =>
        set({
          absencesWarningMessage: adminOnly ? ADMIN_ABSENCES_LOAD_WARNING : '',
          absences: [],
          isAbsencesLoading: false,
        }),
    );

    set({
      _unsubscribeAbsences: unsubscribeAbsences,
      isAbsencesLoading: false,
    });

    return unsubscribeAbsences;
  },

  startPublishedScheduleSubscription: (weekStart = get().weekStart) => {
    if (!isFirebaseConfigured || !weekStart) return null;

    const existingUnsubscribe = get()._unsubscribePublishedSchedule;
    existingUnsubscribe?.();

    const unsubscribePublishedSchedule = subscribePublishedSchedule(
      { tenantId: getPublicTenantId(), weekStart },
      (publishedSchedule) =>
        set((state) => ({
          publishedSchedule,
          publishedSchedulesByWeek: {
            ...state.publishedSchedulesByWeek,
            [weekStart]: publishedSchedule,
          },
        })),
      () =>
        set((state) => ({
          publishedSchedule: null,
          publishedSchedulesByWeek: {
            ...state.publishedSchedulesByWeek,
            [weekStart]: null,
          },
        })),
    );

    set({ _unsubscribePublishedSchedule: unsubscribePublishedSchedule });
    return unsubscribePublishedSchedule;
  },

  startPublishedScheduleSubscriptions: (weekStarts = []) => {
    if (!isFirebaseConfigured) return {};

    const uniqueWeekStarts = [...new Set((weekStarts || []).filter(Boolean))];
    const nextWeekStartSet = new Set(uniqueWeekStarts);
    const existingUnsubscribes = get()._unsubscribePublishedSchedulesByWeek || {};
    const nextUnsubscribes = { ...existingUnsubscribes };

    Object.entries(existingUnsubscribes).forEach(([weekStart, unsubscribe]) => {
      if (nextWeekStartSet.has(weekStart)) return;
      unsubscribe?.();
      delete nextUnsubscribes[weekStart];
    });

    uniqueWeekStarts.forEach((weekStart) => {
      if (nextUnsubscribes[weekStart]) return;
      nextUnsubscribes[weekStart] = subscribePublishedSchedule(
        { tenantId: getPublicTenantId(), weekStart },
        (publishedSchedule) =>
          set((state) => ({
            publishedSchedule: state.weekStart === weekStart ? publishedSchedule : state.publishedSchedule,
            publishedSchedulesByWeek: {
              ...state.publishedSchedulesByWeek,
              [weekStart]: publishedSchedule,
            },
          })),
        () =>
          set((state) => ({
            publishedSchedule: state.weekStart === weekStart ? null : state.publishedSchedule,
            publishedSchedulesByWeek: {
              ...state.publishedSchedulesByWeek,
              [weekStart]: null,
            },
          })),
      );
    });

    set({ _unsubscribePublishedSchedulesByWeek: nextUnsubscribes });
    return nextUnsubscribes;
  },

  startPublishedMonthSubscription: (yearMonth) => {
    if (!isFirebaseConfigured || !yearMonth) return null;

    const existingUnsubscribe = get()._unsubscribePublishedMonth;
    existingUnsubscribe?.();

    const unsubscribePublishedMonth = subscribePublishedMonth(
      { tenantId: getPublicTenantId(), yearMonth },
      (publishedMonth) =>
        set((state) => ({
          publishedMonth,
          publishedMonthsByMonth: {
            ...state.publishedMonthsByMonth,
            [yearMonth]: publishedMonth,
          },
        })),
      () =>
        set((state) => ({
          publishedMonth: null,
          publishedMonthsByMonth: {
            ...state.publishedMonthsByMonth,
            [yearMonth]: null,
          },
        })),
    );

    set({ _unsubscribePublishedMonth: unsubscribePublishedMonth });
    return unsubscribePublishedMonth;
  },

  startPublicEmployeesSubscription: () => {
    if (!isFirebaseConfigured) return null;

    const existingUnsubscribe = get()._unsubscribePublicEmployees;
    existingUnsubscribe?.();

    const unsubscribePublicEmployees = subscribePublicEmployees(
      { tenantId: getPublicTenantId() },
      (publicEmployees) => set({ publicEmployees }),
      () => set({ publicEmployees: [] }),
    );

    set({ _unsubscribePublicEmployees: unsubscribePublicEmployees });
    return unsubscribePublicEmployees;
  },

  startPublicAnnouncementsSubscription: () => {
    if (!isFirebaseConfigured) return null;

    const existingUnsubscribe = get()._unsubscribePublicAnnouncements;
    existingUnsubscribe?.();

    const unsubscribePublicAnnouncements = subscribePublicAnnouncements(
      { tenantId: getPublicTenantId() },
      (publicAnnouncements) => set({ publicAnnouncements }),
      () => set({ publicAnnouncements: [] }),
    );

    set({ _unsubscribePublicAnnouncements: unsubscribePublicAnnouncements });
    return unsubscribePublicAnnouncements;
  },

  startAdminDataSubscriptions: () => {
    if (!isFirebaseConfigured) return;

    const {
      _unsubscribeEmployees,
      _unsubscribeShifts,
      _unsubscribeAnnouncements,
      _unsubscribeSchedulerSettings,
    } = get();
    _unsubscribeEmployees?.();
    _unsubscribeShifts?.();
    _unsubscribeAnnouncements?.();
    _unsubscribeSchedulerSettings?.();

    const unsubscribeEmployees = subscribeEmployees(
      getTenantArgs(),
      (employees) => {
        set({ employees, isLoading: false });
        void get().refreshPublicEmployeesSnapshot(employees);
      },
      () => set({ errorMessage: 'Αποτυχία φόρτωσης υπαλλήλων.', isLoading: false }),
    );

    const unsubscribeShifts = subscribeShifts(
      getTenantArgs(),
      (shifts) => set({ shifts, isLoading: false }),
      () => set({ errorMessage: 'Αποτυχία φόρτωσης βαρδιών.', isLoading: false }),
    );

    const unsubscribeTemplates = get().startShiftTemplatesSubscription();

    const unsubscribeAnnouncements = subscribeAnnouncements(
      getTenantArgs(),
      (announcements) => set({ announcements }),
      () => set({ errorMessage: 'Αποτυχία φόρτωσης ανακοινώσεων.' }),
    );

    const unsubscribeSchedulerSettings = subscribeSchedulerSettings(
      getTenantArgs(),
      (settingsDoc) => {
        const generatorRules = normalizeGeneratorRules(settingsDoc?.generatorRules);
        const schedulerConfigV2 = settingsDoc?.schedulerConfigV2 || null;
        const specialDaysByDate =
          settingsDoc?.specialDaysByDate && typeof settingsDoc.specialDaysByDate === 'object'
            ? settingsDoc.specialDaysByDate
            : {};
        set({ generatorRules, schedulerConfigV2, specialDaysByDate, schedulerConfigV3: settingsDoc?.schedulerConfigV3 || null, schedulerSchemaVersion: settingsDoc?.schedulerSchemaVersion || 2 });
      },
      () => set({ warningMessage: 'Αποτυχία φόρτωσης ρυθμίσεων προγραμματισμού.' }),
    );

    set({
      _unsubscribeEmployees: unsubscribeEmployees,
      _unsubscribeShifts: unsubscribeShifts,
      _unsubscribeTemplates: unsubscribeTemplates,
      _unsubscribeAnnouncements: unsubscribeAnnouncements,
      _unsubscribeSchedulerSettings: unsubscribeSchedulerSettings,
    });
  },

  initializeData: () => {
    if (!isFirebaseConfigured) {
      set({
        errorMessage: firebaseConfigErrorMessage || 'Το Firebase δεν είναι ρυθμισμένο. Συμπλήρωσε τα env vars για Firestore/Auth.',
        isLoading: false,
        isAuthLoading: false,
      });
      return;
    }

    const unsubscribeAbsences = get().startAbsencesSubscription({ adminOnly: false });
    const unsubscribePublishedSchedule = get().startPublishedScheduleSubscription(get().weekStart);
    const unsubscribePublicEmployees = get().startPublicEmployeesSubscription();
    const unsubscribePublicAnnouncements = get().startPublicAnnouncementsSubscription();

    const unsubscribeAuth = subscribeAuth(
      async (user) => {
        if (!user) {
          stopAdminDataSubscriptions(get);
          get().startAbsencesSubscription({ adminOnly: false });
          set({
            ...clearAdminDataState(),
            adminUser: null,
            isAdmin: false,
            isAuthLoading: false,
            isLoginModalOpen: false,
            isLoading: false,
          });
          return;
        }

        let access;
        try {
          access = await verifyTenantAccessForHost({
            uid: user.uid,
            hostname: getCurrentTenantHostContext().hostname,
          });
        } catch {
          access = {
            allowed: false,
            message: TENANT_ACCESS_MESSAGES.denied,
          };
        }

        if (!access.allowed) {
          stopAdminDataSubscriptions(get);
          get().startAbsencesSubscription({ adminOnly: false });
          set({
            ...clearAdminDataState(),
            adminUser: null,
            isAdmin: false,
            isAuthLoading: false,
            isLoginModalOpen: false,
            isLoading: false,
            warningMessage: access.message || TENANT_ACCESS_MESSAGES.denied,
          });
          return;
        }

        set({
          adminUser: {
            uid: user.uid,
            email: user.email || '',
            tenantId: access.tenant?.id || '',
            tenantRole: access.role || access.membership?.role || '',
          },
          isAdmin: true,
          isAuthLoading: false,
          isLoginModalOpen: false,
        });

        get().startAdminDataSubscriptions();
        get().startAbsencesSubscription({ adminOnly: true });
        if ((get()._shiftTemplatesRetryCount || 0) > 0) {
          get().startShiftTemplatesSubscription();
        }
        await get().refreshWeekLockStatus();
        await Promise.all([
          get().loadWeekHistory({ force: false }),
          get().loadWeekTemplates({ force: false }),
        ]);
      },
      () => set({ warningMessage: 'Αποτυχία ελέγχου σύνδεσης διαχειριστή.', isAuthLoading: false }),
    );

    set({
      _unsubscribeAbsences: unsubscribeAbsences,
      _unsubscribePublishedSchedule: unsubscribePublishedSchedule,
      _unsubscribePublicEmployees: unsubscribePublicEmployees,
      _unsubscribePublicAnnouncements: unsubscribePublicAnnouncements,
      _unsubscribeAuth: unsubscribeAuth,
    });
  },

  cleanupData: () => {
    const {
      _unsubscribeEmployees,
      _unsubscribeShifts,
      _unsubscribeTemplates,
      _unsubscribeAbsences,
      _unsubscribeAnnouncements,
      _unsubscribeSchedulerSettings,
      _unsubscribePublishedSchedule,
      _unsubscribePublishedSchedulesByWeek,
      _unsubscribePublishedMonth,
      _unsubscribePublicEmployees,
      _unsubscribePublicAnnouncements,
      _unsubscribeAuth,
      _shiftTemplatesRetryTimer,
    } = get();
    if (_shiftTemplatesRetryTimer) {
      clearTimeout(_shiftTemplatesRetryTimer);
    }
    _unsubscribeEmployees?.();
    _unsubscribeShifts?.();
    _unsubscribeTemplates?.();
    _unsubscribeAbsences?.();
    _unsubscribeAnnouncements?.();
    _unsubscribeSchedulerSettings?.();
    _unsubscribePublishedSchedule?.();
    Object.values(_unsubscribePublishedSchedulesByWeek || {}).forEach((unsubscribe) => unsubscribe?.());
    _unsubscribePublishedMonth?.();
    _unsubscribePublicEmployees?.();
    _unsubscribePublicAnnouncements?.();
    _unsubscribeAuth?.();
    set({
      _shiftTemplatesRetryTimer: null,
      _shiftTemplatesRetryCount: 0,
      _unsubscribePublishedSchedule: null,
      _unsubscribePublishedSchedulesByWeek: {},
      _unsubscribePublishedMonth: null,
      _unsubscribePublicEmployees: null,
      _unsubscribePublicAnnouncements: null,
    });
  },

  openLoginModal: () => set({ isLoginModalOpen: true }),
  closeLoginModal: () => set({ isLoginModalOpen: false }),

  loginAsAdmin: async ({ email, password }) => {
    try {
      const user = await signInAdmin({ email, password });
      let access;
      try {
        access = await verifyTenantAccessForHost({
          uid: user.uid,
          hostname: getCurrentTenantHostContext().hostname,
        });
      } catch {
        access = {
          allowed: false,
          message: TENANT_ACCESS_MESSAGES.denied,
        };
      }
      if (!access.allowed) {
        await signOutAdmin();
        const message = access.message || TENANT_ACCESS_MESSAGES.denied;
        set({ warningMessage: message });
        throw new Error(message);
      }
      set({ warningMessage: 'Σύνδεση διαχειριστή επιτυχής.' });
      return true;
    } catch (error) {
      set({ warningMessage: error.message || 'Αποτυχία σύνδεσης διαχειριστή.' });
      throw error;
    }
  },

  logoutAdmin: async () => {
    await signOutAdmin();
    set({ warningMessage: 'Έγινε αποσύνδεση διαχειριστή.' });
  },

  requestPasswordReset: async (email) => {
    try {
      await sendAdminPasswordResetEmail(email);
      set({ warningMessage: 'Στάλθηκε email επαναφοράς κωδικού.' });
      return true;
    } catch (error) {
      set({ warningMessage: error.message || 'Αποτυχία αποστολής email επαναφοράς.' });
      return false;
    }
  },

  setWeekStart: async (weekStart) => {
    set({ weekStart });
    get().startPublishedScheduleSubscription(weekStart);
    await get().refreshWeekLockStatus();
  },

  setWeekFromDate: async (dateValue) => {
    if (!dateValue) return;
    const monday = getMonday(new Date(`${dateValue}T00:00:00`));
    const nextWeekStart = getIsoDate(monday);
    set({ weekStart: nextWeekStart });
    get().startPublishedScheduleSubscription(nextWeekStart);
    await get().refreshWeekLockStatus();
  },

  goToPreviousWeek: async () => {
    const current = new Date(`${get().weekStart}T00:00:00`);
    current.setDate(current.getDate() - 7);
    const nextWeekStart = getIsoDate(current);
    set({ weekStart: nextWeekStart });
    get().startPublishedScheduleSubscription(nextWeekStart);
    await get().refreshWeekLockStatus();
  },

  goToNextWeek: async () => {
    const current = new Date(`${get().weekStart}T00:00:00`);
    current.setDate(current.getDate() + 7);
    const nextWeekStart = getIsoDate(current);
    set({ weekStart: nextWeekStart });
    get().startPublishedScheduleSubscription(nextWeekStart);
    await get().refreshWeekLockStatus();
  },

  goToCurrentWeek: async () => {
    const nextWeekStart = getCurrentWeekStart();
    set({ weekStart: nextWeekStart });
    get().startPublishedScheduleSubscription(nextWeekStart);
    await get().refreshWeekLockStatus();
  },

  refreshWeekLockStatus: async () => {
    set({ isWeekLocked: false });
  },

  refreshPublicWeekSnapshot: async ({ weekStart = get().weekStart, shifts = null, silent = false } = {}) => {
    if (get().schedulerSchemaVersion === 3) {
      if (!silent) set({ warningMessage: 'Η δημόσια προβολή ενημερώνεται μόνο με νέα δημοσίευση V3.' });
      return false;
    }
    if (!get().isAdmin || !weekStart) return true;
    const weekDays = getWeekDays(weekStart);
    const weekSet = new Set(weekDays);
    const weekShifts = Array.isArray(shifts)
      ? shifts.filter((shift) => weekSet.has(shift.date))
      : get().shifts.filter((shift) => weekSet.has(shift.date));

    try {
      const publishedSchedule = await publishWeekSchedule({
        tenantId: getPublicTenantId(),
        weekStart,
        weekDays,
        shifts: weekShifts,
        employees: get().employees,
      });
      set((state) => ({
        publishedSchedule: state.weekStart === weekStart ? publishedSchedule : state.publishedSchedule,
        publishedSchedulesByWeek: {
          ...state.publishedSchedulesByWeek,
          [weekStart]: publishedSchedule,
        },
      }));
      return true;
    } catch {
      if (!silent) {
        set({ warningMessage: 'Το πρόγραμμα αποθηκεύτηκε, αλλά η δημόσια προβολή δεν ενημερώθηκε.' });
      }
      return false;
    }
  },

  refreshPublicMonthSnapshot: async ({ year, month, monthDays, shifts = null } = {}) => {
    if (get().schedulerSchemaVersion === 3) {
      set({ warningMessage: 'Η δημόσια προβολή ενημερώνεται μόνο με νέα δημοσίευση V3.' });
      return false;
    }
    if (!get().isAdmin) return true;
    const numericYear = Number(year);
    const numericMonth = Number(month);
    if (!Number.isInteger(numericYear) || !Number.isInteger(numericMonth)) return false;

    const resolvedMonthDays = Array.isArray(monthDays) && monthDays.length
      ? monthDays
      : getMonthDays(numericYear, numericMonth).days;
    const monthSet = new Set(resolvedMonthDays);
    const monthShifts = Array.isArray(shifts)
      ? shifts.filter((shift) => monthSet.has(shift.date))
      : get().shifts.filter((shift) => monthSet.has(shift.date));
    const publicWeekShifts = [
      ...get().shifts.filter((shift) => !monthSet.has(shift.date)),
      ...monthShifts,
    ];
    const weekStarts = getWeekStartsForDates(resolvedMonthDays);
    const yearMonth = getYearMonthFromParts(numericYear, numericMonth + 1);

    try {
      await publishMonthSchedule({
        tenantId: getPublicTenantId(),
        yearMonth,
        monthStart: resolvedMonthDays[0] || '',
        monthEnd: resolvedMonthDays[resolvedMonthDays.length - 1] || '',
        monthDays: resolvedMonthDays,
        weekStarts,
        shifts: monthShifts,
        employees: get().employees,
      });

      const publicWeekResults = await Promise.all(
        weekStarts.map((weekStart) =>
          get().refreshPublicWeekSnapshot({ weekStart, shifts: publicWeekShifts, silent: true }),
        ),
      );
      if (!allPersistenceResultsSucceeded(publicWeekResults)) {
        set({ warningMessage: 'Το μηνιαίο πρόγραμμα αποθηκεύτηκε, αλλά μία ή περισσότερες εβδομαδιαίες δημόσιες προβολές δεν ενημερώθηκαν.' });
        return false;
      }
      return true;
    } catch {
      set({ warningMessage: 'Το μηνιαίο πρόγραμμα αποθηκεύτηκε, αλλά η δημόσια προβολή δεν ενημερώθηκε.' });
      return false;
    }
  },

  refreshPublicEmployeesSnapshot: async (employees = get().employees) => {
    if (!get().isAdmin) return true;
    try {
      await publishPublicEmployees({ tenantId: getPublicTenantId(), employees });
      return true;
    } catch {
      return false;
    }
  },

  setHistoryFilters: async (partial) => {
    if (!partial || typeof partial !== 'object') return;
    const currentFilters = get().historyFilters;
    const nextFilters = { ...currentFilters, ...partial };
    if (
      nextFilters.employeeId === currentFilters.employeeId &&
      nextFilters.yearMonth === currentFilters.yearMonth
    ) {
      return;
    }
    set({ historyFilters: nextFilters });
    await get().loadAttendanceHistory();
  },

  loadAttendanceHistory: async ({ force = false } = {}) => {
    if (!get().isAdmin) return;

    const { employeeId, yearMonth } = get().historyFilters;
    const requestKey = `${yearMonth || ''}::${employeeId || ''}`;
    const now = Date.now();
    const {
      _attendanceHistoryCacheKey,
      _attendanceHistoryFetchedAt,
      _attendanceHistoryInflightKey,
      _attendanceHistoryInflightPromise,
    } = get();

    if (
      !force &&
      _attendanceHistoryCacheKey === requestKey &&
      now - _attendanceHistoryFetchedAt < ATTENDANCE_HISTORY_TTL_MS
    ) {
      return;
    }

    if (_attendanceHistoryInflightPromise && _attendanceHistoryInflightKey === requestKey) {
      await _attendanceHistoryInflightPromise;
      return;
    }

    set({ isHistoryLoading: true });
    const requestPromise = fetchAttendanceHistoryByMonth({
      tenantId: getPublicTenantId(),
      yearMonth,
      employeeId,
    });
    set({
      _attendanceHistoryInflightKey: requestKey,
      _attendanceHistoryInflightPromise: requestPromise,
    });

    try {
      const attendanceHistory = await requestPromise;
      set({
        attendanceHistory,
        _attendanceHistoryCacheKey: requestKey,
        _attendanceHistoryFetchedAt: Date.now(),
      });
    } catch {
      set({ warningMessage: 'Αποτυχία φόρτωσης ιστορικού.', isHistoryLoading: false });
    }

    if (get()._attendanceHistoryInflightPromise === requestPromise) {
      set({
        isHistoryLoading: false,
        _attendanceHistoryInflightKey: '',
        _attendanceHistoryInflightPromise: null,
      });
    } else {
      set({ isHistoryLoading: false });
    }
  },

  setWarningMessage: (warningMessage) => set({ warningMessage }),
  clearMessages: () => set({ warningMessage: '', errorMessage: '', absencesWarningMessage: '' }),

  createAbsence: async (input) => {
    if (!requireAdmin(get, set)) return false;

    set({ isSaving: true });
    try {
      const payload = normalizeAbsenceInput(input);
      const createdBy = get().adminUser?.email || '';
      const employeeName = getEmployeeName(get().employees, payload.employeeId);
      const created = await createEmployeeAbsence({
        tenantId: getPublicTenantId(),
        ...payload,
        employeeName,
        createdBy,
        updatedBy: createdBy,
      });
      const existingImpact = get().shifts.some(
        (shift) =>
          shift.employeeId === payload.employeeId &&
          shift.date >= payload.startDate &&
          shift.date <= payload.endDate,
      );
      await recordAuditLog(get, {
        action: 'absence.create',
        target: { collection: 'employeeAbsences', id: created.id },
        before: null,
        after: { ...payload, employeeName, id: created.id },
      });
      set((state) => ({
        absences: sortAbsencesByDate([...state.absences, { ...created, ...payload, employeeName }]),
      }));
      set({
        warningMessage: existingImpact
          ? 'Η άδεια καταχωρήθηκε επιτυχώς. Υπάρχει ήδη πρόγραμμα για αυτό το διάστημα και θα προσαρμοστεί στο επόμενο regenerate.'
          : 'Η άδεια καταχωρήθηκε επιτυχώς.',
      });
      return true;
    } catch (error) {
      set({ warningMessage: error?.message || 'Αποτυχία καταχώρησης άδειας.' });
      return false;
    } finally {
      set({ isSaving: false });
    }
  },

  updateAbsence: async (absenceId, patch) => {
    if (!requireAdmin(get, set)) return false;
    const current = get().absences.find((absence) => absence.id === absenceId);
    if (!current) {
      set({ warningMessage: 'Δεν βρέθηκε η άδεια για ενημέρωση.' });
      return false;
    }

    set({ isSaving: true });
    try {
      const payload = normalizeAbsenceInput(patch, current);
      const updatedBy = get().adminUser?.email || '';
      const employeeName = getEmployeeName(get().employees, payload.employeeId) || current.employeeName || '';
      await updateEmployeeAbsence(
        absenceId,
        {
          ...payload,
          employeeName,
          updatedBy,
        },
        getTenantArgs(),
      );
      await recordAuditLog(get, {
        action: 'absence.update',
        target: { collection: 'employeeAbsences', id: absenceId },
        before: current,
        after: { ...current, ...payload, employeeName, updatedBy },
      });
      set((state) => ({
        absences: sortAbsencesByDate(
          state.absences.map((absence) =>
            absence.id === absenceId ? { ...absence, ...payload, employeeName, updatedBy } : absence,
          ),
        ),
      }));
      set({ warningMessage: 'Η άδεια ενημερώθηκε.' });
      return true;
    } catch (error) {
      set({ warningMessage: error?.message || 'Αποτυχία ενημέρωσης άδειας.' });
      return false;
    } finally {
      set({ isSaving: false });
    }
  },

  cancelAbsence: async (absenceId) => {
    if (!requireAdmin(get, set)) return false;
    const current = get().absences.find((absence) => absence.id === absenceId);
    if (!current) return false;

    set({ isSaving: true });
    try {
      await cancelEmployeeAbsence(absenceId, getTenantArgs());
      await recordAuditLog(get, {
        action: 'absence.cancel',
        target: { collection: 'employeeAbsences', id: absenceId },
        before: current,
        after: { ...current, status: 'CANCELLED' },
      });
      set((state) => ({
        absences: state.absences.map((absence) =>
          absence.id === absenceId ? { ...absence, status: 'CANCELLED' } : absence,
        ),
      }));
      set({ warningMessage: 'Η άδεια ακυρώθηκε.' });
      return true;
    } catch (error) {
      set({ warningMessage: error?.message || 'Αποτυχία ακύρωσης άδειας.' });
      return false;
    } finally {
      set({ isSaving: false });
    }
  },

  deleteAbsence: async (absenceId) => {
    if (!requireAdmin(get, set)) return false;
    const current = get().absences.find((absence) => absence.id === absenceId);
    if (!current) return false;

    set({ isSaving: true });
    try {
      await removeEmployeeAbsence(absenceId, getTenantArgs());
      await recordAuditLog(get, {
        action: 'absence.delete',
        target: { collection: 'employeeAbsences', id: absenceId },
        before: current,
        after: null,
      });
      set((state) => ({
        absences: state.absences.filter((absence) => absence.id !== absenceId),
      }));
      set({ warningMessage: 'Η άδεια διαγράφηκε.' });
      return true;
    } catch (error) {
      set({ warningMessage: error?.message || 'Αποτυχία διαγραφής άδειας.' });
      return false;
    } finally {
      set({ isSaving: false });
    }
  },

  saveGeneratorRules: async (partialRules = {}) => {
    if (!requireAdmin(get, set)) return false;
    const nextRules = normalizeGeneratorRules({ ...get().generatorRules, ...(partialRules || {}) });
    set({ isSaving: true });
    try {
      await upsertSchedulerSettings({ tenantId: getPublicTenantId(), generatorRules: nextRules });
      await recordAuditLog(get, {
        action: 'settings.generator_rules.update',
        target: { collection: 'scheduler_settings', id: 'default' },
        before: get().generatorRules,
        after: nextRules,
      });
      set({
        generatorRules: nextRules,
        warningMessage: 'Οι ρυθμίσεις generator αποθηκεύτηκαν.',
      });
      return true;
    } catch (error) {
      set({ warningMessage: error?.message || 'Αποτυχία αποθήκευσης ρυθμίσεων generator.' });
      return false;
    } finally {
      set({ isSaving: false });
    }
  },

  saveSchedulerConfigV2: async (config) => {
    if (!requireAdmin(get, set)) return false;
    const sanitizedConfig = {
      ...config,
      tenantId: getPublicTenantId(),
    };
    const validation = validateSchedulerConfig(sanitizedConfig);
    if (!validation.valid) {
      set({ warningMessage: `Μη έγκυρες ρυθμίσεις V2: ${validation.errors.join(' | ')}` });
      return false;
    }
    set({ isSaving: true });
    try {
      await upsertSchedulerSettings({ tenantId: getPublicTenantId(), schedulerConfigV2: sanitizedConfig });
      await recordAuditLog(get, {
        action: 'settings.scheduler_config_v2.update',
        target: { collection: 'scheduler_settings', id: 'default' },
        before: get().schedulerConfigV2,
        after: sanitizedConfig,
      });
      set({
        schedulerConfigV2: sanitizedConfig,
        warningMessage: 'Οι ρυθμίσεις προγραμματισμού V2 αποθηκεύτηκαν.',
      });
      return true;
    } catch (error) {
      set({ warningMessage: error?.message || 'Αποτυχία αποθήκευσης ρυθμίσεων V2.' });
      return false;
    } finally {
      set({ isSaving: false });
    }
  },

  upsertSpecialDay: async ({ date, isHoliday, isSpecialDay, label, operatingStartTime, operatingEndTime }) => {
    if (!requireAdmin(get, set)) return false;
    if (!date) {
      set({ warningMessage: 'Επίλεξε ημερομηνία για ειδική ημέρα.' });
      return false;
    }
    if (
      operatingStartTime &&
      operatingEndTime &&
      timeToMinutes(operatingStartTime) >= timeToMinutes(operatingEndTime)
    ) {
      set({ warningMessage: 'Το ωράριο ειδικής ημέρας δεν είναι έγκυρο.' });
      return false;
    }

    const previousSpecialDay = get().specialDaysByDate?.[date] || null;
    const nextSpecialDays = {
      ...(get().specialDaysByDate || {}),
      [date]: {
        isHoliday: Boolean(isHoliday),
        isSpecialDay: Boolean(isSpecialDay || isHoliday),
        label: (label || '').trim(),
        operatingStartTime: operatingStartTime || '',
        operatingEndTime: operatingEndTime || '',
      },
    };

    set({ specialDaysByDate: nextSpecialDays });
    await upsertSchedulerSettings({ tenantId: getPublicTenantId(), specialDaysByDate: nextSpecialDays });
    await recordAuditLog(get, {
      action: 'settings.special_day.upsert',
      target: { collection: 'scheduler_settings', id: 'default', scope: date },
      before: previousSpecialDay,
      after: nextSpecialDays[date],
    });
    set({ warningMessage: 'Η ειδική ημέρα αποθηκεύτηκε.' });
    return true;
  },

  removeSpecialDay: async (date) => {
    if (!requireAdmin(get, set)) return false;
    if (!date) return false;

    const previousSpecialDay = get().specialDaysByDate?.[date] || null;
    const nextSpecialDays = { ...(get().specialDaysByDate || {}) };
    delete nextSpecialDays[date];

    set({ specialDaysByDate: nextSpecialDays });
    await upsertSchedulerSettings({ tenantId: getPublicTenantId(), specialDaysByDate: nextSpecialDays });
    await recordAuditLog(get, {
      action: 'settings.special_day.remove',
      target: { collection: 'scheduler_settings', id: 'default', scope: date },
      before: previousSpecialDay,
      after: null,
    });
    set({ warningMessage: 'Η ειδική ημέρα αφαιρέθηκε.' });
    return true;
  },

  dismissUndo: () => set({ undoState: emptyUndoState }),

  undoLastAction: async () => {
    if (!requireAdmin(get, set)) return;

    const undoState = get().undoState;
    if (!undoState.visible) return;

    try {
      switch (undoState.actionType) {
        case 'delete_shift': {
          await restoreShift(undoState.payload.shift, getTenantArgs());
          break;
        }
        case 'move_shift': {
          const { shiftId, previousValues } = undoState.payload;
          await updateShift(shiftId, previousValues, getTenantArgs());
          break;
        }
        case 'clear_week':
        case 'clear_month': {
          const shiftsToRestore = undoState.payload.shifts || [];
          await Promise.all(shiftsToRestore.map((shift) => restoreShift(shift, getTenantArgs())));
          break;
        }
        case 'add_shift': {
          const { shiftId } = undoState.payload || {};
          if (shiftId) {
            await removeShift(shiftId, getTenantArgs());
          }
          break;
        }
        default:
          break;
      }

      set({
        warningMessage: 'Η ενέργεια αναιρέθηκε επιτυχώς.',
        undoState: emptyUndoState,
      });
    } catch {
      set({ warningMessage: 'Αποτυχία αναίρεσης ενέργειας.' });
    }
  },

  addEmployee: async ({ fullName, role, color, afm, phone, email, hireDate }) => {
    if (!requireAdmin(get, set)) return false;
    if (!fullName?.trim()) {
      set({ warningMessage: 'Το όνομα υπαλλήλου είναι υποχρεωτικό.' });
      return false;
    }

    try {
      const createdEmployee = await createEmployee({
        tenantId: getPublicTenantId(),
        fullName: fullName.trim(),
        role: role?.trim() || 'Προσωπικό',
        color: color || '#1D4ED8',
        afm: afm?.trim() || '',
        phone: phone?.trim() || '',
        email: email?.trim() || '',
        hireDate: hireDate || '',
        isActive: true,
        scheduleRole: 'auto',
        fixedDayOff: null,
        participatesInRotation: true,
        participatesInSundayRotation: true,
        defaultShiftPreference: 'auto',
        weeklyFixedShiftSideRotation: false,
      });
      await recordAuditLog(get, {
        action: 'employee.create',
        target: { collection: 'employees', id: createdEmployee?.id || '' },
        before: null,
        after: createdEmployee,
      });
      const publicEmployeesUpdated = await get().refreshPublicEmployeesSnapshot([...get().employees, createdEmployee].filter(Boolean));
      set({
        warningMessage: publicEmployeesUpdated
          ? 'Ο υπάλληλος προστέθηκε.'
          : 'Ο υπάλληλος προστέθηκε, αλλά η δημόσια λίστα δεν ενημερώθηκε.',
      });
      return true;
    } catch (error) {
      set({ warningMessage: error?.message || 'Αποτυχία προσθήκης υπαλλήλου.' });
      return false;
    }
  },

  editEmployee: async ({ id, fullName, role, color, afm, phone, email, hireDate }) => {
    if (!requireAdmin(get, set)) return false;
    if (!id || !fullName?.trim()) {
      set({ warningMessage: 'Ανεπαρκή δεδομένα για ενημέρωση υπαλλήλου.' });
      return false;
    }

    try {
      const currentEmployee = get().employees.find((employee) => employee.id === id) || null;
      const payload = {
        fullName: fullName.trim(),
        role: role?.trim() || '',
        color: color || '#1D4ED8',
        afm: afm?.trim() || '',
        phone: phone?.trim() || '',
        email: email?.trim() || '',
        hireDate: hireDate || '',
      };
      await updateEmployee(id, payload, getTenantArgs());
      await recordAuditLog(get, {
        action: 'employee.update',
        target: { collection: 'employees', id },
        before: currentEmployee,
        after: currentEmployee ? { ...currentEmployee, ...payload } : payload,
      });
      const publicEmployeesUpdated = await get().refreshPublicEmployeesSnapshot(
        get().employees.map((employee) =>
          employee.id === id ? { ...employee, ...payload } : employee,
        ),
      );
      set({
        warningMessage: publicEmployeesUpdated
          ? 'Το προφίλ ενημερώθηκε.'
          : 'Το προφίλ ενημερώθηκε, αλλά η δημόσια λίστα δεν ενημερώθηκε.',
      });
      return true;
    } catch (error) {
      set({ warningMessage: error?.message || 'Αποτυχία ενημέρωσης προφίλ.' });
      return false;
    }
  },

  saveEmployeeSchedulingRules: async ({
    employeeId,
    scheduleRole,
    fixedDayOff,
    participatesInRotation,
    participatesInSundayRotation,
    defaultShiftPreference,
    weeklyFixedShiftSideRotation,
  }) => {
    if (!requireAdmin(get, set)) return false;
    if (!employeeId) return false;

    const parsedFixedDayOff =
      fixedDayOff === '' || fixedDayOff === null || typeof fixedDayOff === 'undefined'
        ? null
        : Number(fixedDayOff);

    const nextRules = {
      scheduleRole: scheduleRole || 'custom',
      fixedDayOff: Number.isInteger(parsedFixedDayOff) ? parsedFixedDayOff : null,
      participatesInRotation: Boolean(participatesInRotation),
      participatesInSundayRotation: participatesInSundayRotation !== false,
      defaultShiftPreference: defaultShiftPreference || 'auto',
      weeklyFixedShiftSideRotation: weeklyFixedShiftSideRotation === true,
    };

    set({ isSaving: true });
    try {
      const currentEmployee = get().employees.find((employee) => employee.id === employeeId) || null;
      await updateEmployee(employeeId, nextRules, getTenantArgs());
      await recordAuditLog(get, {
        action: 'employee.scheduling_rules.update',
        target: { collection: 'employees', id: employeeId },
        before: currentEmployee,
        after: currentEmployee ? { ...currentEmployee, ...nextRules } : nextRules,
      });

      set((state) => ({
        employees: state.employees.map((employee) =>
          employee.id === employeeId ? { ...employee, ...nextRules } : employee
        ),
        warningMessage: 'Οι κανόνες εργαζομένου ενημερώθηκαν.',
      }));
      const publicEmployeesUpdated = await get().refreshPublicEmployeesSnapshot(
        get().employees.map((employee) =>
          employee.id === employeeId ? { ...employee, ...nextRules } : employee,
        ),
      );
      if (!publicEmployeesUpdated) {
        set({ warningMessage: 'Οι κανόνες ενημερώθηκαν, αλλά η δημόσια λίστα δεν ενημερώθηκε.' });
      }
      return true;
    } catch (error) {
      set({ warningMessage: error?.message || 'Αποτυχία αποθήκευσης κανόνων εργαζομένου.' });
      return false;
    } finally {
      set({ isSaving: false });
    }
  },

  deleteEmployee: async (employeeId) => {
    if (!requireAdmin(get, set)) return false;
    if (!employeeId) return false;
    try {
      const currentEmployee = get().employees.find((employee) => employee.id === employeeId) || null;
      const removedShifts = await removeShiftsByEmployee(employeeId, getTenantArgs());
      await removeEmployee(employeeId, getTenantArgs());
      await recordAuditLog(get, {
        action: 'employee.delete',
        target: { collection: 'employees', id: employeeId },
        before: currentEmployee,
        after: null,
        metadata: { removedShiftCount: removedShifts.length },
      });
      const publicEmployeesUpdated = await get().refreshPublicEmployeesSnapshot(get().employees.filter((employee) => employee.id !== employeeId));
      set({
        warningMessage: publicEmployeesUpdated
          ? 'Ο υπάλληλος διαγράφηκε.'
          : 'Ο υπάλληλος διαγράφηκε, αλλά η δημόσια λίστα δεν ενημερώθηκε.',
      });
      return true;
    } catch (error) {
      set({ warningMessage: error?.message || 'Αποτυχία διαγραφής υπαλλήλου.' });
      return false;
    }
  },

  addShiftTemplate: async ({ label, date, startTime, endTime }) => {
    if (!requireAdmin(get, set)) return false;
    if (!label?.trim()) {
      set({ warningMessage: 'Το όνομα custom βάρδιας είναι υποχρεωτικό.' });
      return false;
    }
    if (!date) {
      set({ warningMessage: 'Επίλεξε ημερομηνία για την κάρτα βάρδιας.' });
      return false;
    }

    try {
      parseShiftInput(startTime, endTime);
      await createShiftTemplate({
        tenantId: getPublicTenantId(),
        label: label.trim(),
        date,
        startTime,
        endTime,
        isPlaced: false,
        type: SHIFT_TYPES.WORK,
      });
      set({ warningMessage: 'Η custom κάρτα βάρδιας δημιουργήθηκε.' });
      return true;
    } catch (error) {
      set({ warningMessage: error.message || 'Αποτυχία δημιουργίας custom βάρδιας.' });
      return false;
    }
  },

  placeShiftTemplate: async ({ templateId, date }) => {
    if (!requireAdmin(get, set)) return;
    if (!templateId || !date) return;

    const template = get().shiftTemplates.find((item) => item.id === templateId);
    if (!template) return;

    set({ isSaving: true });
    try {
      await updateShiftTemplate(templateId, { isPlaced: true, date }, getTenantArgs());
      set({
        shiftTemplates: get().shiftTemplates.map((item) =>
          item.id === templateId ? { ...item, isPlaced: true, date } : item,
        ),
      });
    } finally {
      set({ isSaving: false });
    }
  },

  assignShiftFromTemplate: async ({ templateId, employeeId }) => {
    if (!requireAdmin(get, set)) return;
    if (!templateId || !employeeId) return;

    const template = get().shiftTemplates.find((item) => item.id === templateId);
    if (!template) return;

    set({ isSaving: true });
    try {
      const createdShift = await get().addShift({
        employeeId,
        date: template.date,
        startTime: template.startTime,
        endTime: template.endTime,
        label: template.label,
        trackUndo: true,
        type: template.type || SHIFT_TYPES.WORK,
      });

      if (!createdShift?.id) return;
      await removeShiftTemplate(templateId, getTenantArgs());
      set({
        shiftTemplates: get().shiftTemplates.filter((item) => item.id !== templateId),
      });
    } finally {
      set({ isSaving: false });
    }
  },

  deleteShiftTemplate: async (templateId) => {
    if (!requireAdmin(get, set)) return false;
    if (!templateId) return false;
    set({ isSaving: true });
    try {
      await removeShiftTemplate(templateId, getTenantArgs());
      set({
        shiftTemplates: get().shiftTemplates.filter((item) => item.id !== templateId),
      });
      return true;
    } catch (error) {
      set({ warningMessage: error?.message || 'Failed to update shift.' });
      return false;
    } finally {
      set({ isSaving: false });
    }
  },

  addShift: async ({
    employeeId,
    date,
    startTime,
    endTime,
    label,
    shiftType = '',
    customLabel = '',
    type = SHIFT_TYPES.WORK,
    notes = '',
    isHoliday = false,
    isSpecialDay = false,
    specialDayLabel = '',
    isManualOverride = true,
    trackUndo = false,
  }) => {
    if (!requireAdmin(get, set)) return null;
    if (!employeeId || !date) {
      set({ warningMessage: 'Select employee and date for the shift.' });
      return null;
    }

    try {
      parseShiftInput(startTime, endTime);
      const sundayViolation = await evaluateSundayRuleViolation({
        employeeId,
        date,
        startTime,
        endTime,
        hasConsecutiveSundayAssignmentFn: (params) =>
          hasConsecutiveSundayAssignment({ tenantId: getPublicTenantId(), ...params }),
      });

      const isWork = type === SHIFT_TYPES.WORK;
      const conflict = isWork ? hasTimeOverlap(get().shifts, { employeeId, date, startTime, endTime }) : false;
      if (conflict) {
        set({
          warningMessage: 'Save failed: overlapping shift for the same employee.',
        });
        return null;
      }

      set({ isSaving: true });
      const normalizedShiftType = shiftType || inferShiftTypeFromTimes(startTime, endTime);
      const createdShift = await createShift({
        tenantId: getPublicTenantId(),
        employeeId,
        date,
        startTime,
        endTime,
        type,
        label: label || 'Manual',
        notes,
        shiftType: normalizedShiftType,
        customLabel: normalizedShiftType === 'custom' ? customLabel || label || 'Custom' : '',
        isHoliday: Boolean(isHoliday),
        isSpecialDay: Boolean(isSpecialDay || isHoliday),
        specialDayLabel: specialDayLabel?.trim() || '',
        isManualOverride: Boolean(isManualOverride),
      });

      if (createdShift?.id) {
        set((state) => ({
          shifts: sortShiftsByDateAndStart([...state.shifts, createdShift]),
        }));
        await recordAuditLog(get, {
          action: 'shift.manual.create',
          target: { collection: 'shifts', id: createdShift.id, scope: date },
          before: null,
          after: createdShift,
        });
      }

      if (trackUndo && createdShift?.id) {
        set({
          undoState: buildUndoState('add_shift', 'Shift assigned.', { shiftId: createdShift.id }),
        });
      }

      let snapshotWarning = '';
      try {
        await get().saveCurrentWeekSnapshot('manual_save');
        await get().loadWeekHistory();
      } catch {
        snapshotWarning = 'Shift was saved, but history refresh failed.';
      }

      if (sundayViolation.violated && createdShift?.id) {
        set((state) => ({
          sundayRuleViolations: {
            ...state.sundayRuleViolations,
            [createdShift.id]: sundayViolation.message,
          },
          warningMessage: sundayViolation.message,
        }));
      } else if (snapshotWarning) {
        set({ warningMessage: snapshotWarning });
      }

      return createdShift;
    } catch (error) {
      set({ warningMessage: error.message || 'Failed to create shift.' });
      return null;
    } finally {
      set({ isSaving: false });
    }
  },

  updateShiftDetails: async ({
    shiftId,
    employeeId,
    date,
    startTime,
    endTime,
    label,
    shiftType = '',
    customLabel = '',
    type = SHIFT_TYPES.WORK,
    notes = '',
    isHoliday = false,
    isSpecialDay = false,
    specialDayLabel = '',
    isManualOverride = true,
  }) => {
    if (!requireAdmin(get, set)) return false;
    if (!shiftId || !employeeId || !date) return false;

    const currentShift = get().shifts.find((shift) => shift.id === shiftId);
    if (!currentShift) return false;

    try {
      parseShiftInput(startTime, endTime);

      const isWork = type === SHIFT_TYPES.WORK;
      const conflict = isWork
        ? hasTimeOverlap(get().shifts, { id: shiftId, employeeId, date, startTime, endTime })
        : false;
      if (conflict) {
        set({
          warningMessage:
            'Update failed: overlapping shift for the same employee.',
        });
        return false;
      }

      const sundayViolation = await evaluateSundayRuleViolation({
        employeeId,
        date,
        startTime,
        endTime,
        hasConsecutiveSundayAssignmentFn: (params) =>
          hasConsecutiveSundayAssignment({ tenantId: getPublicTenantId(), ...params }),
      });

      const payload = buildNormalizedShiftPayload({
        employeeId,
        date,
        startTime,
        endTime,
        label,
        shiftType,
        customLabel,
        type,
        notes,
        isHoliday,
        isSpecialDay,
        specialDayLabel,
        isManualOverride,
      });

      set({ isSaving: true });
      await updateShift(shiftId, payload, getTenantArgs());
      await recordAuditLog(get, {
        action: 'shift.manual.update',
        target: { collection: 'shifts', id: shiftId, scope: date },
        before: currentShift,
        after: { ...currentShift, ...payload },
      });
      set((state) => ({
        shifts: sortShiftsByDateAndStart(
          state.shifts.map((shift) => (shift.id === shiftId ? { ...shift, ...payload } : shift)),
        ),
      }));

      let snapshotWarning = '';
      try {
        await get().saveCurrentWeekSnapshot('manual_save');
        await get().loadWeekHistory();
      } catch {
        snapshotWarning = 'Shift was updated, but history refresh failed.';
      }

      set((state) => {
        const nextViolations = { ...state.sundayRuleViolations };
        delete nextViolations[shiftId];
        if (sundayViolation.violated) {
          nextViolations[shiftId] = sundayViolation.message;
        }

        return {
          sundayRuleViolations: nextViolations,
          warningMessage: sundayViolation.violated
            ? sundayViolation.message
            : snapshotWarning || 'Shift updated.',
        };
      });

      return true;
    } catch (error) {
      set({ warningMessage: error?.message || 'Failed to delete custom template card.' });
      return false;
    } finally {
      set({ isSaving: false });
    }
  },

  moveShift: async ({ shiftId, date, startTime, endTime, label }) => {
    if (!requireAdmin(get, set)) return;

    const currentShift = get().shifts.find((shift) => shift.id === shiftId);
    if (!currentShift) return;

    set({ isSaving: true });
    try {
      parseShiftInput(startTime, endTime);
      const isWork = (currentShift.type || SHIFT_TYPES.WORK) === SHIFT_TYPES.WORK;
      if (isWork) {
        const conflict = hasTimeOverlap(get().shifts, {
          id: shiftId,
          employeeId: currentShift.employeeId,
          date,
          startTime,
          endTime,
        });
        if (conflict) {
          set({ warningMessage: 'Αποτυχία μετακίνησης: εντοπίστηκε επικάλυψη βάρδιας.' });
          return;
        }
      }
      await updateShift(
        shiftId,
        {
          date,
          startTime,
          endTime,
          label,
          shiftType: currentShift.shiftType || inferShiftTypeFromTimes(startTime, endTime),
          isManualOverride: true,
        },
        getTenantArgs(),
      );
      await recordAuditLog(get, {
        action: 'shift.manual.move',
        target: { collection: 'shifts', id: shiftId, scope: date },
        before: currentShift,
        after: {
          ...currentShift,
          date,
          startTime,
          endTime,
          label,
          shiftType: currentShift.shiftType || inferShiftTypeFromTimes(startTime, endTime),
          isManualOverride: true,
        },
      });
      await get().saveCurrentWeekSnapshot('manual_save');
      await get().loadWeekHistory();
    } finally {
      set({ isSaving: false });
    }

    set({
      undoState: buildUndoState('move_shift', 'Η βάρδια μετακινήθηκε.', {
        shiftId,
        previousValues: {
          date: currentShift.date,
          startTime: currentShift.startTime,
          endTime: currentShift.endTime,
          label: currentShift.label,
        },
      }),
    });
  },

  toggleShiftManualOverride: async ({ shiftId, value }) => {
    if (!requireAdmin(get, set)) return false;
    if (!shiftId) return false;

    const currentShift = get().shifts.find((shift) => shift.id === shiftId);
    if (!currentShift) return false;

    const nextValue = typeof value === 'boolean' ? value : !Boolean(currentShift.isManualOverride);
    set({ isSaving: true });
    try {
      await updateShift(shiftId, { isManualOverride: nextValue }, getTenantArgs());
      await recordAuditLog(get, {
        action: 'shift.manual_override.toggle',
        target: { collection: 'shifts', id: shiftId, scope: currentShift.date },
        before: currentShift,
        after: { ...currentShift, isManualOverride: nextValue },
      });
      set((state) => ({
        shifts: state.shifts.map((shift) =>
          shift.id === shiftId ? { ...shift, isManualOverride: nextValue } : shift,
        ),
      }));
      await get().saveCurrentWeekSnapshot('manual_save');
      await get().loadWeekHistory();
      set({
        warningMessage: nextValue
          ? 'Η βάρδια επισημάνθηκε ως manual override.'
          : 'Η βάρδια επέστρεψε σε auto-managed κατάσταση.',
      });
      return true;
    } finally {
      set({ isSaving: false });
    }
  },

  deleteShift: async (shiftId) => {
    if (!requireAdmin(get, set)) return false;
    const existingShift = get().shifts.find((item) => item.id === shiftId);
    if (!existingShift) return false;

    set({ isSaving: true });
    let removedShift = null;
    try {
      removedShift = await removeShift(shiftId, getTenantArgs());
      if (removedShift) {
        await recordAuditLog(get, {
          action: 'shift.manual.delete',
          target: { collection: 'shifts', id: shiftId, scope: removedShift.date },
          before: removedShift,
          after: null,
        });
      }
    } finally {
      set({ isSaving: false });
    }
    if (!removedShift) return false;

    set((state) => ({
      shifts: state.shifts.filter((item) => item.id !== shiftId),
      undoState: buildUndoState('delete_shift', 'Η βάρδια διαγράφηκε.', { shift: removedShift }),
    }));
    await get().saveCurrentWeekSnapshot('manual_save');
    await get().loadWeekHistory();
    return true;
  },

  clearWeekShifts: async () => {
    if (!requireAdmin(get, set)) return false;

    const weekDays = getWeekDays(get().weekStart);
    const weekSet = new Set(weekDays);
    set({ isSaving: true });
    const removedById = new Map();

    try {
      const removedShifts = await removeShiftsByDates(weekDays, getTenantArgs());
      removedShifts.forEach((shift) => {
        if (shift?.id) removedById.set(shift.id, shift);
      });
      await recordAuditLog(get, {
        action: 'schedule.clear_week',
        target: { collection: 'shifts', scope: `${weekDays[0]}_${weekDays[6]}` },
        before: [...removedById.values()],
        after: [],
        metadata: { removedShiftCount: removedById.size },
      });
    } catch (error) {
      set({ warningMessage: error?.message || 'Failed to clear week.' });
      return false;
    } finally {
      set({ isSaving: false });
    }

    set((state) => ({
      shifts: state.shifts.filter((shift) => !weekSet.has(shift.date)),
      warningMessage: 'Week shifts were cleared.',
      undoState: buildUndoState('clear_week', 'Week cleared.', { shifts: [...removedById.values()] }),
    }));

    await get().refreshWeekLockStatus();
    try {
      await get().saveCurrentWeekSnapshot('manual_save');
      await get().loadWeekHistory();
    } catch {
      set({ warningMessage: 'Week cleared, but history refresh failed.' });
    }

    return true;
  },

  clearMonthShifts: async ({ year, month }) => {
    if (!requireAdmin(get, set)) return false;
    if (get().schedulerSchemaVersion === 3) {
      set({ warningMessage: 'Ο καθαρισμός V2 δεν επιτρέπεται σε κατάστημα V3. Δημιούργησε νέο προσχέδιο.' });
      return false;
    }

    const numericYear = Number(year);
    const numericMonth = Number(month);
    if (!Number.isInteger(numericYear) || !Number.isInteger(numericMonth) || numericMonth < 0 || numericMonth > 11) {
      set({ warningMessage: 'Μη έγκυρος μήνας για καθαρισμό.' });
      return false;
    }

    const { days: monthDays } = getMonthDays(numericYear, numericMonth);
    if (!monthDays.length) {
      set({ warningMessage: 'Δεν βρέθηκαν ημέρες για τον επιλεγμένο μήνα.' });
      return false;
    }

    const monthSet = new Set(monthDays);
    const publishedWeekStarts = getWeekStartsForDates(monthDays);
    set({ isSaving: true });
    const removedById = new Map();
    let removedPublishedWeekCount = 0;

    try {
      const removedShifts = await removeShiftsByDates(monthDays, getTenantArgs());
      removedShifts.forEach((shift) => {
        if (shift?.id) removedById.set(shift.id, shift);
      });
      removedPublishedWeekCount = await deletePublishedSchedulesByWeekStarts({
        tenantId: getPublicTenantId(),
        weekStarts: publishedWeekStarts,
      });
      await deletePublishedMonth({
        tenantId: getPublicTenantId(),
        yearMonth: getYearMonthFromParts(numericYear, numericMonth + 1),
      });
      await recordAuditLog(get, {
        action: 'schedule.clear_month',
        target: { collection: 'shifts', scope: `${numericYear}-${String(numericMonth + 1).padStart(2, '0')}` },
        before: [...removedById.values()],
        after: [],
        metadata: { removedShiftCount: removedById.size, removedPublishedWeekCount },
      });
    } catch (error) {
      set({ warningMessage: error?.message || 'Αποτυχία καθαρισμού μήνα.' });
      return false;
    } finally {
      set({ isSaving: false });
    }

    const monthLabel = String(numericMonth + 1).padStart(2, '0');
    const removedShiftCount = removedById.size;
    set((state) => ({
      shifts: state.shifts.filter((shift) => !monthSet.has(shift.date)),
      publishedSchedule: publishedWeekStarts.includes(state.publishedSchedule?.weekStart) ? null : state.publishedSchedule,
      publishedSchedulesByWeek: {
        ...state.publishedSchedulesByWeek,
        ...Object.fromEntries(publishedWeekStarts.map((weekStart) => [weekStart, null])),
      },
      publishedMonth: state.publishedMonth?.yearMonth === getYearMonthFromParts(numericYear, numericMonth + 1)
        ? null
        : state.publishedMonth,
      publishedMonthsByMonth: {
        ...state.publishedMonthsByMonth,
        [getYearMonthFromParts(numericYear, numericMonth + 1)]: null,
      },
      warningMessage:
        removedShiftCount > 0
          ? `Οι βάρδιες για ${monthLabel}/${numericYear} καθαρίστηκαν.`
          : `Δεν βρέθηκαν βάρδιες για ${monthLabel}/${numericYear}.`,
      undoState:
        removedShiftCount > 0
          ? buildUndoState('clear_month', 'Ο μήνας καθαρίστηκε.', { shifts: [...removedById.values()] })
          : state.undoState,
    }));

    await get().refreshWeekLockStatus();
    return { ok: true, removedCount: removedShiftCount, removedPublishedWeekCount };
  },

  addAnnouncement: async ({ title, body }) => {
    if (!requireAdmin(get, set)) return false;
    if (!title?.trim() || !body?.trim()) {
      set({ warningMessage: 'Συμπλήρωσε τίτλο και περιεχόμενο ανακοίνωσης.' });
      return false;
    }

    set({ isSaving: true });
    try {
      const createdAnnouncement = await createAnnouncement({
        tenantId: getPublicTenantId(),
        title: title.trim(),
        body: body.trim(),
        authorEmail: get().adminUser?.email || '',
      });
      await recordAuditLog(get, {
        action: 'announcement.create',
        target: { collection: 'announcements', id: createdAnnouncement?.id || '' },
        before: null,
        after: createdAnnouncement,
      });
      let publicAnnouncementUpdated = true;
      try {
        await publishPublicAnnouncement({
          tenantId: getPublicTenantId(),
          announcement: createdAnnouncement,
        });
      } catch {
        publicAnnouncementUpdated = false;
      }
      set({
        warningMessage: publicAnnouncementUpdated
          ? 'Η ανακοίνωση δημοσιεύτηκε.'
          : 'Η ανακοίνωση δημοσιεύτηκε, αλλά η δημόσια προβολή δεν ενημερώθηκε.',
      });
      return true;
    } catch (error) {
      set({ warningMessage: error.message || 'Αποτυχία δημοσίευσης ανακοίνωσης.' });
      return false;
    } finally {
      set({ isSaving: false });
    }
  },

  loadWeekHistory: async ({ force = true } = {}) => {
    if (!get().isAdmin) return;
    const now = Date.now();
    const { _weekHistoryFetchedAt } = get();
    if (!force && _weekHistoryFetchedAt && now - _weekHistoryFetchedAt < WEEK_HISTORY_TTL_MS) {
      return;
    }
    try {
      const weekHistory = await fetchWeekHistoryList(60, getTenantArgs());
      set({ weekHistory, _weekHistoryFetchedAt: Date.now() });
    } catch {
      set({ warningMessage: 'Αποτυχία φόρτωσης ιστορικού εβδομάδων.' });
    }
  },

  loadWeekTemplates: async ({ force = true } = {}) => {
    if (!get().isAdmin) return;
    const now = Date.now();
    const { _weekTemplatesFetchedAt } = get();
    if (!force && _weekTemplatesFetchedAt && now - _weekTemplatesFetchedAt < WEEK_TEMPLATES_TTL_MS) {
      return;
    }
    try {
      const weekTemplates = await fetchWeekTemplates(getTenantArgs());
      set({ weekTemplates, _weekTemplatesFetchedAt: Date.now() });
    } catch {
      set({ warningMessage: 'Αποτυχία φόρτωσης templates.' });
    }
  },

  setSelectedHistoryWeekId: (selectedHistoryWeekId) => set({ selectedHistoryWeekId }),
  setSelectedTemplateId: (selectedTemplateId) => set({ selectedTemplateId }),

  saveCurrentWeekManually: async () => {
    if (!requireAdmin(get, set)) return false;

    set({ isSaving: true });
    try {
      const snapshotResult = await get().saveCurrentWeekSnapshot('manual_save_button');
      await get().loadWeekHistory();
      set({
        warningMessage: snapshotResult?.publicUpdated === false
          ? 'Η εβδομάδα αποθηκεύτηκε στο ιστορικό, αλλά η δημόσια προβολή δεν ενημερώθηκε.'
          : 'Η εβδομάδα αποθηκεύτηκε στο ιστορικό.',
      });
      return snapshotResult || true;
    } catch (error) {
      set({ warningMessage: error?.message || 'Αποτυχία αποθήκευσης ιστορικού εβδομάδας.' });
      return false;
    } finally {
      set({ isSaving: false });
    }
  },

  saveCurrentWeekSnapshot: async (source = 'manual_save') => {
    if (!get().isAdmin) return;
    const weekStart = get().weekStart;
    if (!weekStart) return;

    const weekDays = getWeekDays(weekStart);
    const weekSet = new Set(weekDays);
    let weekShifts = get().shifts.filter((shift) => weekSet.has(shift.date));

    try {
      const firestoreWeekShifts = await fetchShiftsByDates(weekDays, getTenantArgs());
      weekShifts = (firestoreWeekShifts || []).filter((shift) => weekSet.has(shift.date));
    } catch {
      // Fallback to local state snapshot if Firestore read fails.
    }

    const normalizedShifts = weekShifts.map((shift) => ({
      employeeId: shift.employeeId,
      date: shift.date,
      startTime: shift.startTime,
      endTime: shift.endTime,
      label: shift.label || '',
      type: shift.type || SHIFT_TYPES.WORK,
      notes: shift.notes || '',
      shiftType: shift.shiftType || inferShiftTypeFromTimes(shift.startTime, shift.endTime),
      customLabel: shift.customLabel || '',
      isHoliday: Boolean(shift.isHoliday),
      isSpecialDay: Boolean(shift.isSpecialDay),
      specialDayLabel: shift.specialDayLabel || '',
      isManualOverride: Boolean(shift.isManualOverride),
    }));

    const employees = get().employees || [];
    const analytics = calculateWeeklyTotals(normalizedShifts, employees, weekDays);
    const employeeSummaries = employees.map((employee) => {
      const leave = analytics.leaveDaysByEmployee?.[employee.id] || {};
      const breakdown = analytics.workBreakdownByEmployee?.[employee.id] || {};
      return {
        employeeId: employee.id,
        employeeName: employee.fullName || '',
        totalHours: analytics.totalsByEmployee?.[employee.id] || 0,
        shiftsCount: analytics.shiftsCountByEmployee?.[employee.id] || 0,
        morning: breakdown.morning || 0,
        intermediate: breakdown.intermediate || 0,
        evening: breakdown.evening || 0,
        custom: breakdown.custom || 0,
        restDays: leave.restDays || 0,
        leaveDays: leave.leaveDays || 0,
        sickDays: leave.sickDays || 0,
        nonWorkingSundays: leave.nonWorkingSundays || 0,
        inferredRestDays: leave.inferredRestDays || 0,
      };
    });

    await saveWeekHistorySnapshot({
      tenantId: getPublicTenantId(),
      weekId: getWeekIdFromWeekStart(weekStart),
      weekStart: weekDays[0],
      weekEnd: weekDays[6],
      source,
      shifts: normalizedShifts,
      createdBy: get().adminUser?.email || '',
      metadata: {
        totalShifts: normalizedShifts.length,
        totalWorkHours: analytics.totalHours,
        totalsByType: analytics.totalsByType,
        employeeSummaries,
      },
    });
    await recordAuditLog(get, {
      action: 'week_history.snapshot.create',
      target: { collection: 'week_history', id: getWeekIdFromWeekStart(weekStart), scope: `${weekDays[0]}_${weekDays[6]}` },
      before: null,
      after: { weekStart: weekDays[0], weekEnd: weekDays[6], shiftCount: normalizedShifts.length, source },
      metadata: {
        totalWorkHours: analytics.totalHours,
        totalShifts: normalizedShifts.length,
      },
    });

    const publicUpdated = await get().refreshPublicWeekSnapshot({ weekStart, shifts: weekShifts });
    return { publicUpdated };
  },

  loadSelectedHistoryWeekToGrid: async () => {
    if (!requireAdmin(get, set)) return false;
    const selectedWeekId = get().selectedHistoryWeekId;
    if (!selectedWeekId) return false;

    let snapshot = null;
    try {
      snapshot = await fetchLatestWeekSnapshotByWeekId(selectedWeekId, getTenantArgs());
    } catch (error) {
      set({ warningMessage: error?.message || 'Αποτυχία ανάκτησης ιστορικής εβδομάδας.' });
      return false;
    }
    if (!snapshot?.weekStart || !Array.isArray(snapshot.shifts)) {
      set({ warningMessage: 'Δεν βρέθηκε αποθηκευμένη εβδομάδα για φόρτωση.' });
      return false;
    }

    const weekDays = getWeekDays(snapshot.weekStart);
    set({ isSaving: true, weekStart: snapshot.weekStart });
    get().startPublishedScheduleSubscription(snapshot.weekStart);
    try {
      const existingWeekShifts = await fetchShiftsByDates(weekDays, getTenantArgs());
      await replaceShiftsBatch({
        tenantId: getPublicTenantId(),
        shiftsToRemove: existingWeekShifts,
        shiftsToCreate: snapshot.shifts,
      });
      await recordAuditLog(get, {
        action: 'schedule.load_history_week',
        target: { collection: 'shifts', id: selectedWeekId, scope: `${weekDays[0]}_${weekDays[6]}` },
        before: existingWeekShifts,
        after: snapshot.shifts,
        metadata: { loadedShiftCount: snapshot.shifts.length },
      });
      const weekSet = new Set(weekDays);
      set((state) => ({
        shifts: sortShiftsByDateAndStart([
          ...state.shifts.filter((shift) => !weekSet.has(shift.date)),
          ...snapshot.shifts,
        ]),
      }));
      set({ warningMessage: 'Η εβδομάδα φορτώθηκε από το ιστορικό.' });
      await get().refreshWeekLockStatus();
      await get().saveCurrentWeekSnapshot('history_load');
      await get().loadWeekHistory();
      return true;
    } catch (error) {
      set({ warningMessage: error?.message || 'Αποτυχία φόρτωσης ιστορικής εβδομάδας.' });
      return false;
    } finally {
      set({ isSaving: false });
    }
  },

  saveCurrentWeekAsTemplate: async (name) => {
    if (!requireAdmin(get, set)) return false;
    const templateName = (name || '').trim();
    if (!templateName) {
      set({ warningMessage: 'Δώσε όνομα template.' });
      return false;
    }

    const weekDays = getWeekDays(get().weekStart);
    const weekSet = new Set(weekDays);
    const weekShifts = get().shifts
      .filter((shift) => weekSet.has(shift.date))
      .map((shift) => ({
        employeeId: shift.employeeId,
        dateOffset: weekDays.indexOf(shift.date),
        startTime: shift.startTime,
        endTime: shift.endTime,
        label: shift.label || '',
        type: shift.type || SHIFT_TYPES.WORK,
        notes: shift.notes || '',
        shiftType: shift.shiftType || inferShiftTypeFromTimes(shift.startTime, shift.endTime),
        customLabel: shift.customLabel || '',
        isHoliday: Boolean(shift.isHoliday),
        isSpecialDay: Boolean(shift.isSpecialDay),
        specialDayLabel: shift.specialDayLabel || '',
      }))
      .filter((shift) => shift.dateOffset >= 0);

    try {
      await saveWeekTemplate({
        tenantId: getPublicTenantId(),
        name: templateName,
        weekStart: get().weekStart,
        shifts: weekShifts,
        createdBy: get().adminUser?.email || '',
      });
      await recordAuditLog(get, {
        action: 'week_template.create',
        target: { collection: 'week_templates', scope: get().weekStart },
        before: null,
        after: { name: templateName, weekStart: get().weekStart, shiftCount: weekShifts.length },
      });
      set({ warningMessage: 'Το template αποθηκεύτηκε.' });
      await get().loadWeekTemplates();
      return true;
    } catch (error) {
      set({ warningMessage: error?.message || 'Αποτυχία αποθήκευσης template.' });
      return false;
    }
  },

  loadSelectedTemplateIntoCurrentWeek: async () => {
    if (!requireAdmin(get, set)) return false;
    const templateId = get().selectedTemplateId;
    if (!templateId) return false;

    const template = get().weekTemplates.find((item) => item.id === templateId);
    if (!template) {
      set({ warningMessage: 'Δεν βρέθηκε template.' });
      return false;
    }

    const weekDays = getWeekDays(get().weekStart);
    const shiftsToCreate = (template.shifts || []).map((shift) => ({
      employeeId: shift.employeeId,
      date: weekDays[shift.dateOffset] || weekDays[0],
      startTime: shift.startTime,
      endTime: shift.endTime,
      label: shift.label || 'Template',
      type: shift.type || SHIFT_TYPES.WORK,
      notes: shift.notes || '',
      shiftType: shift.shiftType || inferShiftTypeFromTimes(shift.startTime, shift.endTime),
      customLabel: shift.customLabel || '',
      isHoliday: Boolean(shift.isHoliday),
      isSpecialDay: Boolean(shift.isSpecialDay),
      specialDayLabel: shift.specialDayLabel || '',
      isManualOverride: true,
    }));

    set({ isSaving: true });
    try {
      const existingWeekShifts = await fetchShiftsByDates(weekDays, getTenantArgs());
      await replaceShiftsBatch({
        tenantId: getPublicTenantId(),
        shiftsToRemove: existingWeekShifts,
        shiftsToCreate,
      });
      await recordAuditLog(get, {
        action: 'schedule.load_template_week',
        target: { collection: 'shifts', id: templateId, scope: `${weekDays[0]}_${weekDays[6]}` },
        before: existingWeekShifts,
        after: shiftsToCreate,
        metadata: { loadedShiftCount: shiftsToCreate.length },
      });
      const weekSet = new Set(weekDays);
      set((state) => ({
        shifts: sortShiftsByDateAndStart([
          ...state.shifts.filter((shift) => !weekSet.has(shift.date)),
          ...shiftsToCreate,
        ]),
      }));
      set({ warningMessage: 'Το template εφαρμόστηκε στην εβδομάδα.' });
      await get().saveCurrentWeekSnapshot('template_load');
      await get().loadWeekHistory();
      return true;
    } catch (error) {
      set({ warningMessage: error?.message || 'Αποτυχία φόρτωσης template.' });
      return false;
    } finally {
      set({ isSaving: false });
    }
  },

  deleteAnnouncement: async (announcementId) => {
    if (!requireAdmin(get, set)) return false;
    if (!announcementId) return false;

    set({ isSaving: true });
    try {
      const announcement = get().announcements.find((item) => item.id === announcementId) || null;
      await removeAnnouncement(announcementId, getTenantArgs());
      await recordAuditLog(get, {
        action: 'announcement.delete',
        target: { collection: 'announcements', id: announcementId },
        before: announcement,
        after: null,
      });
      let publicAnnouncementUpdated = true;
      try {
        await deletePublicAnnouncement({ tenantId: getPublicTenantId(), announcementId });
      } catch {
        publicAnnouncementUpdated = false;
      }
      set({
        warningMessage: publicAnnouncementUpdated
          ? 'Η ανακοίνωση διαγράφηκε.'
          : 'Η ανακοίνωση διαγράφηκε, αλλά η δημόσια προβολή δεν ενημερώθηκε.',
      });
      return true;
    } catch (error) {
      set({ warningMessage: error.message || 'Αποτυχία διαγραφής ανακοίνωσης.' });
      return false;
    } finally {
      set({ isSaving: false });
    }
  },

  generateMagicWeek: async () => {
    if (!requireAdmin(get, set)) return false;

    const isV2 = Boolean(get().schedulerConfigV2);
    if (!isV2) {
      const roleValidation = validateSchedulerRoleConfiguration(get().employees);
      if (!roleValidation.valid) {
        set({ warningMessage: roleValidation.message });
        return false;
      }
    }

    const weekDays = getWeekDays(get().weekStart);
    const weekSet = new Set(weekDays);
    const weekExistingShifts = get().shifts.filter((shift) => weekSet.has(shift.date));
    const weeklyRules = normalizeGeneratorRules(get().generatorRules);
    const preserveManualOverrides = weeklyRules.allowManualOverride !== false;
    const manualWeekShifts = preserveManualOverrides
      ? weekExistingShifts.filter(isProtectedSchedulerEntry)
      : [];
    const autoWeekShifts = preserveManualOverrides
      ? weekExistingShifts.filter((shift) => !isProtectedSchedulerEntry(shift))
      : weekExistingShifts;

    set({ isSaving: true });
    try {
      const generationRunId = createGenerationRunId('week_generation');
      const schedulerConfig = get().schedulerConfigV2
        ? mergeSchedulerConfigSpecialDays(get().schedulerConfigV2, get().specialDaysByDate)
        : undefined;
      const { shifts: generatedShifts, warnings, validation } = await generateEngineWeekSchedule({
        weekDays,
        employees: get().employees,
        allShifts: get().shifts,
        absences: getAbsencesForRange(get().absences, weekDays[0], weekDays[weekDays.length - 1]),
        rules: weeklyRules,
        schedulerConfig,
      });

      const manualKey = new Set(manualWeekShifts.map((shift) => `${shift.employeeId}_${shift.date}`));
      const safeGeneratedShifts = generatedShifts.filter((shift) => {
        if (manualKey.has(`${shift.employeeId}_${shift.date}`)) return false;
        return !hasTimeOverlap(manualWeekShifts, shift);
      });

      const shiftsToCreate = safeGeneratedShifts.map((shift) => ({ ...shift, generationRunId }));
      const finalCandidate = [...manualWeekShifts, ...shiftsToCreate];
      const finalValidation = revalidateScheduleCandidate({
        candidateShifts: finalCandidate,
        employees: get().employees,
        allShifts: get().shifts,
        absences: getAbsencesForRange(get().absences, weekDays[0], weekDays[weekDays.length - 1]),
        rules: weeklyRules,
        schedulerConfig,
        startDate: weekDays[0],
        endDate: weekDays[weekDays.length - 1],
        dates: weekDays,
      });

      const persistenceResult = await persistValidatedSchedule({
        generationResult: {
          shifts: shiftsToCreate,
          finalCandidate,
          warnings,
          validation: finalValidation,
        },
        persist: async () => {
          await replaceShiftsBatch({
            tenantId: getPublicTenantId(),
            shiftsToRemove: autoWeekShifts,
            shiftsToCreate,
          });
          await recordAuditLog(get, {
            action: 'schedule.generate_week',
            target: { collection: 'shifts', scope: `${weekDays[0]}_${weekDays[6]}` },
            before: autoWeekShifts,
            after: shiftsToCreate,
            generationRunId,
            metadata: {
              generatedShiftCount: shiftsToCreate.length,
              removedAutoShiftCount: autoWeekShifts.length,
              manualOverrideCount: manualWeekShifts.length,
              warningCount: warnings.length,
            },
          });
          const savedWeekShifts = await fetchShiftsByDates(weekDays, getTenantArgs());
          set((state) => ({
            shifts: sortShiftsByDateAndStart([
              ...state.shifts.filter((shift) => !weekSet.has(shift.date)),
              ...savedWeekShifts,
            ]),
          }));
          const snapshotResult = await get().saveCurrentWeekSnapshot('magic_wand');
          await get().loadWeekHistory();
          return { snapshotResult };
        },
      });

      if (!persistenceResult.ok) {
        const errorMessages = persistenceResult.violations?.map((v) => v.message).filter(Boolean) || [];
        set({
          warningMessage: errorMessages.length
            ? errorMessages.join(' | ')
            : 'Αποτυχία επικύρωσης προγράμματος. Δεν αποθηκεύτηκαν βάρδιες.',
        });
        return false;
      }

      const snapshotResult = persistenceResult.value?.snapshotResult;

      if (warnings.length) {
        const messages = [...warnings];
        if (snapshotResult?.publicUpdated === false) {
          messages.push('Η δημόσια προβολή της εβδομάδας δεν ενημερώθηκε.');
        }
        set({ warningMessage: messages.join(' | ') });
      } else {
        set({
          warningMessage: [
            preserveManualOverrides
              ? `Η εβδομάδα δημιουργήθηκε αυτόματα με Magic Wand. Διατηρήθηκαν ${manualWeekShifts.length} manual entries.`
              : 'Η εβδομάδα δημιουργήθηκε αυτόματα με Magic Wand και έγινε πλήρης ανανέωση auto schedule.',
            snapshotResult?.publicUpdated === false
              ? 'Η δημόσια προβολή της εβδομάδας δεν ενημερώθηκε.'
              : '',
          ].filter(Boolean).join(' | '),
        });
      }
      return true;
    } finally {
      set({ isSaving: false });
    }
  },

  generateMagicMonth: async ({
    year,
    month,
    roleConfig = {},
    rules = {},
  }) => {
    if (!requireAdmin(get, set)) return false;
    if (typeof year !== 'number' || typeof month !== 'number') {
      set({ warningMessage: 'Μη έγκυρα στοιχεία μήνα για αυτόματη δημιουργία.' });
      return false;
    }

    const isV2 = Boolean(get().schedulerConfigV2 || rules?.schemaVersion === 2);
    if (!isV2) {
      const roleValidation = validateSchedulerRoleConfiguration(get().employees);
      if (!roleValidation.valid) {
        set({ warningMessage: roleValidation.message });
        return false;
      }
    }

    const monthDateSet = getMonthDateSet(year, month);
    const monthDatesForGeneration = [...monthDateSet].sort();
    const monthShifts = get().shifts.filter((shift) => monthDateSet.has(shift.date));
    const baseRules = normalizeGeneratorRules(get().generatorRules);
    const mergedRules = {
      ...baseRules,
      ...(rules || {}),
      fixedDaysOff: { ...(rules?.fixedDaysOff || {}) },
      specialDaysByDate: {
        ...(get().specialDaysByDate || {}),
        ...(rules?.specialDaysByDate || {}),
      },
    };
    const preserveManualOverrides = mergedRules.allowManualOverride !== false;
    const manualOverrides = preserveManualOverrides
      ? monthShifts.filter(isProtectedSchedulerEntry)
      : [];
    const autoGenerated = preserveManualOverrides
      ? monthShifts.filter((shift) => !isProtectedSchedulerEntry(shift))
      : monthShifts;
    const existingMonthShiftsForGeneration = preserveManualOverrides ? monthShifts : [];
    const allShiftsForGeneration = preserveManualOverrides
      ? get().shifts
      : get().shifts.filter((shift) => !monthDateSet.has(shift.date));

    set({ isSaving: true });
    try {
      const generationRunId = createGenerationRunId('month_generation');
      const schedulerConfigSource = get().schedulerConfigV2 || (rules?.schemaVersion === 2 ? rules : undefined);
      const schedulerConfig = schedulerConfigSource
        ? mergeSchedulerConfigSpecialDays(schedulerConfigSource, get().specialDaysByDate)
        : undefined;
      const { shifts: generatedShifts, warnings, validation, meta } = generateEngineMonthSchedule({
        month,
        year,
        employees: get().employees,
        allShifts: allShiftsForGeneration,
        existingMonthShifts: existingMonthShiftsForGeneration,
        absences: getAbsencesForRange(
          get().absences,
          monthDatesForGeneration[0],
          monthDatesForGeneration[monthDatesForGeneration.length - 1],
        ),
        rules: mergedRules,
        roleConfig,
        schedulerConfig,
      });

      const shiftsToCreate = generatedShifts.map((shift) => ({ ...shift, generationRunId }));
      const finalMonthCandidate = [...manualOverrides, ...shiftsToCreate];
      const monthDaysList = meta?.monthDays || monthDatesForGeneration;
      const finalValidation = revalidateScheduleCandidate({
        candidateShifts: finalMonthCandidate,
        employees: get().employees,
        allShifts: allShiftsForGeneration,
        absences: getAbsencesForRange(
          get().absences,
          monthDatesForGeneration[0],
          monthDatesForGeneration[monthDatesForGeneration.length - 1],
        ),
        rules: mergedRules,
        schedulerConfig,
        startDate: monthDaysList[0],
        endDate: monthDaysList[monthDaysList.length - 1],
        dates: monthDaysList,
      });

      const persistenceResult = await persistValidatedSchedule({
        generationResult: {
          shifts: shiftsToCreate,
          finalCandidate: finalMonthCandidate,
          warnings,
          validation: finalValidation,
        },
        persist: async () => {
          await replaceShiftsBatch({
            tenantId: getPublicTenantId(),
            shiftsToRemove: autoGenerated,
            shiftsToCreate,
          });
          await recordAuditLog(get, {
            action: 'schedule.generate_month',
            target: { collection: 'shifts', scope: `${year}-${String(month + 1).padStart(2, '0')}` },
            before: autoGenerated,
            after: shiftsToCreate,
            generationRunId,
            metadata: {
              generatedShiftCount: shiftsToCreate.length,
              removedAutoShiftCount: autoGenerated.length,
              manualOverrideCount: manualOverrides.length,
              warningCount: warnings?.length || 0,
            },
          });
          const savedMonthShifts = await fetchShiftsByDates(meta?.monthDays || [...monthDateSet], getTenantArgs());
          set((state) => ({
            shifts: sortShiftsByDateAndStart([
              ...state.shifts.filter((shift) => !monthDateSet.has(shift.date)),
              ...savedMonthShifts,
            ]),
          }));
          const publicMonthUpdated = await get().refreshPublicMonthSnapshot({
            year,
            month,
            monthDays: meta?.monthDays || monthDatesForGeneration,
            shifts: savedMonthShifts,
          });
          return { savedMonthShifts, publicMonthUpdated };
        },
      });

      if (!persistenceResult.ok) {
        const errorMessages = persistenceResult.violations?.map((v) => v.message).filter(Boolean) || [];
        set({
          warningMessage: errorMessages.length
            ? errorMessages.join(' | ')
            : 'Αποτυχία επικύρωσης προγράμματος μήνα. Δεν αποθηκεύτηκαν βάρδιες.',
        });
        return false;
      }

      const savedMonthShifts = persistenceResult.value?.savedMonthShifts || [];
      const publicMonthUpdated = persistenceResult.value?.publicMonthUpdated;

      const warningMessages = [];
      if (warnings?.length) warningMessages.push(...warnings);
      warningMessages.push(
        `Ολοκληρώθηκε αυτόματη δημιουργία μήνα. Auto entries: ${generatedShifts.length}, Manual overrides: ${manualOverrides.length}.`,
      );
      if (!publicMonthUpdated) {
        warningMessages.push('Η δημόσια προβολή του μήνα δεν ενημερώθηκε.');
      }

      set({
        warningMessage: warningMessages.join(' | '),
      });

      if (meta?.monthDays?.length) {
        const firstDay = meta.monthDays[0];
        if (firstDay) {
          const monday = getMonday(new Date(`${firstDay}T00:00:00`));
          set({ weekStart: getIsoDate(monday) });
          await get().refreshWeekLockStatus();
        }
      }

      return {
        ok: true,
        year,
        month,
        monthDays: meta?.monthDays || monthDatesForGeneration,
        shifts: savedMonthShifts,
        shiftCount: savedMonthShifts.length,
        manualOverrideCount: manualOverrides.length,
        generatedShiftCount: generatedShifts.length,
        warningCount: warnings?.length || 0,
      };
    } catch (error) {
      set({
        warningMessage:
          error?.message || 'Αποτυχία αυτόματης δημιουργίας μηνιαίου προγράμματος.',
      });
      return false;
    } finally {
      set({ isSaving: false });
    }
  },

  clearDayShifts: async (date) => {
    if (!requireAdmin(get, set)) return false;
    if (!date) return false;

    set({ isSaving: true });
    try {
      const removedShifts = await removeShiftsByDates([date], getTenantArgs());
      const templatesToRemove = get().shiftTemplates.filter((template) => template.isPlaced && template.date === date);
      await Promise.all(templatesToRemove.map((template) => removeShiftTemplate(template.id, getTenantArgs())));
      await recordAuditLog(get, {
        action: 'schedule.clear_day',
        target: { collection: 'shifts', scope: date },
        before: removedShifts,
        after: [],
        metadata: { removedShiftCount: removedShifts.length },
      });

      set((state) => ({
        shifts: state.shifts.filter((shift) => shift.date !== date),
        warningMessage: `Καθαρίστηκαν οι βάρδιες για ${formatDateGreek(date)}.`,
        shiftTemplates: state.shiftTemplates.filter((template) => !(template.isPlaced && template.date === date)),
      }));
      await get().saveCurrentWeekSnapshot('manual_save');
      await get().loadWeekHistory();
      return true;
    } catch (error) {
      set({ warningMessage: error?.message || 'Αποτυχία καθαρισμού ημέρας.' });
      return false;
    } finally {
      set({ isSaving: false });
    }
  },
}));

if (typeof window !== 'undefined' && import.meta.env.DEV) {
  window.__gasStationSchedulerStore = useSchedulerStore;
}

export default useSchedulerStore;
