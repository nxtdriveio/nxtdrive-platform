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
      <div className="grid grid-cols-2 gap-2.5">
        <Link
          href="/student/berichten"
          className="relative flex min-h-[3.5rem] flex-col items-center justify-center gap-2 rounded-xl border border-border bg-card px-3 py-4 text-center text-sm font-medium text-foreground transition-colors hover:border-primary/50 hover:bg-primary-soft/40"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-soft text-primary">
            <MessageCircle className="h-5 w-5" aria-hidden />
          </span>
          Chat
          {unreadCount > 0 ? (
            <span className="absolute right-2 top-2 inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          ) : null}
        </Link>
        {tel ? (
          <a
            href={tel}
            className="flex min-h-[3.5rem] flex-col items-center justify-center gap-2 rounded-xl border border-border bg-card px-3 py-4 text-center text-sm font-medium text-foreground transition-colors hover:border-primary/50 hover:bg-primary-soft/40"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-soft text-primary">
              <Phone className="h-5 w-5" aria-hidden />
            </span>
            Bel
          </a>
        ) : (
          <div className="flex min-h-[3.5rem] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/30 px-3 py-4 text-center text-xs text-muted-foreground">
            <Phone className="h-5 w-5 opacity-40" aria-hidden />
            Geen telefoonnummer
          </div>
        )}
      </div>
    </PWACard>
  );
}
