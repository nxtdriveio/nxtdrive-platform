import Link from "next/link";
import { MessageCircle, Phone } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
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
    <Card>
      <CardContent className="space-y-3 pt-5">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">
          Contact met {schoolName}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Link
            href="/student/berichten"
            className="relative flex flex-col items-center gap-2 rounded-lg border border-border bg-card px-3 py-4 text-center text-sm font-medium text-foreground transition-colors hover:border-primary/50 hover:bg-primary-soft/40"
          >
            <MessageCircle className="h-5 w-5 text-primary" aria-hidden />
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
              className="flex flex-col items-center gap-2 rounded-lg border border-border bg-card px-3 py-4 text-center text-sm font-medium text-foreground transition-colors hover:border-primary/50 hover:bg-primary-soft/40"
            >
              <Phone className="h-5 w-5 text-primary" aria-hidden />
              Bel
            </a>
          ) : (
            <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-muted/30 px-3 py-4 text-center text-xs text-muted-foreground">
              <Phone className="h-5 w-5 opacity-50" aria-hidden />
              Geen telefoonnummer
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
