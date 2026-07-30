import Link from "next/link";
import { MessageCircle, Phone } from "lucide-react";
import { StudentShowcaseCard } from "@/components/student/Showcase";
import { telHref } from "@/lib/tenant/contact-phone";

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
    <StudentShowcaseCard
      title={`Contact met ${schoolName}`}
      eyebrow="Direct contact"
      info="Chat is meestal het snelst. Als je rijschool een telefoonnummer heeft ingesteld, kun je die hier ook direct bellen."
    >
      <div className="grid min-w-0 grid-cols-2 gap-3">
        <Link
          href="/leerling/berichten"
          className="group relative min-w-0 overflow-hidden rounded-[1.25rem] border border-white/10 bg-white/[0.03] px-3.5 py-4 text-left transition-colors hover:border-primary/40 hover:bg-white/[0.05]"
        >
          <div className="absolute -right-6 -top-6 h-16 w-16 rounded-full bg-primary/12 transition group-hover:scale-125" />
          <span className="relative flex h-10 w-10 items-center justify-center rounded-[1rem] bg-primary/18 text-primary">
            <MessageCircle className="h-5 w-5" aria-hidden />
          </span>
          <div className="relative mt-3 text-sm font-bold text-white">Chat</div>
          <div className="relative mt-0.5 text-[11px] leading-5 text-white/50">
            Stuur direct een bericht
          </div>
          {unreadCount > 0 ? (
            <span
              className="absolute right-3 top-3 inline-flex min-w-[1.35rem] items-center justify-center rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground"
              style={{
                boxShadow:
                  "0 10px 25px color-mix(in oklab, var(--primary) 35%, transparent)",
              }}
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          ) : null}
        </Link>

        {tel ? (
          <a
            href={tel}
            className="group relative min-w-0 overflow-hidden rounded-[1.25rem] border border-white/10 bg-white/[0.03] px-3.5 py-4 text-left transition-colors hover:border-primary/40 hover:bg-white/[0.05]"
          >
            <div className="absolute -right-6 -top-6 h-16 w-16 rounded-full bg-primary/12 transition group-hover:scale-125" />
            <span className="relative flex h-10 w-10 items-center justify-center rounded-[1rem] bg-primary/18 text-primary">
              <Phone className="h-5 w-5" aria-hidden />
            </span>
            <div className="relative mt-3 text-sm font-bold text-white">Bel</div>
            <div className="relative mt-0.5 text-[11px] leading-5 text-white/50">
              Direct contact
            </div>
          </a>
        ) : (
          <div className="min-w-0 overflow-hidden rounded-[1.25rem] border border-dashed border-white/10 bg-white/[0.02] px-3.5 py-4 text-left text-white/42">
            <Phone className="h-6 w-6 opacity-40" aria-hidden />
            <div className="mt-3 text-sm font-semibold text-white/64">Geen nummer</div>
            <div className="mt-0.5 text-[11px] leading-5">Gebruik chat</div>
          </div>
        )}
      </div>
    </StudentShowcaseCard>
  );
}
