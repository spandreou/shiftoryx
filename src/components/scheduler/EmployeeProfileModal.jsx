import { Save, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { formatDateGreek, parseGreekDateInputToIso } from '../../utils/time';

const emptyForm = {
  fullName: '',
  role: '',
  color: '#1D4ED8',
  afm: '',
  phone: '',
  email: '',
  hireDate: '',
};

export default function EmployeeProfileModal({ open, employee, isAdmin, onClose, onSave, showRole=true }) {
  const [form, setForm] = useState(emptyForm);
  const [hireDateInput, setHireDateInput] = useState('');

  useEffect(() => {
    if (!employee) {
      setForm(emptyForm);
      setHireDateInput('');
      return;
    }

    setForm({
      fullName: employee.fullName || '',
      role: employee.role || '',
      color: employee.color || '#1D4ED8',
      afm: employee.afm || '',
      phone: employee.phone || '',
      email: employee.email || '',
      hireDate: employee.hireDate || '',
    });
    setHireDateInput(employee.hireDate ? formatDateGreek(employee.hireDate) : '');
  }, [employee]);

  if (!open || !employee) return null;

  async function handleSubmit(event) {
    event.preventDefault();
    if (!isAdmin) return;

    const saved = await onSave({
      id: employee.id,
      ...form,
    });
    if (saved) {
      onClose();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 p-4 sm:items-center">
      <div className="glass-panel w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-t-2xl p-4 sm:rounded-2xl">
        <div className="mx-auto mb-2 h-1.5 w-12 rounded-full bg-slate-300/70 dark:bg-slate-700/70 sm:hidden" />
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">
            {isAdmin ? 'Επεξεργασία Προφίλ Υπαλλήλου' : 'Προφίλ Υπαλλήλου'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-slate-600 hover:bg-slate-100/70 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800/70 dark:hover:text-white"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="grid gap-3 md:grid-cols-2">
          <label className="text-sm font-medium text-slate-900 md:col-span-2 dark:text-slate-100">
            Ονοματεπώνυμο
            <input
              value={form.fullName}
              onChange={(event) => setForm((prev) => ({ ...prev, fullName: event.target.value }))}
              className="input-glass mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-950 font-semibold outline-none ring-brand-300/50 transition focus:ring-2 placeholder:text-slate-500 dark:border-cyan-300/45 dark:text-white dark:placeholder:text-slate-400"
              disabled={!isAdmin}
              required
            />
          </label>

          {showRole&&<label className="text-sm font-medium text-slate-900 dark:text-slate-100">
            Ρόλος
            <input
              value={form.role}
              onChange={(event) => setForm((prev) => ({ ...prev, role: event.target.value }))}
              className="input-glass mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-950 font-semibold outline-none ring-brand-300/50 transition focus:ring-2 placeholder:text-slate-500 dark:border-cyan-300/45 dark:text-white dark:placeholder:text-slate-400"
              disabled={!isAdmin}
            />
          </label>}

          <label className="text-sm font-medium text-slate-900 dark:text-slate-100">
            Χρώμα
            <input
              type="color"
              value={form.color}
              onChange={(event) => setForm((prev) => ({ ...prev, color: event.target.value }))}
              className="mt-1 h-10 w-full cursor-pointer rounded border border-slate-300 bg-white/70 dark:border-cyan-300/40 dark:bg-slate-900/40"
              disabled={!isAdmin}
            />
          </label>

          <label className="text-sm font-medium text-slate-900 dark:text-slate-100">
            Τηλέφωνο
            <input
              value={form.phone}
              onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))}
              className="input-glass mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-950 font-semibold outline-none ring-brand-300/50 transition focus:ring-2 placeholder:text-slate-500 dark:border-cyan-300/45 dark:text-white dark:placeholder:text-slate-400"
              disabled={!isAdmin}
            />
          </label>

          <label className="text-sm font-medium text-slate-900 dark:text-slate-100">
            Email
            <input
              type="email"
              value={form.email}
              onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
              className="input-glass mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-950 font-semibold outline-none ring-brand-300/50 transition focus:ring-2 placeholder:text-slate-500 dark:border-cyan-300/45 dark:text-white dark:placeholder:text-slate-400"
              disabled={!isAdmin}
            />
          </label>

          <label className="text-sm font-medium text-slate-900 dark:text-slate-100">
            Ημερομηνία Πρόσληψης
            <input
              type="text"
              inputMode="numeric"
              placeholder="dd/mm/yyyy"
              value={hireDateInput}
              onChange={(event) => {
                const nextInput = event.target.value;
                setHireDateInput(nextInput);
                setForm((prev) => ({ ...prev, hireDate: parseGreekDateInputToIso(nextInput) || '' }));
              }}
              className="input-glass mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-950 font-semibold outline-none ring-brand-300/50 transition focus:ring-2 placeholder:text-slate-500 dark:border-cyan-300/45 dark:text-white dark:placeholder:text-slate-400"
              disabled={!isAdmin}
            />
          </label>

          <label className="text-sm font-medium text-slate-900 dark:text-slate-100">
            ΑΦΜ
            {isAdmin ? (
              <input
                value={form.afm}
                onChange={(event) => setForm((prev) => ({ ...prev, afm: event.target.value }))}
                className="input-glass mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-950 font-semibold outline-none ring-brand-300/50 transition focus:ring-2 placeholder:text-slate-500 dark:border-cyan-300/45 dark:text-white dark:placeholder:text-slate-400"
              />
            ) : (
              <div className="mt-1 rounded-lg border border-slate-300/80 bg-white/40 px-3 py-2 text-sm text-slate-700 dark:border-cyan-300/35 dark:bg-slate-900/45 dark:text-slate-300">
                Μόνο για διαχειριστή
              </div>
            )}
          </label>

          {isAdmin ? (
            <button
              type="submit"
              className="md:col-span-2 inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-700 dark:border dark:border-pink-300/40 dark:bg-cyan-500/85 dark:text-slate-950 dark:hover:bg-cyan-400"
            >
              <Save size={16} />
              Αποθήκευση
            </button>
          ) : null}
        </form>
      </div>
    </div>
  );
}
