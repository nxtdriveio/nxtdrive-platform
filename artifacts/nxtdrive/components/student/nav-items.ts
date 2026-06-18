import {
  BadgeCheck,
  BookOpen,
  CalendarDays,
  FileText,
  Home,
  MessageCircle,
  MoreHorizontal,
  Route,
  Settings,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export type StudentNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Only the exact path is active. */
  exact?: boolean;
};

export const STUDENT_BOTTOM_NAV_ITEMS: StudentNavItem[] = [
  { href: "/student", label: "Home", icon: Home, exact: true },
  { href: "/student/lessons", label: "Lessen", icon: CalendarDays },
  { href: "/student/voortgang", label: "Voortgang", icon: Route },
  { href: "/student/theory", label: "Theorie", icon: BookOpen },
  { href: "/student/more", label: "Meer", icon: MoreHorizontal },
];

export const STUDENT_SIDEBAR_NAV_ITEMS: StudentNavItem[] = [
  { href: "/student", label: "Dashboard", icon: Home, exact: true },
  { href: "/student/journey", label: "Mijn reis", icon: Route },
  { href: "/student/agenda", label: "Agenda", icon: CalendarDays },
  { href: "/student/theory", label: "Theorie", icon: BookOpen },
  { href: "/student/messages", label: "Berichten", icon: MessageCircle },
  { href: "/student/payments", label: "Betalingen", icon: Wallet },
  { href: "/student/cbr-exams", label: "CBR & Examens", icon: BadgeCheck },
  { href: "/student/documents", label: "Documenten", icon: FileText },
  { href: "/student/settings", label: "Instellingen", icon: Settings },
];

export const STUDENT_NAV_ITEMS = STUDENT_SIDEBAR_NAV_ITEMS;

export function isNavItemActive(item: StudentNavItem, pathname: string): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(item.href + "/");
}
