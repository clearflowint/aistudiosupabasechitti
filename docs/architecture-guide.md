# ClearFlow architecture and code ownership guide

// SKELETON: This document describes product-neutral architecture rules.
// MIX: Product adapters connect the shared shell to a product module.

## Operational flow

1. Authentication establishes the signed-in identity.
2. The active product's authorization resolver validates access and returns the minimal `AuthorizedWorkspace` identity.
3. The universal tenant home displays basic account/workspace information and entry points such as CRM and Workspace. It does not contain fund, cycle, share, or ledger business logic.
4. The selected product owns its complete Workspace UI and its operational flow. For CFCF, this includes the fund selector, fund summary, cycles, share filters and cards, payments, ledger, reports, and destructive actions.
5. Product services query and mutate that product's data. Tenant identity comes from the authorized workspace; every operation must enforce tenant and record ownership through query filters and database policies.
6. Shared UI primitives (buttons, modal frame, form controls, confirmation dialog, loading/error states) can be reused, but the fields, composition, business rules, and presentation remain product-owned.
7. Fund/tab changes clear previous fund-scoped client state before fetching current data. Stale async responses must not overwrite the currently selected tenant or fund.

## Ownership markers — use consistently

- `// SKELETON:` Universal, product-neutral contracts, utilities, layout, or reusable UI primitives. Must not encode CFCF table names, share/fund terminology, or CFCF financial rules.
- `// CFCF PRODUCT:` CFCF-specific UI, types, queries, validation, schema mapping, and CFCF business operations.
- `// MIX:` An intentional boundary where generic infrastructure receives product-provided configuration, navigation, identity, or rendering. Keep these integration points small and explicit.

Markers describe ownership, not merely the technology used. A TypeScript interface is not automatically skeleton: database row interfaces are CFCF PRODUCT; the generic authorized-workspace contract is SKELETON.

## File ownership

| Path | Ownership | Responsibility |
|---|---|---|
| `src/core/products/product.types.ts` | SKELETON | Contract each product implements |
| `src/core/workspace/workspace.types.ts` | SKELETON | Product-neutral authorized tenant identity |
| `src/products/productRegistry.ts` | MIX | Registers products and chooses the active product |
| `src/components/workspace/WorkspaceLayout.tsx` | SKELETON + MIX | Shared header, top navigation, notification entry point, content frame |
| `src/components/workspace/WorkspaceHomePage.tsx` | SKELETON + MIX | Basic tenant home, shared entry points, and optional product-owned home widgets |
| `src/components/ui/` | SKELETON | Reusable presentational primitives; no product business rules |
| `src/features/cfcf/product.tsx` | CFCF PRODUCT + MIX | CFCF product contract, navigation, resolver, and page dispatch |
| `src/features/cfcf/pages/WorkspacePage.tsx` | CFCF PRODUCT | Entire CFCF operational workspace UI |
| `src/features/cfcf/services/` | CFCF PRODUCT + MIX where shared identity is injected | CFCF queries and mutations against the existing schema |
| `src/features/cfcf/types/database.types.ts` | CFCF PRODUCT | Types mapped to CFCF database columns |
| `src/features/cfcf/pages/ContactsPage.tsx` | CFCF PRODUCT | Current CRM screen; reuse universal form/modal primitives |

## CFCF Workspace ownership boundary

The CFCF Workspace is one product-specific operational screen. Its intended vertical flow is:
- Tenant-level header/context comes from the authorized workspace, outside the fund data model.
- Fund selector shows the tenant's funds.
- Selected-fund summary and actions.
- Cycle cards and cycle-specific modals.
- Four share filters: All, Pending, Drawn, Undrawn.
- Share cards and their relevant actions.
- Fund-level actions: add share, edit fund details/cycle count, reports.
- Danger zone with explicit confirmation flows for share/fund deletion.

Do not move fund selectors, cycle cards, share cards, CFCF tab state, or CFCF database queries into universal components. Other products are free to define different workspace layouts.

## Service and data rules

- `tenantId` and `personId` are supplied from the authorized workspace, never manually entered by the user.
- A client-side tenant filter is not a substitute for Supabase Row Level Security (RLS).
- Scope reads and writes by tenant and the relevant parent record; verify affected-row counts for mutations.
- Never calculate financial balances in the UI. Display stored values or explicitly defined server/database results.
- On fund or view changes, clear relevant previous selections/data, show a loading state, fetch the required records, and ignore responses from obsolete requests.
- Use a deliberate refresh/refetch after successful mutations so UI state reflects persisted data.
- Never call a feature complete until TypeScript/build and access-boundary tests have been run.

## Adding another product

1. Add a product module under `src/features/<product>/`.
2. Implement the universal product contract and provide product-specific navigation, authorization, and page rendering.
3. Build its Workspace inside its own product folder; do not inherit the CFCF workspace layout.
4. Reuse universal UI primitives where they fit; do not force a shared visual composition when the products have different workflows.
5. Register it in `src/products/productRegistry.ts` and validate tenant isolation, session restore, refresh, mobile behavior, and mutations.


## Contact Groups and bulk campaign boundary

// CFCF PRODUCT: Contact Groups are stored relationally; each membership is a row, not a JSON array.

- `public.contactgroups` stores the manager-defined group name and the owning product, tenant, and person.
- `public.contact_group_members` joins a group to a Contact with tenant-scoped composite foreign keys. The primary key prevents duplicate membership.
- Contact deletion cascades only to group membership rows; deleting a group never deletes Contacts.
- Group and membership reads are tenant-scoped. RLS restricts mutations to the active tenant owner.
- Campaign composition selects one or more groups, resolves distinct Contact IDs, and builds a payload containing `product_id`, `tenant_id`, `group_ids`, `contact_ids`, `recipients`, `channels`, and `message`.
- Large membership reads are paginated. Email campaigns warn about Contacts without email addresses; recipient records retain phone/email values for the future automation workflow.
- The current Launch Campaign action only prepares and previews the request. It does not send messages. A future MIX integration may dispatch to the configured n8n webhook and must report success only after n8n acknowledges acceptance.

- CFCF manager home automation progress is a product-owned widget: `src/features/cfcf/components/AutomationJobProgressCard.tsx` reads only the safe `n8n_global_job_progress` view through `src/features/cfcf/services/automation-jobs.service.ts`. It is disabled by default and requires `VITE_CFCF_JOB_PROGRESS_ENABLED=true` only after the draft registry view is approved, applied in the target environment, and verified. It does not read raw `job_data`, send messages, mutate job state, or poll automatically.


## Portability-first architecture — approved direction

ClearFlow owns product behavior and business rules. Supabase, n8n, WhatsApp/WAHA, AI providers, and hosting platforms are replaceable tools, not the source of truth for ClearFlow architecture.

### Rules

1. Prefer ordinary HTTP APIs, straightforward queries, and small application/workflow modules over vendor-specific features when both meet the requirement.
2. Keep product rules in the product application or product-owned n8n workflow. Do not move routine workflow decisions into database triggers, stored procedures, or RPCs merely for convenience.
3. Keep storage access behind small product-owned functions/modules. Provider-specific query syntax belongs at the storage boundary; business logic should consume plain records and results.
4. Use standard columns and JSON only where it simplifies the actual data shape. Add constraints for essential data validity, not speculative workflow orchestration.
5. Do not create a generic queue, state machine, lease system, event framework, or retry engine unless a demonstrated workflow requirement needs it.
6. Prevent common duplicate submissions at the entry point (disable PWA submit while pending; add a short UI cooldown) and at n8n ingress (validate event/request identity). Add durable idempotency storage only where a real duplicate risk justifies it, especially across restarts or external side effects.
7. Keep essential authentication, tenant separation, and honest success/failure reporting. Portability is not permission to expose another tenant's data or claim an unsaved write succeeded.
8. Prefer provider adapters and simple data-access interfaces that allow replacing a vendor without rewriting product behavior. Do not build abstraction layers that have no second implementation or current need; document the replacement seam instead.
9. Every new table, RPC, trigger, workflow, index, or background worker must state the concrete problem it solves and why a simpler option is insufficient.
10. Before adopting a new tool, compare its current benefit, operating cost, lock-in, migration effort, and exit path. Keep the choice reversible where practical.

### Current implementation implications

- Treat the draft n8n_global_jobs migration and progress view as proposals under review, not mandatory architecture. Do not apply them until the simplified working flow and required data fields are agreed.
- Keep the CFCF progress card feature flag disabled until its data source is settled and tested.
- Keep draft n8n ingress/worker workflows inactive until the smallest working request-to-result path is validated in a controlled non-production environment.
- Do not change existing PWA notification tables, functions, data, or cron jobs as part of this review.
- No billable Supabase branch, production migration, production deployment, credential change, or live WhatsApp send is authorized by this architecture decision.

### Implementation sequence

1. Inventory vendor-specific dependencies and classify them as essential, replaceable adapter code, or unnecessary complexity.
2. Define the smallest useful job record and status contract needed for the first working CFCF flow.
3. Simplify or remove speculative database machinery and update its contract tests accordingly.
4. Complete a controlled non-production end-to-end flow using synthetic data and mock provider actions.
5. Add protections only for observed or clearly material failure modes, without changing the portability rule.
