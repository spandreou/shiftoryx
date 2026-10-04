# ShiftOryx Public Demo — B3 handoff

This is a read-only handoff prepared after the Luna safe closeout of Phase 3B.2B-2. It contains no B3 implementation and authorizes no deployment.

Current state:

```text
BRANCH=codex/public-shiftoryx-demo
HEAD=b23d6bd2d575d6e1680c848c91325c0ad392d8bd
PHASE_3B_2B_2_READY=YES
PUBLIC_DEMO_RELEASE_READY=NO
```

Inherited blockers for Sol High:

1. `PDF_RETAINED_INTENT_OPERATIONAL_RECONCILIATION=PENDING_B3` — reconcile the retained-intent counter against actual retained intent documents under the exact reset/cleanup lifecycle, preserving evidence for uncertain worker states.
2. `CONCURRENT_RESET_SAFE_CLASSIFICATION=PENDING_B3` — the current fresh emulator isolation result for two simultaneous resets is one `200` winner and one `500/INTERNAL` loser. This remains a blocker and was not relabeled as a pass.

Available primitives:

- `demoPdfLimits/{tenant}.retainedIntentCount`
- `settleRetainedDemoIntents` and exact tenant/UUID validation
- `demoControl/{tenant}` lease and exact lease checks
- `demoAdmission/{tenant}`, daily/rate documents and bounded receipts
- typed `mutatePublicDemo` admission layer
- public reset fence through `demoState/{tenant}.resetting`
- current reset service and explicit inventory coverage
- emulator/browser suites reproducing the two blockers

B3 must preserve:

- typed mutation authentication, generation and OWNER authorization;
- nine-collection active-write cutover and all direct SDK denials;
- all 12 ordered tenant-isolation pairs;
- PDF publication/download state machine and immutable snapshots;
- GCS conditional immutability invariants;
- normal production repository behavior and `firestore.rules` semantics;
- 449-shift / 453-write draft path and byte limits.

Approved B3 acceptance direction:

- prove the retained-intent document/counter invariant through create, replay, invalidation, expiry, manual reset and cleanup failure paths;
- classify every concurrent reset outcome as a safe winner, a bounded retryable loser, or an explicitly preserved recovery state;
- keep old-generation sessions and public reads fenced until reset finalization;
- use fresh emulator and browser evidence for every stateful interleaving;
- obtain independent security review before any hosted action.

Do not introduce a generic tenant-deletion primitive, weaken Rules, bypass the server admission layer, deploy partial client/Rules changes, or begin hosted IAM/DNS/Functions work in B3 design or implementation without the separately approved gate.

Security/deployment state at handoff:

```text
IAM_CHANGED=NO
RULES_DEPLOYED=NO
FUNCTIONS_DEPLOYED=NO
VERCEL_DEPLOYED=NO
DNS_CHANGED=NO
PRODUCTION_CHANGED=NO
HOSTED_DEMO_DATA_CHANGED=NO
DEPENDENCIES_CHANGED=NO
LOCKFILE_CHANGED=NO
GITHUB_ACTIONS_CHANGED=NO
```

The remaining npm audit result is a separate read-only disposition item: 4 high findings in the existing `firebase` / Firestore / gRPC dependency chain, with no dependency changes made in B2.
