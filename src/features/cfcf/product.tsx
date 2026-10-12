// CFCF PRODUCT: CFCF navigation and authorization live here; page presentation is owned by feature modules.
// MIX: The shared shell receives only these three top-level destinations.

import { ContactRound, LayoutDashboard, WalletCards } from "lucide-react";
import type { ProductDefinition } from "../../core/products/product.types";
import { FeatureModulePage } from "../../components/workspace/FeatureModulePage";
import { ContactsPage } from "./pages/ContactsPage";
import { WorkspacePage } from "./pages/WorkspacePage";
import { resolveCfcfWorkspace } from "./services/access.service";

export const cfcfProduct: ProductDefinition = {
  id: "CFCF",
  name: "ClearFlow",
  description: "Contacts, funds, cycles, shares, and financial records in one simple workspace.",
  navigation: [
    {
      id: "home",
      label: "Home",
      description: "Your ClearFlow starting point",
      icon: LayoutDashboard,
      isHome: true,
    },
    {
      id: "crm",
      label: "CRM",
      description: "Find and manage contacts",
      icon: ContactRound,
    },
    {
      id: "workspace",
      label: "Workspace",
      description: "Funds, cycles, shares, and ledger",
      icon: WalletCards,
    },
  ],
  resolveWorkspace: resolveCfcfWorkspace,
  // MIX: Only the product adapter maps neutral navigation IDs to product screens.
  renderPage: (navigationItem, workspace) => {
    if (navigationItem.id === "crm") return <ContactsPage workspace={workspace} />;
    if (navigationItem.id === "workspace") return <WorkspacePage workspace={workspace} />;
    return <FeatureModulePage navigationItem={navigationItem} workspace={workspace} />;
  },
};
