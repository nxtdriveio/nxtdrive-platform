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
import { learnerRoutes } from "@/lib/routes";

export type StudentNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Only the exact path is active. */
  exact?: boolean;
};

type LearnerRouteId = (typeof learnerRoutes)[number]["id"];

function learnerNavItem(
  id: LearnerRouteId,
  icon: LucideIcon,
  exact = false,
): StudentNavItem {
  const route = learnerRoutes.find((candidate) => candidate.id === id);
  if (!route) throw new Error(`Unknown learner route: ${id}`);
  return {
    href: route.canonicalPath,
    label: route.navLabel,
    icon,
    exact,
  };
}

export const STUDENT_BOTTOM_NAV_ITEMS: StudentNavItem[] = [
  learnerNavItem("learner.home", Home, true),
  learnerNavItem("learner.lessons", CalendarDays),
  learnerNavItem("learner.progress", Route),
  learnerNavItem("learner.messages", MessageCircle),
  { ...learnerNavItem("learner.settings", MoreHorizontal), label: "Meer" },
];

export const STUDENT_SIDEBAR_NAV_ITEMS: StudentNavItem[] = [
  {
    ...learnerNavItem("learner.home", Home, true),
    label: "Dashboard",
  },
  learnerNavItem("learner.progress", Route),
  learnerNavItem("learner.lessons", CalendarDays),
  learnerNavItem("learner.reflection", Route),
  learnerNavItem("learner.theory", BookOpen),
  learnerNavItem("learner.messages", MessageCircle),
  learnerNavItem("learner.payments", Wallet),
  learnerNavItem("learner.exams", BadgeCheck),
  learnerNavItem("learner.documents", FileText),
  learnerNavItem("learner.settings", Settings),
];

export const STUDENT_NAV_ITEMS = STUDENT_SIDEBAR_NAV_ITEMS;

export function isNavItemActive(
  item: StudentNavItem,
  pathname: string,
): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(item.href + "/");
}
