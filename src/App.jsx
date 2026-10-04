import { useEffect, useState } from "react";
import PublicDemoApp from './demo/PublicDemoApp';
import {publicDemoEnabled} from './demo/config';
import AuthTicketCallback from "./components/auth/AuthTicketCallback";
import CentralLandingPage from "./components/auth/CentralLandingPage";
import ForgotPasswordPage from "./components/auth/ForgotPasswordPage";
import LoginPage from "./components/auth/LoginPage";
import RegisterPage from "./components/auth/RegisterPage";
import ResetPasswordPage from "./components/auth/ResetPasswordPage";
import RouteNoticePage from "./components/auth/RouteNoticePage";
import SelectTenantPage from "./components/auth/SelectTenantPage";
import TenantGate from "./components/auth/TenantGate";
import CentralPortal from "./components/portal/CentralPortal";
import InvalidHostNotice from "./components/portal/InvalidHostNotice";
import TenantApp from "./components/tenant/TenantApp";
import MainDashboard from "./components/scheduler/MainDashboard";
import { requestDynamicImportRecovery } from "./utils/dynamicImportRecovery";
import { getCurrentTenantHostContext } from "./utils/tenantHostContext";

export default function App() {
  const [routePath, setRoutePath] = useState(() =>
    typeof window === "undefined" ? "/" : window.location.pathname,
  );
  const tenantHostContext = getCurrentTenantHostContext();

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const handleChunkError = (event) => {
      const error = event?.reason || event?.error || event;
      if (requestDynamicImportRecovery(error) && typeof event.preventDefault === "function") {
        event.preventDefault();
      }
    };

    window.addEventListener("error", handleChunkError);
    window.addEventListener("unhandledrejection", handleChunkError);

    return () => {
      window.removeEventListener("error", handleChunkError);
      window.removeEventListener("unhandledrejection", handleChunkError);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const handleNavigation = () => setRoutePath(window.location.pathname);
    window.addEventListener("popstate", handleNavigation);
    return () => window.removeEventListener("popstate", handleNavigation);
  }, []);

  if(publicDemoEnabled)return <PublicDemoApp/>;

  // 1. Fail-closed on reserved or unknown hostnames (e.g. admin.shiftoryx.gr, foo.bar.shiftoryx.gr)
  if (tenantHostContext.mode === "reserved" || tenantHostContext.mode === "unknown") {
    return <InvalidHostNotice hostContext={tenantHostContext} />;
  }

  // 2. Central SaaS Platform (shiftoryx.gr or gas.homelabshare.gr)
  if (tenantHostContext.mode === "central") {
    let page;
    if (routePath === "/") {
      page = <CentralLandingPage />;
    } else if (routePath === "/login") {
      page = <LoginPage />;
    } else if (routePath === "/register") {
      page = <RegisterPage />;
    } else if (routePath === "/forgot-password") {
      page = <ForgotPasswordPage />;
    } else if (routePath === "/reset-password") {
      page = <ResetPasswordPage />;
    } else if (routePath === "/select-tenant" || routePath === "/stores") {
      page = <SelectTenantPage />;
    } else if (routePath === "/request-token") {
      page = (
        <RouteNoticePage
          title="Αίτημα ενεργοποίησης"
          subtitle="Η ροή token/subscription θα ενεργοποιηθεί σε επόμενη φάση."
          message="Για ενεργοποίηση ή ανανέωση πρόσβασης, επικοινώνησε προσωρινά με τον διαχειριστή."
        />
      );
    } else if (routePath === "/admin" || routePath === "/admin-console") {
      page = (
        <RouteNoticePage
          title="Superadmin console"
          subtitle="Η κονσόλα superadmin δεν είναι ενεργή στο pilot deployment."
          message="Η πρόσβαση θα προστατευτεί με Firebase custom claim role=SUPERADMIN πριν εμφανιστούν δεδομένα."
        />
      );
    } else {
      page = (
        <RouteNoticePage
          title="ShiftOryx Central Portal"
          subtitle="Η πρόσβαση σε χώρο εργασίας απαιτεί επιλογή καταστήματος."
          message="Το κεντρικό domain shiftoryx.gr είναι η κεντρική πύλη διαχείρισης. Για πρόσβαση στο πρόγραμμα του καταστήματός σας, συνδεθείτε για να επιλέξετε κατάστημα ή επισκεφθείτε απευθείας τη διεύθυνση του καταστήματός σας (π.χ. bp-kallis.shiftoryx.gr)."
          actionHref="/stores"
          actionLabel="Τα Καταστήματά μου"
        />
      );
    }

    return (
      <CentralPortal hostContext={tenantHostContext} routePath={routePath}>
        {page}
      </CentralPortal>
    );
  }

  // 3. Tenant Application (bp-kallis.shiftoryx.gr, bp-kallis.homelabshare.gr, or local dev)
  let page = <MainDashboard />;
  if (routePath === "/login") {
    page = <LoginPage />;
  } else if (routePath === "/register") {
    page = <RegisterPage />;
  } else if (routePath === "/forgot-password") {
    page = <ForgotPasswordPage />;
  } else if (routePath === "/reset-password") {
    page = <ResetPasswordPage />;
  } else if (routePath === "/select-tenant" || routePath === "/stores") {
    page = <SelectTenantPage />;
  } else if (routePath === "/request-token") {
    page = (
      <RouteNoticePage
        title="Αίτημα ενεργοποίησης"
        subtitle="Η ροή token/subscription θα ενεργοποιηθεί σε επόμενη φάση."
        message="Για ενεργοποίηση ή ανανέωση πρόσβασης, επικοινώνησε προσωρινά με τον διαχειριστή."
      />
    );
  } else if (routePath === "/admin" || routePath === "/admin-console") {
    page = (
      <RouteNoticePage
        title="Superadmin console"
        subtitle="Η κονσόλα superadmin δεν είναι ενεργή στο pilot deployment."
        message="Η πρόσβαση θα προστατευτεί με Firebase custom claim role=SUPERADMIN πριν εμφανιστούν δεδομένα."
      />
    );
  } else if (routePath === "/" || routePath === "/app") {
    page = <MainDashboard />;
  }

  return (
    <TenantApp hostContext={tenantHostContext} routePath={routePath}>
      <AuthTicketCallback />
      <TenantGate hostContext={tenantHostContext} routePath={routePath}>
        {page}
      </TenantGate>
    </TenantApp>
  );
}
