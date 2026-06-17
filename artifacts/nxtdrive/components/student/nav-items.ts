import {
  BadgeCheck,
  BookOpen,
  CalendarDays,
  Home,
  MessageCircle,
  TrendingUp,
  User,
  Wallet,
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
 * Single source of truth for the leerling-PWA hoofdnavigatie.
 * Order follows the PWA Canon: Home · Lessen · Voortgang · Theorie · Account.
 */
export const STUDENT_NAV_ITEMS: StudentNavItem[] = [
  { href: "/student", label: "Home", icon: Home, exact: true },
  { href: "/student/lessons", label: "Lessen", icon: CalendarDays },
  { href: "/student/voortgang", label: "Voortgang", icon: TrendingUp },
  { href: "/student/theorie", label: "Theorie", icon: BookOpen },
  { href: "/student/profile", label: "Meer", icon: User },
];

export const STUDENT_BOTTOM_NAV_ITEMS = STUDENT_NAV_ITEMS;

export const STUDENT_SIDEBAR_NAV_ITEMS: StudentNavItem[] = [
  { href: "/student", label: "Dashboard", icon: Home, exact: true },
  { href: "/student/lessons", label: "Lessen", icon: CalendarDays },
  { href: "/student/voortgang", label: "Voortgang", icon: TrendingUp },
  { href: "/student/theorie", label: "Theorie", icon: BookOpen },
  { href: "/student/berichten", label: "Berichten", icon: MessageCircle },
  { href: "/student/betalingen", label: "Betalingen", icon: Wallet },
  { href: "/student/cbr", label: "CBR & Examens", icon: BadgeCheck },
  { href: "/student/profile", label: "Account", icon: User },
];

/** Whether a nav item matches the current pathname. */
export function isNavItemActive(item: StudentNavItem, pathname: string): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(item.href + "/");
}
