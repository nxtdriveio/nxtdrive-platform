import Link from "next/link";
import {
  BadgeCheck,
  BookOpen,
  CalendarDays,
  MessageCircle,
  Route,
  Wallet,
  type LucideIcon,
} from "lucide-react";

type Shortcut = {
  href: string;
  label: string;
  icon: LucideIcon;
  badge?: number;
};

const BASE_SHORTCUTS: Shortcut[] = [
  { href: "/student/lessons", label: "Lessen", icon: CalendarDays },
  { href: "/student/voortgang", label: "Voortgang", icon: Route },
  { href: "/student/payments", label: "Betalingen", icon: Wallet },
  { href: "/student/cbr-exams", label: "Examens", icon: BadgeCheck },
  { href: "/student/theory", label: "Theorie", icon: BookOpen },
  { href: "/student/messages", label: "Berichten", icon: MessageCircle },
];

export function QuickActions({
  messageUnreadCount = 0,
}: {
  messageUnreadCount?: number;
}) {
  const shortcuts = BASE_SHORTCUTS.map((shortcut) =>
    shortcut.href === "/student/messages"
      ? { ...shortcut, badge: messageUnreadCount > 0 ? messageUnreadCount : undefined }
      : shortcut,
  );

  return (
    <section className="space-y-2">
      <div className="px-1">
        <h2 className="text-[1.02rem] font-bold tracking-tight text-brand-foreground sm:text-[1.16rem]">
          Snelle acties
        </h2>
      </div>
      <div className="grid min-w-0 grid-cols-3 gap-2 md:grid-cols-6 md:gap-3">
        {shortcuts.map((shortcut) => {
          const Icon = shortcut.icon;

          return (
            <Link
              key={shortcut.href}
              href={shortcut.href}
              className="group relative flex min-h-[5.2rem] min-w-0 flex-col items-center justify-center gap-2 rounded-[1.05rem] border border-brand-border/80 bg-white px-2.5 py-3 text-center shadow-sm transition hover:-translate-y-0.5 hover:border-brand-primary/35 hover:shadow-brand-card"
            >
              {shortcut.badge ? (
                <span className="absolute right-2 top-2 inline-flex min-w-5 items-center justify-center rounded-full bg-brand-primary px-1.5 text-[10px] font-semibold leading-5 text-brand-primary-foreground">
                  {shortcut.badge > 99 ? "99+" : shortcut.badge}
                </span>
              ) : null}
              <span className="flex h-9 w-9 items-center justify-center rounded-[0.9rem] bg-brand-accent text-brand-primary transition group-hover:bg-brand-primary group-hover:text-brand-primary-foreground">
                <Icon className="h-[1.125rem] w-[1.125rem]" aria-hidden />
              </span>
              <span className="max-w-full truncate text-[11px] font-semibold leading-none text-brand-foreground">
                {shortcut.label}
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
