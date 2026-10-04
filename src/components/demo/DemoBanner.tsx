import { ArrowLeft, FlaskConical, RotateCcw } from 'lucide-react';
import './demo.css';

type DemoBannerProps = {
  onReset: () => void;
  busy?: boolean;
  onBack: () => void;
  error?: string;
};

export default function DemoBanner({ onReset, busy = false, onBack, error }: DemoBannerProps) {
  return (
    <aside className="shiftoryx-demo-banner" lang="el" aria-label="Πληροφορίες δοκιμαστικού περιβάλλοντος" aria-busy={busy}>
      <div className="shiftoryx-demo-banner-inner">
        <FlaskConical className="shiftoryx-demo-banner-icon" size={21} aria-hidden="true" />
        <div className="shiftoryx-demo-banner-copy">
          <p className="shiftoryx-demo-banner-title">DEMO ΠΕΡΙΒΑΛΛΟΝ — Χρησιμοποιούνται αποκλειστικά δοκιμαστικά δεδομένα.</p>
          <p>Αυτό είναι κοινόχρηστο demo και οι αλλαγές επαναφέρονται περιοδικά.</p>
        </div>
        <div className="shiftoryx-demo-banner-actions">
          <button type="button" onClick={onBack} disabled={busy}><ArrowLeft size={15} aria-hidden="true" />Επιστροφή στα Demo</button>
          <button type="button" onClick={onReset} disabled={busy}><RotateCcw size={15} aria-hidden="true" />Επαναφορά Demo</button>
        </div>
      </div>
      {busy && <p className="shiftoryx-demo-banner-feedback" role="status">Επαναφορά δοκιμαστικών δεδομένων…</p>}
      {error && <p className="shiftoryx-demo-banner-feedback shiftoryx-demo-error" role="alert">{error}</p>}
    </aside>
  );
}
