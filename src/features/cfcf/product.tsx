// CFCF PRODUCT: CFCF-specific navigation, access resolution, and page composition live here.
// MIX: This adapter uses a shared workspace page; the shell never imports this file directly.
import {
  BookOpen,
  ContactRound,
  CreditCard,
  LayoutDashboard,
  Layers3,
  Settings2,
  UsersRound,
} from "lucide-react";
import type { ProductDefinition } from "../../core/products/product.types";
import { FeatureModulePage } from "../../components/workspace/FeatureModulePage";
import { resolveCfcfWorkspace } from "./services/access.service";

export const cfcfProduct: ProductDefinition = {
  id: "CFCF",
  name: "ClearFlow CFCF",
  description: "A workspace foundation for contacts, funds, shares, and financial records.",
  navigation: [
    {
      id: "home",
      label: "Home",
      description: "Your workspace at a glance",
      icon: LayoutDashboard,
      isHome: true,
    },
    {
      id: "contacts",
      label: "Contacts",
      description: "Organise people and business relationships",
      icon: ContactRound,
    },
    {
      id: "funds",
      label: "Funds and cycles",
      description: "Set up funds and their cycle details",
      icon: Layers3,
    },
    {
      id: "shares",
      label: "Shares",
      description: "Organise shares and their assigned contacts",
      icon: UsersRound,
    },
    {
      id: "payments",
      label: "Payments and ledger",
      description: "Review financial entries and ledger activity",
      icon: CreditCard,
    },
    {
      id: "reports",
      label: "Reports",
      description: "Prepare workspace reports",
      icon: BookOpen,
    },
    {
      id: "settings",
      label: "Settings",
      description: "Manage workspace preferences",
      icon: Settings2,
    },
  ],
  resolveWorkspace: resolveCfcfWorkspace,
  renderPage: (navigationItem, workspace) => (
    <FeatureModulePage navigationItem={navigationItem} workspace={workspace} />
  ),
};
