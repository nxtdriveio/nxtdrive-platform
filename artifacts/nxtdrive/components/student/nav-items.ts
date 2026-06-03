import {
  Home,
  CalendarDays,
  TrendingUp,
  BookOpen,
  User,
  type LucideIcon,
} from "lucide-react";

export type StudentNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Only the exact path is active (used for the Home/root entry). */
  exact?: boolean;
};

/**
 * Single source of truth for the leerling-PWA hoofdnavigatie, shared by the
 * mobile bottom nav and the desktop sidebar so both always stay in sync.
 * Order follows the PWA Canon: Home · Lessen · Voortgang · Theorie · Account.
 * Betalingen is reachable from Home/quick-actions but is not a primary tab
 * (canon lists it under "eventueel later").
 */
export const STUDENT_NAV_ITEMS: StudentNavItem[] = [
  { href: "/student", label: "Home", icon: Home, exact: true },
  { href: "/student/lessons", label: "Lessen", icon: CalendarDays },
  { href: "/student/voortgang", label: "Voortgang", icon: TrendingUp },
  { href: "/student/theorie", label: "Theorie", icon: BookOpen },
  { href: "/student/profile", label: "Account", icon: User },
];

/** Whether a nav item matches the current pathname. */
export function isNavItemActive(item: StudentNavItem, pathname: string): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(item.href + "/");
}
