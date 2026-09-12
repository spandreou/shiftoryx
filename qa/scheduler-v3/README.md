# Realistic four-store QA

This harness uses the actual application login, auth broker Functions, scheduler, repositories and Firebase Rules. Its data is explicitly fictional QA data. It never connects to production Firebase.

## Local use

Prerequisites: the repository's existing root and Functions dependencies, Java, an already installed Firebase CLI and Playwright Chromium. No installation is performed by the harness. Node 22+ is required for the existing TypeScript runners.

From the implementation checkout:

```powershell
$env:QA_FIREBASE_CLI = 'ABSOLUTE_PATH_TO_EXISTING/firebase-tools/lib/bin/firebase.js'
node qa/scheduler-v3/runtime.mjs
```

The command creates an external temporary directory, starts four emulators and the QA Vite server, creates four OWNER accounts, and prints `QA_RUNTIME_DIRECTORY`. Keep the process open. The Functions source and installed dependencies are reused in a temporary copy; the SDK generates its own manifest to avoid transient HTTP discovery problems on Windows.

In another terminal, substitute the printed directory:

```powershell
node qa/scheduler-v3/acceptance.mjs QA_RUNTIME_DIRECTORY
node qa/scheduler-v3/broker.mjs QA_RUNTIME_DIRECTORY
node qa/scheduler-v3/browser.mjs QA_RUNTIME_DIRECTORY
node qa/scheduler-v3/prepare-hosted.mjs QA_RUNTIME_DIRECTORY
node qa/scheduler-v3/browser.mjs QA_RUNTIME_DIRECTORY --interactive
```

The last command opens a browser for manual login. **Only that browser maps `shiftoryx.gr` and the four `qa-*.shiftoryx.gr` domains to the local server.** Opening those addresses in an ordinary browser does not select this QA environment. No hosts-file or DNS changes are needed. Exact QA origins receive permission to access loopback emulators; unrelated network requests and all WebSockets are blocked in this browser. Auth, broker, repository and Rules responses are real emulator responses, not mocks.

Email/password pairs are in `QA_RUNTIME_DIRECTORY/credentials.json`, outside Git. Passwords are random per seed; `QA_PASSWORD_FUEL`, `QA_PASSWORD_CAFE`, `QA_PASSWORD_SALON`, `QA_PASSWORD_MARKET` can supply values of at least 16 characters. Never paste that file into source, screenshots, reports, CI or Git. These accounts work only while the local emulator session is running. Restarting a fresh session creates new credentials. Existing tenant collisions are rejected without overwriting data.

Runtime endpoints are fixed: Auth 9298, Firestore 8187, Functions 5101, Storage 9398, Vite 5191; all bind to `127.0.0.1`. Project ID is fixed to `demo-shiftoryx-realistic`. Do not change it to a live project. `Ctrl+C` stops the runtime; leave the output directory for review. A Windows interruption may leave an emulator child process: verify its command line and exact demo project/port before stopping only that child.

Outputs:

- `acceptance.md`: every profile, coverage rule, absence, actual WEEK timetable, MONTH totals, weekly target deltas, warnings and Expected/Actual checks.
- `acceptance.json`: complete generated schedules and machine-readable checks.
- `broker-results.json`: actual callable origin/membership/replay denials.
- `browser-results.json`: real login/routing/Preview/publication/isolation outcomes.
- Four PDF artifacts and week/month/history/denial screenshots.
- `hosted-qa-manifest.json`: complete fixture specification without credentials, for the later approved rollout.

Browser reruns create additional immutable versions rather than overwriting history. The result records actual version numbers. Use a fresh emulator session when exact initial versions 1 and 2 are required.

## Later hosted activation — explicit authorization required

This phase does not perform these operations. The `.test` accounts and local credentials are not hosted accounts.

1. Approve a named target Firebase project and a single shared frontend revision that includes the tested auth-handoff correction. Decide whether the target is isolated staging or approved QA tenants in an existing project. The central portal and all four QA origins must use the same approved Auth/Firestore/Storage/Functions environment; hostname alone cannot choose another Firebase project in the current app.
2. Confirm the existing domain rollout permits `shiftoryx.gr` plus `qa-fuel.shiftoryx.gr`, `qa-cafe.shiftoryx.gr`, `qa-salon.shiftoryx.gr`, `qa-market.shiftoryx.gr` on that shared app, with valid TLS. Do not create separate per-tenant deployments. DNS/TLS/global domain changes need their own approved operation if not already configured.
3. Review and deploy the tested shared frontend, broker Functions and Firestore/Storage Rules through the repository's approved release workflow. Confirm Email/Password Auth and authorized domains for the five origins. Confirm broker central/tenant-origin validation and the existing tenant gate. This harness does not modify these global settings.
4. Have the approved operator create four dedicated OWNER Auth accounts, using new passwords from a secure local mechanism. Use real controlled email addresses if email recovery is part of the hosted QA. Record returned UIDs privately; never reuse platform-admin identities.
5. Review `hosted-qa-manifest.json` against the approved target. For each of the four exact `qa-*` slugs, verify no existing tenant or slug reservation collision, then create the QA-marked tenant, reservation and **only** its matching `{uid}_{tenantId}` ACTIVE OWNER membership. Never overwrite an existing tenant.
6. Seed that tenant's employees and absences from the manifest; save its `settings/scheduler` with the supplied canonical config and `schedulerSchemaVersion: 3`. This is an explicit activation of QA tenants only. Preserve settings for every real tenant. The current `seed.mjs` deliberately refuses hosted projects; applying this reviewed manifest is a separate approved operator action, not a hidden `--force` mode.
7. Read back all four memberships, tenant IDs/domains, settings and roster counts (6/8/6/9), using both an authorized OWNER and a foreign OWNER. Confirm private reads/writes, history and PDF access are denied across all 12 ordered tenant pairs.
8. Repeat central login → expected subdomain → refresh → logout/re-login → direct access, then WEEK/MONTH generation, Preview edit, warnings acknowledgment and publications 1/2. Confirm downloaded PDF bytes match the artifact uploaded for the corresponding snapshot.
9. Give reviewers the hosted accounts through a private channel. Schedule cleanup/revocation separately: disable only the four QA accounts/memberships after review; keep published history until the agreed retention decision. No blanket deletion or production rollback is authorized by the harness.

Hosted blockers until those approvals/actions occur: QA accounts/data do not exist in the hosted project, tested code/Rules must be available there, and actual DNS/TLS/auth-domain/global flag readiness has not been checked or changed. The local rehearsal does not certify hosted deployment readiness.

## Scope and security

Fixtures and module substitution live under `qa/`, not production application data. QA-specific Vite definitions do not edit `.env` files or global settings. Analytics is absent from the QA Firebase adapter. No dependencies, lockfiles, Actions permissions, IAM or DNS changes are required. Only two production UI files changed: the auth callback reuses one single-use exchange across development remounts, and the tenant gate retains initial handoff state until navigation. Firestore/Storage Rules and membership checks remain authoritative.

The scheduler's 100-total-record and approximately 449-shift transaction boundary are unchanged. These actual months contain 86–155 shifts, within that boundary. Civil-clock/DST and partial-week target limitations remain visible in the report. This is a realistic acceptance suite, not another large-staff stress matrix.
