// SKELETON: Product-neutral identity shared by the workspace shell and feature modules.
export interface AuthorizedWorkspace {
  email: string;
  tenantId: string;
  personId: string;
  displayName: string;
}
