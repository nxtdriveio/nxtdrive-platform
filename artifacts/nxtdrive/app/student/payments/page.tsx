import { CreditCard, Receipt, Wallet } from "lucide-react";
import { getStudentPwaContext } from "@/lib/student-pwa/context";
import {
  StudentInvoiceList,
  StudentPageHeader,
  StudentPaymentBalanceCard,
  StudentSection,
} from "@/components/student/StudentPwa";

export const dynamic = "force-dynamic";

export default async function StudentPaymentsPage() {
  const { experience } = await getStudentPwaContext();

  return (
    <div className="min-w-0 space-y-4 lg:space-y-6">
      <StudentPageHeader
        eyebrow="Betalingen"
        title="Tegoed en facturen"
        subtitle="Bekijk je lesuren, facturen en betaalstatus. Online betalen gebruikt de bestaande betaalflow zodra die beschikbaar is."
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(22rem,0.75fr)_minmax(0,1.25fr)]">
        <div className="space-y-4">
          <StudentSection title="Tegoed" icon={Wallet}>
            <StudentPaymentBalanceCard balance={experience.payments.balance} />
          </StudentSection>
          <StudentSection title="Betaalflow" icon={CreditCard}>
            <div className="rounded-[var(--radius-card)] border border-brand-border bg-card/90 p-4 text-sm leading-6 text-brand-muted-foreground shadow-brand-card">
              Betaalflow wordt binnenkort beschikbaar wanneer Mollie voor jouw
              rijschool actief is.
            </div>
          </StudentSection>
        </div>

        <div className="space-y-4">
          <StudentSection title="Laatste facturen" icon={Receipt}>
            <StudentInvoiceList invoices={experience.payments.invoices} />
          </StudentSection>
          <StudentSection title="Betaalgeschiedenis" icon={CreditCard}>
            <div className="rounded-[var(--radius-card)] border border-brand-border bg-card/90 shadow-brand-card">
              <div className="divide-y divide-brand-border/80">
                {experience.payments.history.map((item) => (
                  <div key={item.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-brand-foreground">
                        {item.title}
                      </p>
                      <p className="text-xs text-brand-muted-foreground">{item.dateLabel}</p>
                    </div>
                    <p className="shrink-0 text-sm font-black text-brand-foreground">
                      {item.amountLabel}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </StudentSection>
        </div>
      </div>
    </div>
  );
}
