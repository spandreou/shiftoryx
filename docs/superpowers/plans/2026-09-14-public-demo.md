# Public ShiftOryx demo execution plan

Base b23d6bd2d575d6e1680c848c91325c0ad392d8bd, branch codex/public-shiftoryx-demo. See docs/PUBLIC_DEMO_PREFLIGHT.md for verified infrastructure and boundaries. User authorizes an isolated live demo and requires actual hosted HTTPS acceptance before the final marker.

- [x] Git/infrastructure preflight; dedicated worktree; preserve old QA worktree and dirty docs.
- [ ] Factor the validated fixtures into one shared canonical data source. Preserve local QA outputs; map only the four exact QA IDs to public demo IDs and rebase dates for the current demo week.
- [ ] Implement pure project/origin/tenant/generation policy and strict tests. Runtime must reject production project IDs and non-allowlisted tenants.
- [ ] Implement server-only demo entry, reset and periodic reset. Shared generation-specific OWNER identities; active membership; custom-token auth and existing broker; reset locks/generation boundary reject stale clients. Reset deletes only explicit selected-demo collections/Storage prefixes and restores canonical data. Rate limits and fail-closed interrupted resets.
- [ ] Generate separate demo Rules from existing validators with stricter demo project/identity/generation guards. Normal Rules and authorization stay unchanged. Bound public writes/records/PDF sizes and disable unnecessary admin/provisioning surfaces.
- [ ] Integrate DemoLanding and DemoBanner presentation (delegated bounded files only), safe entry/reset, analytics exclusion and demo-only routing. Hide private-contact/billing/infrastructure controls. Keep V3 engine semantics.
- [ ] Run local emulator/real-browser tests covering all user workflows, all 12 ordered cross-tenant pairs, reset canonical restoration, concurrent reset/write isolation and normal-tenant rejection.
- [ ] Configure new isolated Firebase project and Vercel project using only demo configuration. Verify target before every remote mutation. Attach only exact five demo hostnames after explaining any routing/DNS impact. Never modify apex/wildcard production routing or real tenant data.
- [ ] Run all requested existing regressions, audit/build, guardian and frontend gates. Deploy isolated demo only after these pass.
- [ ] Run actual hosted HTTPS acceptance on all five URLs, capture screenshots, verify no real data/production effects, prepare rollback and detailed final report; create Draft PR without merge. No completion marker for local-only work.

Presentation agent owns only src/components/demo/{DemoLanding.tsx,DemoBanner.tsx,demo.css}; parent owns all other files. No dependencies or lockfile changes planned. Existing esbuild compiles new critical TypeScript Functions modules; generated runtime artifacts must be checked against source.

Reset contract: shared demo tenants are disposable. Publications are immutable between resets; explicit reset clears demo history/PDFs and creates a new generation. A server-owned resetting state blocks writes during cleanup. Each generation has a new shared OWNER UID, so old offline queues do not acquire a fresh identity. Old membership is revoked. Failure keeps the tenant locked until a safe retry/operator recovery. Four canonical tenants only; no prefix-based grants.
