export type AsyncStatus = "idle" | "loading" | "success" | "error";

export interface SelectOption {
  label: string;
  value: string;
}

export interface PageNavigationItem {
  id: string;
  label: string;
  description?: string;
  icon?: string;
}
