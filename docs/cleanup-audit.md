# ClearFlow PWA cleanup audit

Date: 2026-10-13
Branch: main

## Baseline measurement

The pre-cleanup audit counted 30 inspected application files totaling **5,155 lines**. One additional legacy file, `src/services/otherEntriesService.ts`, was measured at 113 lines but was outside that 30-file subtotal. Therefore the measured legacy source subset was **5,268 lines across 31 files**.

This is a measured source-file subset, not a claim about every file in the repository. Configuration, lockfiles, public assets, and files not included in that inspection are excluded from the baseline.

## Cleanup completed so far

- Deleted 27 legacy business/UI files containing **3,826 measured lines**.
- Replaced `src/App.tsx`: **1,142 → 167 lines** (975 fewer).
- Replaced `src/components/LandingPage.tsx`: **158 → 52 lines** (106 fewer).
- Moved the CFCF database row types under `src/features/cfcf/types/database.types.ts`; this was a relocation, not a deletion.
- The currently measured active application/core/config subset is **577 lines across 13 files**. It includes the new app shell, sign-in screen, core auth/database modules, CFCF access resolver, database types, and selected entry/config files. It is not a full-repository line count.

## Architecture now in place

- `src/core/auth/`: shared authentication operations.
- `src/core/database/`: Supabase client and generic tenant connection check.
- `src/core/config/`: shared application configuration.
- `src/shared/types/`: generic shared types.
- `src/features/cfcf/services/access.service.ts`: CFCF-specific access resolution.
- `src/features/cfcf/types/`: CFCF database types.
- `src/components/LandingPage.tsx` and `src/App.tsx`: clean workspace shell and sign-in UI.

## Legacy code removed

The fixed-increment Chitti math engine, formula registry, old Chitti month utility, legacy tenant/type model, old fund/share/payment/expense service modules, old treasury/reporting and member/payment/winner modals, guest portal, database settings modal, old auth/service barrel, and old Supabase configuration module were removed from the active source tree.

## Not yet certified

- A production build must pass after the cleanup commits.
- OAuth, session restoration, unauthorized access, and sign-out must be retested in the deployed PWA.
- Feature pages are skeleton placeholders; CFCF CRM/funds/shares/payments are not yet implemented.
- The complete repository-wide line count and dependency/asset inventory still need a final pass.
- No Supabase schema changes were made.
