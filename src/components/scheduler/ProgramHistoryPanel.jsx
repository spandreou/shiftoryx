import { CalendarDays, ChevronLeft, ChevronRight, FileDown, History, Loader2, RefreshCw } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { getShiftTypeLabel, SHIFT_TYPES } from '../../utils/analytics';
import { groupAndSortShiftsByDay } from '../../utils/scheduleUtils';
import { formatDateGreek } from '../../utils/time';
import StateNotice from '../feedback/StateNotice';

const HISTORY_WINDOW_SIZE = 6;

function formatTimestamp(value) {
  if (typeof value?.toDate === 'function') {
    return new Intl.DateTimeFormat('el-GR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(value.toDate());
  }
  if (value instanceof Date) {
    return new Intl.DateTimeFormat('el-GR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(value);
  }
  return '-';
}

function sourceLabel(source) {
  switch (source) {
    case 'manual_save_button':
      return 'Αποθήκευση';
    case 'manual_save':
      return 'Auto Save';
    case 'magic_wand':
      return 'Magic Wand';
    case 'finalize':
      return 'Αποθήκευση';
    case 'template_load':
      return 'Template';
    case 'history_load':
      return 'History Load';
    default:
      return source || 'manual';
  }
}

function monthLabel(year, month) {
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}

export default function ProgramHistoryPanel({
  isAdmin,
  employees = [],
  weekHistory = [],
  monthlyArchives = [],
  isMonthlyArchiveEnabled = false,
  isMonthlyArchiveLoading = false,
  selectedYear,
  selectedMonth,
  actionLoading = {},
  onCreateMonthlyArchive,
  onDownloadMonthlyArchive,
  canCreateMonthlyArchive = true,
}) {
  const [mode, setMode] = useState('month');
  const [selectedEntryId, setSelectedEntryId] = useState('');
  const [historyStartIndex, setHistoryStartIndex] = useState(0);

  const sortedHistory = useMemo(
    () =>
      [...weekHistory].sort((a, b) => {
        const aTime = typeof a?.createdAt?.toMillis === 'function' ? a.createdAt.toMillis() : 0;
        const bTime = typeof b?.createdAt?.toMillis === 'function' ? b.createdAt.toMillis() : 0;
        return bTime - aTime;
      }),
    [weekHistory],
  );

  const visibleHistory = useMemo(
    () => sortedHistory.slice(historyStartIndex, historyStartIndex + HISTORY_WINDOW_SIZE),
    [historyStartIndex, sortedHistory],
  );

  const maxHistoryStartIndex = useMemo(() => {
    if (!sortedHistory.length) return 0;
    return Math.floor((sortedHistory.length - 1) / HISTORY_WINDOW_SIZE) * HISTORY_WINDOW_SIZE;
  }, [sortedHistory]);

  const selectedEntry = useMemo(() => {
    if (!sortedHistory.length) return null;
    if (!selectedEntryId) return visibleHistory[0] || sortedHistory[0];
    return sortedHistory.find((entry) => entry.id === selectedEntryId) || visibleHistory[0] || sortedHistory[0];
  }, [selectedEntryId, sortedHistory, visibleHistory]);

  useEffect(() => {
    if (!sortedHistory.length) {
      setHistoryStartIndex(0);
      setSelectedEntryId('');
      return;
    }

    if (historyStartIndex > maxHistoryStartIndex) {
      setHistoryStartIndex(maxHistoryStartIndex);
      return;
    }

    const visibleIds = new Set(visibleHistory.map((entry) => entry.id));
    if (!selectedEntryId || !visibleIds.has(selectedEntryId)) {
      setSelectedEntryId(visibleHistory[0]?.id || '');
    }
  }, [historyStartIndex, maxHistoryStartIndex, selectedEntryId, sortedHistory, visibleHistory]);

  const employeeById = useMemo(() => new Map(employees.map((employee) => [employee.id, employee])), [employees]);
  const groupedShifts = useMemo(() => groupAndSortShiftsByDay(selectedEntry?.shifts || []), [selectedEntry]);
  const selectedYearMonth = monthLabel(selectedYear, selectedMonth);
  const isCreatingArchive = Boolean(actionLoading.archiveMonthPdf);
  const isDownloadingArchive = Boolean(actionLoading.downloadMonthlyArchive);

  if (!isAdmin) return null;

  return (
    <section className="glass-panel flex h-full flex-col rounded-2xl p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <History size={17} className="text-brand-700 dark:text-cyan-300" />
          <h2 className="text-base font-bold text-slate-900 sm:text-lg dark:text-white">Ιστορικό Προγραμμάτων</h2>
        </div>
        <div className="inline-flex rounded-lg border border-slate-300/70 bg-white/45 p-1 text-xs font-semibold dark:border-cyan-300/35 dark:bg-slate-900/45">
          {[
            { value: 'week', label: 'Εβδομάδα' },
            { value: 'month', label: 'Μήνας' },
          ].map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setMode(option.value)}
              className={`rounded-md px-2.5 py-1 transition ${
                mode === option.value
                  ? 'bg-brand-500 text-white'
                  : 'text-slate-700 hover:bg-white/70 dark:text-slate-200 dark:hover:bg-slate-800/70'
              }`}
              aria-pressed={mode === option.value}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {mode === 'week' ? (
        <div className="grid flex-1 gap-3 xl:grid-cols-[1fr,1.15fr]">
          <div className="space-y-2">
            <div className="flex justify-end gap-1.5">
              <button
                type="button"
                onClick={() => setHistoryStartIndex((prev) => Math.max(0, prev - HISTORY_WINDOW_SIZE))}
                disabled={historyStartIndex <= 0}
                className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-300/70 bg-white/55 text-slate-700 hover:bg-white disabled:cursor-not-allowed disabled:opacity-45 dark:border-cyan-300/35 dark:bg-slate-900/45 dark:text-slate-200"
                aria-label="Πιο πρόσφατα"
                title="Πιο πρόσφατα"
              >
                <ChevronLeft size={14} />
              </button>
              <button
                type="button"
                onClick={() => setHistoryStartIndex((prev) => Math.min(maxHistoryStartIndex, prev + HISTORY_WINDOW_SIZE))}
                disabled={historyStartIndex + HISTORY_WINDOW_SIZE >= sortedHistory.length}
                className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-300/70 bg-white/55 text-slate-700 hover:bg-white disabled:cursor-not-allowed disabled:opacity-45 dark:border-cyan-300/35 dark:bg-slate-900/45 dark:text-slate-200"
                aria-label="Πιο παλιά"
                title="Πιο παλιά"
              >
                <ChevronRight size={14} />
              </button>
            </div>

            <div className="max-h-[300px] space-y-2 overflow-y-auto pr-1">
              {visibleHistory.length ? (
                visibleHistory.map((entry) => {
                  const isActive = entry.id === selectedEntry?.id;
                  const shiftCount = entry.shiftCount ?? entry.metadata?.totalShifts ?? (entry.shifts || []).length;
                  return (
                    <button
                      key={entry.id}
                      type="button"
                      onClick={() => setSelectedEntryId(entry.id)}
                      className={`w-full rounded-xl border px-3 py-2 text-left transition ${
                        isActive
                          ? 'border-brand-300 bg-brand-50/80 dark:border-cyan-300/60 dark:bg-cyan-500/20'
                          : 'border-slate-300/70 bg-white/45 hover:bg-white/70 dark:border-cyan-300/35 dark:bg-slate-900/45 dark:hover:bg-slate-900/65'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <p className="font-semibold text-slate-900 dark:text-white">
                          {formatDateGreek(entry.weekStart)} - {formatDateGreek(entry.weekEnd)}
                        </p>
                        <span className="rounded-full border border-slate-300/70 px-2 py-0.5 text-[10px] text-slate-700 dark:border-cyan-300/35 dark:text-slate-200">
                          {sourceLabel(entry.source || entry.metadata?.saveAction)}
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] text-slate-700 dark:text-slate-300">
                        {formatTimestamp(entry.savedAt || entry.createdAt)} • Βάρδιες: {shiftCount}
                      </p>
                    </button>
                  );
                })
              ) : (
                <StateNotice
                  state="empty"
                  compact
                  title="Δεν υπάρχουν εβδομάδες"
                  message="Δεν έχει αποθηκευτεί ακόμη εβδομαδιαίο ιστορικό."
                />
              )}
            </div>
          </div>

          <div className="rounded-xl border border-slate-300/70 bg-white/45 p-3 dark:border-cyan-300/30 dark:bg-slate-900/45">
            {selectedEntry ? (
              <div className="space-y-2">
                <div className="border-b border-slate-300/70 pb-2 dark:border-cyan-300/30">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">
                    Snapshot: {formatDateGreek(selectedEntry.weekStart)} - {formatDateGreek(selectedEntry.weekEnd)}
                  </p>
                  <p className="text-[11px] text-slate-700 dark:text-slate-300">
                    {formatTimestamp(selectedEntry.savedAt || selectedEntry.createdAt)} •{' '}
                    {sourceLabel(selectedEntry.source || selectedEntry.metadata?.saveAction)}
                  </p>
                </div>

                <div className="max-h-[245px] space-y-2 overflow-y-auto pr-1">
                  {Object.entries(groupedShifts).map(([date, dayShifts]) => (
                    <article key={date} className="rounded-lg border border-slate-300/60 bg-white/60 p-2 dark:border-cyan-300/30 dark:bg-slate-900/40">
                      <p className="mb-1 text-xs font-semibold text-slate-900 dark:text-white">{formatDateGreek(date)}</p>
                      <div className="space-y-1 text-[11px] text-slate-700 dark:text-slate-300">
                        {dayShifts.map((shift, index) => {
                          const employeeName =
                            shift.employeeName ||
                            employeeById.get(shift.employeeId)?.fullName ||
                            'Άγνωστος';
                          const type = shift.type || SHIFT_TYPES.WORK;
                          return (
                            <p key={`${date}_${shift.employeeId}_${shift.startTime}_${index}`}>
                              {employeeName} • {getShiftTypeLabel(type)} • {shift.startTime}-{shift.endTime}
                            </p>
                          );
                        })}
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            ) : (
              <StateNotice
                state="info"
                compact
                title="Επίλεξε snapshot"
                message="Επίλεξε μία εγγραφή από τη λίστα για να δεις λεπτομέρειες βαρδιών."
              />
            )}
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-300/70 bg-white/45 p-3 dark:border-cyan-300/30 dark:bg-slate-900/45">
            <div className="flex items-center gap-2">
              <CalendarDays size={16} className="text-brand-700 dark:text-cyan-300" />
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">PDF μήνα {selectedYearMonth}</p>
                <p className="text-[11px] text-slate-700 dark:text-slate-300">Ιδιωτικό αρχείο, διαθέσιμο μόνο σε διαχειριστή.</p>
              </div>
            </div>
            {canCreateMonthlyArchive&&<button
              type="button"
              onClick={onCreateMonthlyArchive}
              disabled={!isMonthlyArchiveEnabled || isCreatingArchive}
              className="inline-flex items-center gap-2 rounded-lg border border-brand-300/70 bg-brand-500 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-55 dark:border-cyan-300/40"
            >
              {isCreatingArchive ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              Αποθήκευση PDF μήνα
            </button>}
          </div>

          {!isMonthlyArchiveEnabled ? (
            <StateNotice
              state="info"
              compact
              title="Το μηνιαίο PDF archive είναι απενεργοποιημένο"
              message="Ενεργοποιείται μόνο μετά από Firebase Storage setup και deploy κανόνων."
            />
          ) : isMonthlyArchiveLoading ? (
            <StateNotice state="loading" compact title="Φόρτωση ιστορικού" message="Ανάκτηση διαθέσιμων μηνιαίων PDF." />
          ) : monthlyArchives.length ? (
            <div className="min-h-[300px] flex-1 space-y-2 overflow-y-auto pr-1">
              {monthlyArchives.map((archive) => (
                <article
                  key={archive.id || archive.yearMonth}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-300/70 bg-white/45 p-3 dark:border-cyan-300/30 dark:bg-slate-900/45"
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">{archive.yearMonth}</p>
                    <p className="text-[11px] text-slate-700 dark:text-slate-300">
                      {archive.fileName} • Βάρδιες: {archive.shiftCount || 0} • {formatTimestamp(archive.updatedAt || archive.createdAt)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onDownloadMonthlyArchive?.(archive)}
                    disabled={isDownloadingArchive}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-300/70 bg-white/60 px-3 py-2 text-xs font-semibold text-slate-800 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-55 dark:border-cyan-300/35 dark:bg-slate-900/55 dark:text-slate-100 dark:hover:bg-slate-900/75"
                  >
                    {isDownloadingArchive ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />}
                    Λήψη PDF
                  </button>
                </article>
              ))}
            </div>
          ) : (
            <StateNotice
              state="empty"
              compact
              title="Δεν υπάρχουν μηνιαία PDF"
              message="Μετά από επιτυχημένο μηνιαίο generate μπορεί να αποθηκευτεί ιδιωτικό snapshot."
            />
          )}
        </div>
      )}
    </section>
  );
}
