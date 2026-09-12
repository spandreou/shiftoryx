import { useEffect, useMemo, useRef, useState } from 'react';
import { authRepository } from '../../repositories';
import { hasAuthTicketInUrl } from '../../firebase/authBrokerService';
import {
  buildCentralLoginUrl,
  createCurrentReturnToUrl,
  TENANT_ACCESS_MESSAGES,
  verifyTenantAccessForHost,
} from '../../services/tenantAccessService';
import { getCurrentTenantHostContext } from '../../utils/tenantHostContext';

function getEnvFlag(name) {
  const value = import.meta.env[name];
  return String(value || '').trim().toLowerCase() === 'true';
}

export const isTenantGateEnabled = getEnvFlag('VITE_ENABLE_TENANT_GATE');
export const isAuthBrokerEnabled = getEnvFlag('VITE_ENABLE_AUTH_BROKER');

const PUBLIC_TENANT_ROUTES = new Set([
  '/',
  '/app',
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/request-token',
  '/select-tenant',
  '/stores',
]);

function isPublicTenantRoute(routePath = '') {
  return PUBLIC_TENANT_ROUTES.has(routePath);
}

function isTenantAuthRoute(routePath = '') {
  return ['/login', '/register', '/forgot-password', '/reset-password', '/select-tenant', '/stores'].includes(routePath);
}

function TenantGateMessage({ title, message }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10 text-slate-100">
      <section className="w-full max-w-lg rounded-2xl border border-cyan-300/40 bg-slate-950/80 p-5 shadow-2xl shadow-cyan-950/35">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-200">Tenant access</p>
        <h1 className="mt-2 text-2xl font-black">{title}</h1>
        <p className="mt-3 text-sm leading-6 text-slate-200">{message}</p>
        <a
          href={buildCentralLoginUrl(createCurrentReturnToUrl())}
          className="mt-4 inline-flex rounded-lg bg-brand-500 px-3 py-2 text-sm font-bold text-white hover:bg-brand-600"
        >
          Σύνδεση από το κεντρικό portal
        </a>
      </section>
    </main>
  );
}

export default function TenantGate({ children, hostContext: providedHostContext, routePath = '' }) {
  const hostContext = useMemo(
    () => providedHostContext || getCurrentTenantHostContext(),
    [providedHostContext],
  );
  // The callback clears the fragment before its asynchronous exchange finishes.
  // Keep the initial handoff state until its full-page navigation completes.
  const initialTicket = useRef(isAuthBrokerEnabled && hasAuthTicketInUrl()).current;
  const shouldBypassGate =
    (hostContext.mode !== 'tenant' && isPublicTenantRoute(routePath)) ||
    initialTicket;
  const [state, setState] = useState({
    status: isTenantGateEnabled && hostContext.mode === 'tenant' && !shouldBypassGate ? 'checking' : 'ready',
    message: '',
  });

  useEffect(() => {
    if (!isTenantGateEnabled || hostContext.mode !== 'tenant' || shouldBypassGate) {
      setState({ status: 'ready', message: '' });
      return undefined;
    }

    let cancelled = false;
    const unsubscribe = authRepository.subscribeAuth(
      async (user) => {
        if (!user) {
          if (!cancelled && typeof window !== 'undefined') {
            window.location.assign(buildCentralLoginUrl(createCurrentReturnToUrl()));
          }
          return;
        }

        try {
          const result = await verifyTenantAccessForHost({
            uid: user.uid,
            hostname: hostContext.hostname,
          });

          if (!cancelled) {
            if (result.allowed && isTenantAuthRoute(routePath) && typeof window !== 'undefined') {
              window.location.assign('/app');
              return;
            }

            setState({
              status: result.allowed ? 'ready' : 'denied',
              message: result.message || '',
            });
          }
        } catch {
          if (!cancelled) {
            setState({
              status: 'denied',
              message: TENANT_ACCESS_MESSAGES.denied,
            });
          }
        }
      },
      () => {
        if (!cancelled) {
          setState({
            status: 'denied',
            message: TENANT_ACCESS_MESSAGES.denied,
          });
        }
      },
    );

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [hostContext.hostname, hostContext.mode, routePath, shouldBypassGate]);

  if (state.status === 'checking') {
    return <TenantGateMessage title="Έλεγχος πρόσβασης" message="Ελέγχουμε την πρόσβαση στο συγκεκριμένο κατάστημα." />;
  }

  if (state.status === 'denied') {
    return <TenantGateMessage title="Δεν επιτρέπεται η πρόσβαση" message={state.message || TENANT_ACCESS_MESSAGES.denied} />;
  }

  return children;
}
