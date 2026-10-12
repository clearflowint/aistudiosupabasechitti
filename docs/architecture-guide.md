# ClearFlow architecture guide

The goal is to add new products and features without rewriting the shared app shell or mixing product-specific database logic into the UI.

## How the app is assembled

1. src/App.tsx is the composition root. It coordinates the signed-in user, asks the selected product to resolve access, and chooses the current page. It must not query CFCF tables or declare CFCF navigation.
2. src/products/productRegistry.ts registers products and selects the active one. When multiple products exist, set VITE_DEFAULT_PRODUCT_ID for that deployment.
3. src/core/products/product.types.ts defines the contract every product implements: identity, navigation, workspace resolution, and page rendering.
4. src/core/ contains shared infrastructure and types. It must not import anything from a product folder.
5. src/features/<product>/ contains that product's authorization checks, database-facing types, services, navigation, and page composition.
6. src/components/ contains shared visual components. It must not contain product table names or business rules.
7. src/reference/ui-and-modal-reference.tsx is design-only. It is intentionally not routed or imported into the live app; its buttons never persist data.

## Code markers

- // SKELETON: shared foundation or a reusable starting point. Keep it free of product table names and product business rules.
- // CFCF PRODUCT: logic or UI that belongs only to CFCF.
- // MIX: intentional composition between the generic shell and a product adapter. Prefer keeping this to registry/composition files.

Markers are signposts, not a substitute for folder boundaries. If a shared file begins to accumulate CFCF-only fields or conditions, move those details into the CFCF product module.

## Usual flow

Google sign-in → shared auth service → app asks the active product to resolve the user's workspace → product checks the current Supabase access rules → shared shell receives a minimal AuthorizedWorkspace object → product-provided navigation is rendered → product page uses its own service for data.

Keep authentication separate from product authorization. A Google-authenticated user is not automatically an authorized workspace user.

## UI and modal rule

The shared Modal component owns presentation and close behavior only. Each feature owns its fields, validation, error messages, and save action. Financial or otherwise trusted mutations must go through an appropriately secured database transaction or server-side function; a modal must never be treated as a security boundary.

The reference file demonstrates three patterns: add-record form, larger transaction form, and confirmation dialog. Copy the pattern, not its sample field list or mock actions.

## Adding a new product

1. Create src/features/<product>/product.tsx with a ProductDefinition.
2. Give it exactly one navigation item with isHome: true, unique IDs, a workspace resolver, and a page renderer.
3. Add the product to registeredProducts in the registry.
4. Deploy that product with VITE_DEFAULT_PRODUCT_ID=<PRODUCT_ID> configured.
5. Build the feature's data types and service against the existing schema. Do not alter the Supabase schema unless separately approved.
6. Typecheck/build and test allowed access, denied access, session restore, sign-out, mobile navigation, and each modal before calling the feature complete.
