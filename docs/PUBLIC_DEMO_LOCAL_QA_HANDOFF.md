# Local QA handoff — 24 September 2026

> Historical local-only checkpoint. The later isolated deployment and current hosted PDF blocker are recorded in [PUBLIC_DEMO_HOSTED_STORAGE_GATE.md](PUBLIC_DEMO_HOSTED_STORAGE_GATE.md). Statements below that deployment is pending or the task is still Luna-only no longer describe current state. OWNER duplication and final local race rerun were subsequently resolved; hosted acceptance remains incomplete.

Scope of this continuation: existing local/emulator checks, QA harness, documentation only. Stop before authentication/security decisions, cloud configuration, deployment or hosted acceptance, as requested by the user.

Branch: `codex/public-shiftoryx-demo`; HEAD remains `b23d6bd2d575d6e1680c848c91325c0ad392d8bd`. Public-demo changes remain uncommitted.

## Completed in this continuation

- Added `qa/public-demo/README.md` with the required fresh-runtime prerequisites. Stateful suites cannot be chained arbitrarily: reset tests deliberately leave data/sentinels or change generations/cooldowns.
- Strengthened the OWNER absence test: compare actual Firestore absence IDs with the store's displayed IDs, require exactly one persisted record and exactly one visible card. This prevents a selector workaround from concealing a duplicate state entry.
- Reran pure policy: **75 PASS**.
- Reran package boundary test: **DEMO_PACKAGE_WRONG_PROJECT_REJECTED**.
- Syntax checks for OWNER, identity recovery, lease recovery and Storage race harnesses: **PASS**.
- `git diff --check`: **PASS**; only existing CRLF conversion notices.
- Confirmed no manifest, lockfile or GitHub Actions changes.

## Current blocker / exact stopping point

**Superseded checkpoint:** the worker failure below was subsequently traced to the installed CLI's30-second cold socket-readiness deadline. The local harness now uses its supported120-second discovery setting and probes each callable worker's expected rejection before publishing readiness. This does not change hosted handler timeouts or authorization. Absence duplication was corrected by preserving an already-delivered ID in the store. OWNER receipt `shiftoryx-demo-browser-b773po` has36 passing checks across4 tenants. Independent incremental review found no new blocker. Current required suites/build/audit and255 isolation checks passed again; a final fresh-runtime race rerun is in progress. Hosted deployment is still pending.

Started a fresh local runtime at `shiftoryx-public-demo-C3Ner9`. OWNER browser run `shiftoryx-demo-browser-oyeLdG` failed before any OWNER acceptance assertion completed. The browser showed `BROKER_EXCHANGE_INTERNAL`; the runtime reported:

```
Failed to handle request for function us-central1-exchangeAuthTicket
Failed to start functions ...: Failed to load function.
```

This is evidence of an emulator Function worker-load failure, **not proof of a defect in the authentication algorithm**. No authentication code, Rules, permissions or timeout was changed to get past it. Result receipt contains zero completed scenarios; do not count this run as passing.

```
ASTRA_REQUIRED
TASK=Investigate emulator exchangeAuthTicket worker-load failure and close remaining OWNER/race verification
WHY=The next work reaches the authentication execution path; current authorization limits this continuation to low-risk work
CURRENT_STATE=Policy/package/syntax/diff checks pass; fresh OWNER browser run cannot enter the tenant; no hosted deployment
NEXT_SAFE_ACTION=Inspect the staged worker/module-loading failure first, preserving existing auth/Rules semantics; then rerun OWNER QA on fresh fixtures
```

## Earlier evidence and remaining verification

Earlier clean isolation run passed255 checks across12 ordered foreign pairs. Root cleanup,54 malformed settings denials, identity recovery, interrupted lease recovery and stale resumable-upload finalization checks have recorded passes. Independent security review and prior race/full-browser results are recorded in `PUBLIC_DEMO_BLOCKER_REVIEW.md`; they are historical receipts, not proof that the currently failed runtime is ready.

The aggregate run under `shiftoryx-final-local-480ecf40c6974b1f955696e58d334218` combined stateful suites and was not an all-green run. Isolation passed on a subsequent fresh runtime. That isolation run reset fuel, so immediately following it with fuel races exercised the reset cooldown rather than the intended interleaving. Repeat races on fresh fixtures; retain the cooldown unchanged.

OWNER absence duplication remains unresolved. The existing store appends the created record after an awaited audit write, while its live subscription can already have delivered that same record. Prior browser results found two matching cards for a newly created unique employee. The strengthened ID comparison must run to establish whether this is one stored ID duplicated locally; no product correction or weakened selector has been applied in this continuation.

After the worker issue is resolved: finish clean OWNER flow including absence create/edit, clean race suite, and any affected full regressions. Then Astra owns final deployment gate, runtime IAM, Rules/Functions deployment, hosted seed, five exact domain assignments and actual HTTPS acceptance. No deployment readiness marker is issued here.

## Security and supply chain

Changes in this continuation are QA and documentation only. No dependencies, lockfiles, Actions, credentials, secrets, authentication implementation, Rules, IAM, DNS, hosted data or deployments were changed. Temporary data was fictional and confined to the fixed local emulator project. No commit, push or merge performed.
