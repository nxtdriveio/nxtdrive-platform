export {
  ALL_PERMISSIONS,
  assertRolesGrantPermission,
  grantCoversPermission,
  permissionAction,
  permissionResource,
  roleGrantsPermission,
  ROLE_PERMISSION_GRANTS,
  rolesForPermission,
  rolesGrantPermission,
  scopesForPermission,
  splitPermission,
} from "./registry";
export type {
  Permission,
  PermissionAction,
  PermissionGrant,
  PermissionResource,
  PermissionScopeKind,
} from "./registry";

export {
  branchScopeForMembership,
  branchScopeForRoles,
  branchScopeFromIds,
  canAccessBranch,
  mergeBranchAccessScopes,
  normalizeBranchScopeType,
  rolesImplyAllBranches,
  scopeRequiresBranchFilter,
} from "./scope";
export type {
  BranchAccessScope,
  BranchScopedMembership,
  BranchScopeType,
} from "./scope";
