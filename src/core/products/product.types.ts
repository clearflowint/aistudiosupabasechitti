// SKELETON: A product plugs into the shared shell through this contract.
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import type { AuthorizedWorkspace } from "../workspace/workspace.types";

export interface WorkspaceNavigationItem {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
  isHome?: boolean;
}

export interface ProductDefinition {
  id: string;
  name: string;
  description: string;
  navigation: readonly WorkspaceNavigationItem[];
  resolveWorkspace: (email: string) => Promise<AuthorizedWorkspace>;
  renderPage: (
    navigationItem: WorkspaceNavigationItem,
    workspace: AuthorizedWorkspace,
  ) => ReactNode;
  // MIX: Optional product-owned notification content mounted inside the neutral notification frame.
  renderNotifications?: (workspace: AuthorizedWorkspace, onNavigate: (pageId: string) => void) => ReactNode;
}
