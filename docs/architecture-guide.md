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
| `src/components/workspace/WorkspaceHomePage.tsx` | SKELETON + MIX | Basic tenant home and product-provided entry points only |
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
