import type { MemberRole } from "@/lib/types";

/**
 * Shared role-to-home mapping used by login and access-denial redirects.
 * Keep this pure so role priority stays easy to test outside Next.js.
 */
export function homePathForRoles(roles: MemberRole[]): string {
  if (roles.includes("tenant_admin")) return "/backoffice";
  if (roles.includes("franchise_admin")) return "/backoffice";
  if (roles.includes("branch_manager")) return "/backoffice";
  if (roles.includes("planner")) return "/backoffice";
  if (roles.includes("admin_staff")) return "/backoffice";
  if (roles.includes("marketing")) return "/backoffice";
  if (roles.includes("instructor")) return "/instructeur";
  if (roles.includes("student")) return "/leerling";
  if (roles.includes("parent")) return "/ouder";
  return "/";
}
