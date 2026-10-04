import { ArrowRight, CalendarDays, Check, Coffee, Fuel, Scissors, ShoppingBasket, Users } from 'lucide-react';
import './demo.css';

type DemoLandingProps = {
  onEnter: (tenantId: string) => void;
  busyTenant?: string | null;
  error?: string;
};

const scenarios = [
  {
    id: 'demo-fuel', title: 'Πρατήριο καυσίμων', category: 'ΠΡΑΤΗΡΙΟ', staff: 6, Icon: Fuel, tone: 'fuel',
    description: 'Δύο βάρδιες, μία ομάδα. Δείτε την καθημερινή οργάνωση στην πράξη.',
    features: ['Πρωινή και απογευματινή βάρδια', 'Ρεπό και εναλλαγή βαρδιών', 'Απουσία με ρητά ορισμένη αντικατάσταση', 'Επιθυμητοί στόχοι με ορατές προειδοποιήσεις'],
  },
  {
    id: 'demo-cafe', title: 'Καφέ', category: 'ΚΑΦΕ', staff: 8, Icon: Coffee, tone: 'cafe',
    description: 'Από τον πρώτο καφέ μέχρι το κλείσιμο, με διαφορετικά ωράρια στην ίδια ομάδα.',
    features: ['Τρεις περίοδοι μέσα στην ημέρα', 'Κάλυψη ανά ημέρα της εβδομάδας', 'Εβδομαδιαία ωράρια 20, 32 και 40 ωρών', 'Απουσία και προειδοποιήσεις κάλυψης'],
  },
  {
    id: 'demo-salon', title: 'Κομμωτήριο', category: 'ΚΟΜΜΩΤΗΡΙΟ', staff: 6, Icon: Scissors, tone: 'salon',
    description: 'Προσωπικά ωράρια που συναντούν τις ανάγκες ενός κοινού προγράμματος.',
    features: ['Λειτουργία Τρίτη έως Σάββατο', 'Προσωπικά πρότυπα ωραρίων και ρεπό', 'Ανεξάρτητη εναλλαγή ανά εργαζόμενο', 'Επιθυμητοί στόχοι, χωρίς απόκρυψη αποκλίσεων'],
  },
  {
    id: 'demo-market', title: 'Μίνι μάρκετ', category: 'ΛΙΑΝΙΚΗ', staff: 9, Icon: ShoppingBasket, tone: 'market',
    description: 'Ολόκληρη η εβδομάδα στο πλάνο, με τις ανάγκες του Σαββατοκύριακου στο επίκεντρο.',
    features: ['Λειτουργία επτά ημέρες την εβδομάδα', 'Κάλυψη καθημερινών και Σαββατοκύριακου', 'Ρεπό για ομάδα εννέα εργαζομένων', 'Σενάριο απουσίας και έλεγχος κάλυψης'],
  },
] as const;

export default function DemoLanding({ onEnter, busyTenant = null, error }: DemoLandingProps) {
  return (
    <main className="shiftoryx-demo-landing" lang="el">
      <div className="shiftoryx-demo-container">
        <header className="shiftoryx-demo-header">
          <a className="shiftoryx-demo-brand" href="#demo-intro" aria-label="ShiftOryx — αρχή σελίδας">
            <span className="shiftoryx-demo-brand-icon"><CalendarDays size={23} aria-hidden="true" /></span>
            Shift<span>Oryx</span>
          </a>
          <span className="shiftoryx-demo-top-label">Διαδραστικό demo</span>
        </header>

        <section className="shiftoryx-demo-hero" id="demo-intro" aria-labelledby="demo-heading">
          <p className="shiftoryx-demo-eyebrow">ΟΡΓΑΝΩΣΗ ΒΑΡΔΙΩΝ, ΣΤΗΝ ΠΡΑΞΗ</p>
          <h1 id="demo-heading">Η ομάδα σας.<br />Το πρόγραμμά της.<br /><span>Όλα σε μία εικόνα.</span></h1>
          <p className="shiftoryx-demo-lead">Γνωρίστε το ShiftOryx μέσα από τέσσερις δοκιμαστικές επιχειρήσεις. Επιλέξτε ένα σενάριο και εξερευνήστε βάρδιες, ρεπό και αλλαγές προγράμματος.</p>
          <div className="shiftoryx-demo-notice">
            <span className="shiftoryx-demo-notice-dot" aria-hidden="true" />
            <p>Όλες οι επιχειρήσεις και οι εργαζόμενοι είναι φανταστικοί. Χρησιμοποιούνται αποκλειστικά δοκιμαστικά δεδομένα.</p>
          </div>
        </section>

        <section className="shiftoryx-demo-scenarios" aria-labelledby="demo-scenarios-heading" aria-busy={Boolean(busyTenant)}>
          <div className="shiftoryx-demo-section-heading">
            <div><p className="shiftoryx-demo-eyebrow">4 ΕΠΙΧΕΙΡΗΣΕΙΣ · 4 ΣΕΝΑΡΙΑ</p><h2 id="demo-scenarios-heading">Ποιο πρόγραμμα θέλετε να δοκιμάσετε;</h2></div>
            <span className="shiftoryx-demo-section-note">Ίδια εφαρμογή. Διαφορετικές ανάγκες.</span>
          </div>
          {error && <p className="shiftoryx-demo-error" role="alert">{error}</p>}
          <div className="shiftoryx-demo-grid">
            {scenarios.map(({ id, title, category, staff, Icon, tone, description, features }) => (
              <article key={id} id={id} className={`shiftoryx-demo-card shiftoryx-demo-card--${tone}`} aria-labelledby={`${id}-heading`}>
                <div className="shiftoryx-demo-card-top">
                  <span className="shiftoryx-demo-category-icon"><Icon size={26} strokeWidth={1.8} aria-hidden="true" /></span>
                  <span className="shiftoryx-demo-staff"><Users size={15} aria-hidden="true" />{staff} εργαζόμενοι</span>
                </div>
                <p className="shiftoryx-demo-category">{category}</p>
                <h3 id={`${id}-heading`}>{title}</h3>
                <p className="shiftoryx-demo-description">{description}</p>
                <ul className="shiftoryx-demo-features">
                  {features.map(feature => <li key={feature}><Check size={16} aria-hidden="true" /><span>{feature}</span></li>)}
                </ul>
                <button type="button" className="shiftoryx-demo-enter" disabled={Boolean(busyTenant)} onClick={() => onEnter(id)} aria-label={`Δοκιμή Demo — ${title}`}>
                  <span>{busyTenant === id ? 'Άνοιγμα Demo…' : 'Δοκιμή Demo'}</span><ArrowRight size={18} aria-hidden="true" />
                </button>
              </article>
            ))}
          </div>
          <p className="shiftoryx-demo-shared-note" role="status">{busyTenant ? 'Προετοιμασία του δοκιμαστικού περιβάλλοντος…' : 'Κοινόχρηστα demo: οι αλλαγές επαναφέρονται περιοδικά. Μην εισάγετε προσωπικά ή πραγματικά επιχειρησιακά δεδομένα.'}</p>
        </section>
        <footer className="shiftoryx-demo-footer"><span>ShiftOryx</span><p>Πρόγραμμα βαρδιών με χώρο για τις ανάγκες κάθε ομάδας.</p></footer>
      </div>
    </main>
  );
}
