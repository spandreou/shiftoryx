# Public ShiftOryx demo preflight

> Historical preflight and execution log. For the already deployed isolated environment, actual hosted acceptance results and current deployment stop, see [PUBLIC_DEMO_HOSTED_STORAGE_GATE.md](PUBLIC_DEMO_HOSTED_STORAGE_GATE.md). Older pending-deployment statements below are superseded by that checkpoint.

START_SHA=b23d6bd2d575d6e1680c848c91325c0ad392d8bd

Original branch: codex/scheduler-v3-simplification-correctness. Original worktree was not clean: existing contract/report edits and test artifacts were preserved. Dedicated worktree/branch: codex/public-shiftoryx-demo, initially clean. Dependencies are reused through local junctions; no installation or lockfile edit.

`git status`, `git branch --show-current`, `git log --oneline -n 20`, `git fetch origin --prune`, `git rev-parse HEAD`, `git rev-parse origin/main` were run. The initial fetch failed with a connection reset; a per-command HTTP/1.1 retry succeeded. GitHub API independently confirmed main at 44c5fa422b6baada41a436df5be66c8df206df22.

## Live observations, 13–14 September 2026

- Vercel team: thugspiros1-7341s-projects (Hobby).
- Existing Vercel project: shiftoryx / prj_P2YThL4OQctOIUkyX9h7OagA4B4t; Vite; GitHub spandreou/shiftoryx.
- Its production deployment is READY at main 44c5fa4; aliases include shiftoryx.gr, www.shiftoryx.gr and *.shiftoryx.gr.
- HTTPS HEAD returned 200 through Vercel for the root, all five requested demo names and a fresh probe subdomain. These are production wildcard responses, not evidence of a functioning isolated demo.
- No separate ShiftOryx Demo Firebase project was present in the authenticated project's inventory. Existing application Firebase project is gasstationproject-9dd89. No tenant documents or customer data were read.
- Existing Firebase project has billing enabled on the account named Firebase Payment. A separate open account named My Billing Account also exists. No billing changes performed in preflight.
- Connected Vercel tools can read project/deployment state. No authenticated local Vercel CLI was found. Browser Vercel login was requested without requesting a password/token in chat.

## Isolated target and required operations

Use a new Firebase project (proposed ID shiftoryx-public-demo) and a new Vercel project. Bind only demo.shiftoryx.gr, demo-fuel.shiftoryx.gr, demo-cafe.shiftoryx.gr, demo-salon.shiftoryx.gr and demo-market.shiftoryx.gr. Do not move or remove the existing wildcard, apex, www or BP Kallis aliases.

Specific demo aliases will override wildcard routing for those five hostnames. Validate assignment/conflicts before execution; stop and report if the provider requires moving a production alias/wildcard or changing customer traffic. No DNS change is currently indicated by the observations; confirm after adding exact demo domains. Never create unnecessary per-tenant records.

The new demo project needs Auth, Firestore, Storage and Functions, plus only the demo origins in its auth/broker configuration. Rules and Functions deploy only to the new project. Storage/Functions require a billing-enabled Firebase environment; no pricing or zero-cost guarantee is made. Any runtime service-account signing permission must be narrow and limited to the new demo project.

Vercel demo env names: VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, VITE_FIREBASE_PROJECT_ID, VITE_FIREBASE_STORAGE_BUCKET, VITE_FIREBASE_MESSAGING_SENDER_ID, VITE_FIREBASE_APP_ID, VITE_ENABLE_AUTH_BROKER, VITE_ENABLE_TENANT_GATE, VITE_ENABLE_SCHEDULER_V3, VITE_CENTRAL_PORTAL_DOMAIN, VITE_PUBLIC_APP_BASE_DOMAIN, VITE_PUBLIC_DEMO_ENABLED. Demo analytics must be disabled; production env values must not be copied. Runtime guards bind demo mode to the explicit demo project.

Functions demo env: PUBLIC_DEMO_ENABLED, PUBLIC_DEMO_PROJECT_ID, AUTH_BROKER_BASE_DOMAIN, AUTH_BROKER_CENTRAL_DOMAIN, AUTH_BROKER_CENTRAL_ORIGINS, AUTH_BROKER_TENANT_ORIGINS. Only demo enter/reset/periodic-reset and existing broker endpoints are needed; normal provisioning/admin operations are not deployed to demo.

## Implementation contract

- Reuse one canonical fixture source for QA and hosted demo, with explicit qa→demo ID mapping and date rebasing for the active demo week.
- Exactly four allowed tenants; no prefix-based grants. Public entry creates a custom-token session for the selected shared demo identity, with real ACTIVE OWNER membership, then uses the broker for cross-origin handoff.
- Reset is server-only, membership/origin/project/allowlist checked, rate limited and serialized. Block writes during reset, advance a generation, reject stale identities and restore only the selected demo tenant's fictional records. Publications/PDFs are immutable during a generation; an explicit reset removes disposable demo history.
- Shared identities rotate by reset generation so old offline queues cannot resume as the new identity. No per-visitor tenant infrastructure.
- Separate demo Rules retain the existing tenant-scoped validators and add explicit demo identity/generation checks. Production Rules remain unchanged.
- Full regression suite and local emulator checks precede deployment. Final success additionally requires real HTTPS tests on all five domains and all 12 foreign-tenant pairs. Localhost success is not hosted success.

No remote infrastructure or production state has been modified by this preflight.

## Subsequent implementation operations (not the read-only preflight)

Verified through 19–20 September 2026:

- Created isolated GCP/Firebase project `shiftoryx-public-demo` (number 848554493137), linked only this project to the existing Firebase Payment billing account, and enabled its required APIs.
- Created native Firestore `(default)` in `us-central1` and default Storage bucket `shiftoryx-public-demo.firebasestorage.app`.
- Created the demo-only Firebase web application and initialized Auth. Configured exactly `demo.shiftoryx.gr`, `demo-fuel.shiftoryx.gr`, `demo-cafe.shiftoryx.gr`, `demo-salon.shiftoryx.gr`, `demo-market.shiftoryx.gr`, and `shiftoryx-public-demo.firebaseapp.com` as authorized domains. No password/provider configuration or customer project changed.
- Cloud setup initially failed because client API requests lacked a quota-project header; the helper now uses the fixed demo project in `x-goog-user-project`. The Auth config endpoint was corrected using the official discovery schema to `/v2/projects/{project}/config`.
- Web configuration is stored outside Git in a temporary local directory, never printed. No service-account private key downloaded.
- Official Vercel CLI 59.17.0 was installed only into npm's external execution cache with install scripts disabled; project dependencies/lockfiles unchanged. Authenticated via its normal device login. Existing Vercel projects remain `shiftoryx` and `spandreou`; no demo project/deployment/domain attachment yet at this checkpoint.
- No DNS, production Rules, customer data, real memberships, global auth settings, GitHub Actions, merge, push, or broad IAM change performed.

## Verification checkpoint

- Pure demo policy/fixture suite: 75 checks (earlier implementation pass).
- `node qa/public-demo/isolation.mjs`: 255 PASS, 12 ordered foreign-tenant pairs. Includes private collection reads/writes, profile changes, memberships, Storage/PDF, unauthorized reset, concurrent reset winner, stale generation denial, canonical profile restoration, PDF cleanup, foreign tenant preservation, cooldown. Initial RED exposed omitted auxiliary reset collections; fixed explicit list, clean emulator rerun GREEN.
- `node qa/public-demo/browser.mjs`: 80 PASS across all four tenants, real Chromium UI using local emulators and simulated HTTPS origins. Covers landing/entry/broker/refresh, WEEK/MONTH, quarter-hour edits, replacement/add/remove, warnings, Publish v1/v2, immutable v1/PDF, history/download, all12 foreign hostnames, reset and logout/re-entry. **Not hosted HTTPS evidence.** Screenshots and downloaded fictional PDFs kept outside Git.
- Full requested regression set passed: V2 contract (2118), V3 contract (large-staff component151 tests/126730 assertions), scheduler engine, scheduler, repositories, public-readonly, tenant authorization, auth broker, central portal isolation, export security, security hardening/integrity, build. Audit high threshold passed with 1 low and 4 moderate findings; no automatic dependency upgrades. Existing large-chunk build warnings remain.
- `node scripts/test-demo-package-guard.mjs`: wrong project rejected before a deployable output is created. Demo-only frontend/backend package built successfully with `.env` loading disabled and ambient `VITE_*` excluded.
- Remaining gates: additional owner settings/absence browser tests, responsive/console inspection, independent change review, isolated runtime IAM/Functions/Rules/seed deployment, new Vercel project/exact5 domains, actual hosted acceptance and Draft PR. Do not label public demo ready yet.

## Low-risk continuation results (20 September 2026)

- Owner CRUD QA reached fictional employee creation, profile edit with contact/tax fields absent, deactivate/reactivate, and NORMAL default checks.
- The next owner settings save was rejected by Firestore Rules with the emulator's 1000-expression evaluation limit while evaluating the existing V3 employee/settings write. This is not treated as a test weakening or a frontend workaround. Rules complexity/transaction shape requires an Astra security/data-integrity decision before any code or Rules change.
- No hosted deployment or hosted HTTPS claim was made. No production tenant/data was touched.

## Astra-required items (not changed by the bounded continuation)

- `ASTRA_REQUIRED TASK=reset cleanup and demo Rules review WHY=the demo Rules expose a root monthly export collection while reset cleanup currently targets tenant subcollections and Storage; stale metadata coverage must be decided without weakening authorization CURRENT_STATE=local cross-tenant/reset suite is green for the tested private collections, but this additional surface is not covered NEXT_SAFE_ACTION=security review the exact root collection contract, then add a failing emulator test before any narrowly scoped fix`.
- `ASTRA_REQUIRED TASK=demo generation handoff race WHY=PublicDemoApp can observe an old auth generation while a new auth-ticket exchange is in flight CURRENT_STATE=local re-entry checks pass in the normal path, but the reset/interrupted-handoff interleaving is not proven NEXT_SAFE_ACTION=security review the handoff state machine and add an adversarial browser test before changing code`.
- `ASTRA_REQUIRED TASK=Firestore Rules expression-limit failure WHY=owner settings persistence fails at the Rules evaluator limit CURRENT_STATE=normal employee CRUD/default checks pass; settings/absence continuation stops at the existing evaluator error NEXT_SAFE_ACTION=security/data-integrity review the Rules and batch shape; do not bypass the evaluator in QA or production`.
