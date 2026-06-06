import Link from "next/link";
import { MessageCircle, Phone, School } from "lucide-react";
import { PWACard, PWASectionHeader } from "@/components/pwa/primitives";
import { telHref } from "@/lib/tenant/contact-phone";

/**
 * Student home entrypoint to contacting the school: a "Chat" button that opens
 * Berichten and an optional "Bel" tel-link (only shown when the tenant set a
 * contact phone in instellingen). White-label aware via the school name.
 */
export function ContactCard({
  schoolName,
  contactPhone,
  unreadCount,
}: {
  schoolName: string;
  contactPhone: string | null;
  unreadCount: number;
}) {
  const tel = telHref(contactPhone);
  return (
    <PWACard>
      <PWASectionHeader
        icon={<School className="h-3.5 w-3.5" aria-hidden />}
      >
        Contact met {schoolName}
      </PWASectionHeader>
      <div className="grid min-w-0 grid-cols-2 gap-3">
        <Link
          href="/student/berichten"
          className="group relative min-w-0 overflow-hidden rounded-2xl border border-border bg-card px-3 py-4 text-left transition hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-lg hover:shadow-primary/10"
        >
          <div className="absolute -right-6 -top-6 h-16 w-16 rounded-full bg-primary/10 transition group-hover:scale-125" />
          <span className="relative flex h-10 w-10 items-center justify-center rounded-2xl bg-primary-soft text-primary shadow-lg shadow-primary/10">
            <MessageCircle className="h-5 w-5" aria-hidden />
          </span>
          <div className="relative mt-3 text-sm font-bold text-foreground">Chat</div>
          <div className="relative mt-0.5 text-[11px] leading-4 text-muted-foreground">
            Stuur bericht
          </div>
          {unreadCount > 0 ? (
            <span className="absolute right-3 top-3 inline-flex min-w-[1.35rem] items-center justify-center rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          ) : null}
        </Link>
        {tel ? (
          <a
            href={tel}
            className="group relative min-w-0 overflow-hidden rounded-2xl border border-border bg-card px-3 py-4 text-left transition hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-lg hover:shadow-primary/10"
          >
            <div className="absolute -right-6 -top-6 h-16 w-16 rounded-full bg-primary/10 transition group-hover:scale-125" />
            <span className="relative flex h-10 w-10 items-center justify-center rounded-2xl bg-primary-soft text-primary shadow-lg shadow-primary/10">
              <Phone className="h-5 w-5" aria-hidden />
            </span>
            <div className="relative mt-3 text-sm font-bold text-foreground">Bel</div>
            <div className="relative mt-0.5 text-[11px] leading-4 text-muted-foreground">
              Direct contact
            </div>
          </a>
        ) : (
          <div className="min-w-0 overflow-hidden rounded-2xl border border-dashed border-border bg-muted/30 px-3 py-4 text-left text-muted-foreground">
            <Phone className="h-6 w-6 opacity-40" aria-hidden />
            <div className="mt-3 text-sm font-semibold text-muted-foreground">
              Geen nummer
            </div>
            <div className="mt-0.5 text-[11px] leading-4">
              Gebruik chat
            </div>
          </div>
        )}
      </div>
    </PWACard>
  );
}
