# Nine-Function containment matrix (source inspection, not live verification)

The dedicated demo entry exports exactly these nine names. Flags are effective only after a separately approved demo-project configuration/revision change and fresh verification; existing invocations may still finish. Firestore/Storage client Rules do not fence Admin SDK calls. Every cloud mutation below **REQUIRES SEPARATE HUMAN APPROVAL**.

| Function | Source-side control observed | Containment state / future action |
|---|---|---|
| `createAuthTicket` | Demo-only outer callable, `PUBLIC_DEMO_AUTH_BROKER_ENABLED === 'true'` plus strict demo runtime/global enable fence | `LOCAL_TESTED`, not deployed/proven. Missing/malformed/false rejects before forwarding or ticket mutation; exact demo CORS and normal broker auth/member checks preserved. |
| `exchangeAuthTicket` | Same dedicated guard before original business callback | `LOCAL_TESTED`, not deployed/proven. Disabled exchange preserves pending ticket and emits no token. Future config/revision change and actual hosted verification are required. |
| `cleanupAuthTickets` | Original 15-minute expiry/used-ticket cleanup; intentionally no issuance fence | `LOCAL_TESTED` safe cleanup while broker disabled. Keep expiry cleanup distinct; pause only exact demo schedule if separately approved and justified. |
| `enterPublicDemo` | `PUBLIC_DEMO_ENABLED` and strict runtime fence before forwarding into identity/rate work | `LOCAL_TESTED` global entry containment, not deployed/proven. Broker disabled alone does not fence this independent authority source. |
| `resetPublicDemo` | `PUBLIC_DEMO_ENABLED` and exact project asserted through demo service resolution | `LOCAL_IMPLEMENTATION_AVAILABLE`: disabling requires future cloud approval; preserve reset control and generation. Hosted fence proof missing. |
| `resetPublicDemosDaily` | `PUBLIC_DEMO_ENABLED` at scheduled entry; daily 04:00 Europe/Athens | `LOCAL_IMPLEMENTATION_AVAILABLE`: flag affects future work only; exact schedule/in-flight verification still required. |
| `publishPublicDemoPdf` | `PUBLIC_DEMO_PDF_SERVER_ENABLED` plus demo runtime guard | `LOCAL_IMPLEMENTATION_AVAILABLE`: verified future revision/config required; preserve exact object/generation/intent state. |
| `downloadPublicDemoPdf` | Same PDF flag/runtime guard | `LOCAL_IMPLEMENTATION_AVAILABLE`: previous direct URLs and current artifact authorization require independent assessment. |
| `mutatePublicDemo` | `PUBLIC_DEMO_MUTATION_SERVER_ENABLED` plus demo runtime guard | `LOCAL_IMPLEMENTATION_AVAILABLE`: future verified revision/config and in-flight checks required. |

The six operational row controls below broker entry retain their existing source/local tests and are `LOCAL_IMPLEMENTATION_AVAILABLE` pending current hosted proof; scheduled reset is not certified by a document alone. No Function is DEPLOYED_PROVEN in this package.

`PUBLIC_DEMO_ENABLED=false` is not a universal Admin/Rules cancellation switch. New visitor authority requires both broker and global-entry containment; use the dedicated broker flag and global flag in a separately approved, verified revision/config operation. Cleanup remains callable and cannot mint authority. Existing sessions, old revisions and in-flight requests need separate generation/Rules/operational proof. The historical six-Function deployment contains none of this new fence proof. Do not invent IAM/API/privilege workarounds; remain NOT_READY until deployed containment is independently verified.
