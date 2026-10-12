# ClearFlow PWA cleanup audit

Date: 2026-10-13
Branch: main

## Baseline measurement

The pre-cleanup audit counted 30 inspected application files totaling **5,155 lines**. One additional legacy file, src/services/otherEntriesService.ts, was measured at 113 lines but was outside that 30-file subtotal. Therefore the measured legacy source subset was **5,268 lines across 31 files**.

This was a measured source-file subset, not a complete repository line count.

## Cleanup completed before the product-shell refactor

- Deleted 27 legacy business/UI files containing **3,826 measured lines**.
- Replaced the old App.tsx and sign-in page with smaller modules.
- Moved CFCF database row types under src/features/cfcf/types/database.types.ts.
- Removed old Chitti math/formula modules, legacy fund/share/payment/expense services, old treasury and member/payment/winner modals, guest portal, database settings modal, old auth/service barrel, and old Supabase configuration module.

## Product-neutral shell refactor

- App.tsx now coordinates shared authentication, active-product workspace resolution, selected-page state, and rendering only. It does not import the CFCF resolver.
- src/core/products/product.types.ts defines the product adapter contract.
- src/products/productRegistry.ts is the explicit composition point for registering/selecting products.
- src/features/cfcf/product.tsx owns CFCF navigation, workspace resolution, and its page renderer.
- src/core/workspace/workspace.types.ts exposes a product-neutral workspace identity.
- Rebuilt the Home page and navigation frame as reusable components.
- Added a shared Modal presentation component plus an un-routed reference-only file for add-record, transaction, and confirmation designs.
- Added docs/architecture-guide.md documenting architecture, ownership boundaries, and the // SKELETON, // CFCF PRODUCT, and // MIX markers.
- No Supabase schema changes were made.

## Not yet certified

- The local environment could not clone GitHub to run a build. The latest refactor still needs a production build and TypeScript check; no build success is claimed here.
- OAuth sign-in, session restore, denied access, sign-out, connection retry, and mobile navigation need deployment testing.
- Contacts, funds/cycles, shares, payments/ledger, and reports currently use explicitly labeled skeleton pages. These pages do not read or write records.
- The full repository-wide audit for dead files/imports and exact line counts should be rerun after this refactor.
