# ClearFlow new workspace flow — working blueprint

> Purpose: a clean, understandable workspace flow that reuses the existing dark-navy / sky-blue visual language and modal patterns without carrying over legacy navigation assumptions. This document is a build map, not a claim that every module is implemented.

## Current verified starting point

- `src/main.tsx` mounts the design-only modal preview at `/ui-reference`; all other paths mount the app.
- `src/App.tsx` coordinates authentication, the selected product's workspace authorization, page selection, and the shared shell.
- `src/products/productRegistry.ts` currently registers only `cfcfProduct`. That is an adapter, not a requirement that future products use CFCF's navigation.
- `src/components/workspace/WorkspaceHomePage.tsx` is a product-neutral home/dashboard shell.
- `src/components/workspace/WorkspaceLayout.tsx` is the shared responsive navigation frame.
- `src/components/ui/Modal.tsx` is presentation-only modal infrastructure.
- `src/reference/ui-and-modal-reference.tsx` is a dummy UI demonstration. Its example buttons do not persist data.
- No Supabase schema change is required for this UI/architecture work.

## Product flow (the intended mental model)

```text
Browser
  -> src/main.tsx
       -> /ui-reference : dummy-only visual and modal examples
       -> every other path : src/App.tsx
            -> authService (Google sign-in/session)
            -> activeProduct.resolveWorkspace(email)
                 -> product-specific access service
                 -> returns minimal AuthorizedWorkspace
            -> WorkspaceLayout (shared shell/navigation)
                 -> Home : WorkspaceHomePage
                 -> feature page : activeProduct.renderPage(...)
                      -> feature UI
                      -> feature-specific service
                      -> Supabase with RLS as the final access boundary
```

Authentication is not workspace authorization. A Google-authenticated person must still be authorized for a tenant. UI visibility and modal code must never be treated as security boundaries.

## Folder ownership and code markers

- `// SKELETON`: generic, reusable application foundation. Keep product table names, tenant rules, and domain logic out.
- `// CFCF PRODUCT`: CFCF-only navigation, data types, access checks, services, and financial domain behavior.
- `// MIX`: explicit composition boundary where shared code is connected to a product adapter. Keep these occurrences few and easy to explain.

Folder guide:

| Location | Responsibility |
| --- | --- |
| `src/core/auth/` | Shared authentication/session integration |
| `src/core/database/` | Shared database connection helper only; not product authorization |
| `src/core/products/` | Product contract |
| `src/core/workspace/` | Product-neutral authorized-workspace shape |
| `src/products/` | Registry and active product selection |
| `src/components/workspace/` | Shared home, layout, loading, and feature-page visual skeletons |
| `src/components/ui/` | Shared presentational primitives such as Modal |
| `src/features/cfcf/` | CFCF-only UI, authorization, types, and Supabase services |
| `src/reference/` | Safe visual prototypes; no database writes |
| `docs/` | Human-readable architecture, build, and verification guidance |

## UI design-reference route

Visit `/ui-reference` after the deployed build is live. The preview includes:
1. Add-contact modal: example compact form layout.
2. Record-entry modal: example wide form layout.
3. Confirmation modal: example guarded-action layout.

These examples are deliberately inert. When implementing a real feature, reuse the visual pattern but replace example fields, validation, submit handlers, and error states with the actual product fields and service operation. Never wire a reference button directly to a financial mutation.

## Recommended feature-building order

1. **Foundation review** — verify session restore, Google sign-in, sign-out, access denied state, mobile shell, and `/ui-reference`.
2. **Contacts** — establish list/search/empty state and Add/Edit Contact modals. Confirm actual Supabase columns and RLS policies before writing.
3. **Funds and cycles** — agree on the minimum stored inputs and statuses first. Do not invent derived figures or recreate the old universal maths engine.
4. **Shares** — connect shares to a selected contact and fund/cycle only where the current schema supports it.
5. **Payments and ledger** — treat this as high risk. Establish the source-of-truth row shapes, exact currency handling, transaction/idempotency approach, and audit rules before enabling writes. UI forms are not sufficient protection.
6. **Reports** — read-only views over verified stored data.
7. **Settings** — workspace profile and preferences; tenant IDs remain system-derived, never typed in by the user.

For each feature: inspect current schema and policies -> write types -> write a narrow service -> implement loading/empty/error/success UI -> add validated modal -> test allowed and denied access -> run typecheck/build. Do not modify the schema merely to make a screen easier without separately reviewing the migration.

## Standard modal lifecycle

```text
User action
  -> open modal
  -> collect explicit fields
  -> client-side required-field / format validation (usability only)
  -> call feature service
  -> database RLS / transaction / constraint is authoritative
  -> show success and refresh view OR show actionable error
  -> close only when appropriate
```

Destructive or financial actions need a clear confirmation, and trusted operations must be protected by database policies, constraints, and/or a secured server-side transaction. A client-only confirmation does not secure data.

## Completion checks before a deployment is called ready

- TypeScript check passes (`npm run lint`).
- Production build passes (`npm run build`).
- Google session restoration and sign-out work.
- Unauthorized user is denied workspace access.
- Mobile navigation opens, closes, and navigates.
- `/ui-reference` loads directly on the configured hosting platform.
- Modals support Escape and close controls, have sensible keyboard focus behavior, and don't accidentally submit demo actions.
- No module reports mocked/placeholder data as real.
- No schema migration or financial mutation was introduced without separate review.

## Known current limitation

The UI is a scaffold. The existing product adapter still supplies CFCF labels and its current access resolver; the modular shell makes that replaceable, but it does not by itself create a fully independent second product. The project summary says a local build/typecheck has not yet been run, so treat deploy readiness as unverified until the checks above pass.
