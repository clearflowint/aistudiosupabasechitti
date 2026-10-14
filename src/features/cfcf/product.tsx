// CFCF PRODUCT: Defines CFCF's navigation, authorization, and product-specific page ownership.
// MIX: Implements the universal product contract; the shared shell knows only neutral navigation and authorized identity.

import { History, LayoutDashboard, WalletCards } from "lucide-react";
import type { ProductDefinition } from "../../core/products/product.types";
import { FeatureModulePage } from "../../components/workspace/FeatureModulePage";
import { WorkspacePage } from "./pages/WorkspacePage";
import { NotificationsPanel } from "./pages/NotificationsPanel";
import { ActivityLogPage } from "./pages/ActivityLogPage";
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
      id: "workspace",
      label: "Workspace",
      description: "Funds, cycles, shares, and ledger",
      icon: WalletCards,
    },
    {
      id: "activity",
      label: "Manager Activity",
      description: "Latest 500 recorded manager actions",
      icon: History,
    },
  ],
  resolveWorkspace: resolveCfcfWorkspace,
  renderNotifications: (workspace) => <NotificationsPanel workspace={workspace} />,
  // MIX: Only the product adapter maps neutral navigation IDs to product screens.
  renderPage: (navigationItem, workspace) => {
    if (navigationItem.id === "workspace") return <WorkspacePage workspace={workspace} />;
    if (navigationItem.id === "activity") return <ActivityLogPage workspace={workspace} />;
    return <FeatureModulePage navigationItem={navigationItem} workspace={workspace} />;
  },
};
