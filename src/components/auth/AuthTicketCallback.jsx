import { useEffect, useRef, useState } from 'react';
import { authRepository } from '../../repositories';
import {
  exchangeTenantAuthTicket,
  readAndClearAuthTicketFromUrl,
  SAFE_BROKER_ERROR,
} from '../../firebase/authBrokerService';
import { buildCentralLoginUrl, createCurrentReturnToUrl } from '../../services/tenantAccessService';

function classifyCustomTokenSignInError(err) {
  const code = String(err?.code || '').toLowerCase();
  const message = String(err?.message || '').toLowerCase();
  if (code.includes('invalid-custom-token') || message.includes('invalid-custom-token')) {
    return 'CUSTOM_TOKEN_SIGNIN_INVALID_CUSTOM_TOKEN';
  }
  if (code.includes('network') || message.includes('network') || message.includes('failed to fetch')) {
    return 'CUSTOM_TOKEN_SIGNIN_NETWORK';
  }
  return 'CUSTOM_TOKEN_SIGNIN_INTERNAL';
}

export default function AuthTicketCallback() {
  const [status, setStatus] = useState('idle');
  const [diagnosticCode, setDiagnosticCode] = useState('');
  const handoff = useRef(null);

  useEffect(() => {
    let cancelled = false;
    if (!handoff.current) {
      const ticket = readAndClearAuthTicketFromUrl();
      if (!ticket) return undefined;
      // React development remounts must observe the same single-use exchange.
      handoff.current = exchangeTenantAuthTicket(ticket).then(({ customToken }) => {
        return authRepository.signInWithBrokerCustomToken({ customToken }).catch((signInErr) => {
          const diag = classifyCustomTokenSignInError(signInErr);
          const customErr = new Error(diag);
          customErr.category = diag;
          throw customErr;
        });
      });
    }
    setStatus('exchanging');
    handoff.current
      .then(() => {
        if (!cancelled && typeof window !== 'undefined') {
          window.location.assign('/app');
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setStatus('error');
          setDiagnosticCode(err?.category || 'BROKER_EXCHANGE_INTERNAL');
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (status === 'idle') return null;

  return (
    <div
      className="fixed inset-x-4 top-4 z-[80] mx-auto max-w-xl rounded-2xl border border-cyan-300/45 bg-slate-950/95 p-4 text-sm font-semibold text-slate-100 shadow-2xl shadow-cyan-950/40"
      data-diagnostic={diagnosticCode}
    >
      {status === 'exchanging' ? (
        <p>Ολοκλήρωση ασφαλούς σύνδεσης...</p>
      ) : (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p>
            {SAFE_BROKER_ERROR}
            {diagnosticCode ? ` [${diagnosticCode}]` : ''}
          </p>
          <a
            href={buildCentralLoginUrl(createCurrentReturnToUrl())}
            className="rounded-xl bg-brand-500 px-3 py-2 text-center text-xs font-black text-white hover:bg-brand-600"
          >
            Επιστροφή στη σύνδεση
          </a>
        </div>
      )}
    </div>
  );
}
