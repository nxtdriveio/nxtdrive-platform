import {
  DISPLAY_STATUS_LABEL,
  DISPLAY_STATUS_VARIANT,
  displayStatus,
  formatEuros,
  remainingCents,
  type DisplayStatus,
  type Invoice,
} from "@/lib/invoices/types";

export type PaymentStatusAction = "pay_online" | "wait" | "contact_school" | "none";

export type InvoicePaymentStatusFlow = {
  displayStatus: DisplayStatus | "processing" | "not_payable";
  badgeLabel: string;
  badgeVariant: "default" | "info" | "success" | "warning" | "danger" | "outline";
  title: string;
  description: string;
  action: PaymentStatusAction;
  canPayOnline: boolean;
  paidCents: number;
  remainingCents: number;
  progressPct: number;
  dueLabel: string | null;
  remainingLabel: string;
  timeline: Array<{
    label: string;
    description: string;
    state: "done" | "active" | "open";
  }>;
};

export function buildInvoicePaymentStatusFlow(
  invoice: Invoice,
  options: {
    mollieConfigured: boolean;
    paymentProcessing?: boolean;
    todayYmd?: string;
  },
): InvoicePaymentStatusFlow {
  const paidCents = Math.max(invoice.amount_paid_cents ?? 0, 0);
  const outstandingCents = remainingCents(invoice);
  const progressPct =
    invoice.total_cents > 0
      ? Math.max(
          0,
          Math.min(100, Math.round((paidCents / invoice.total_cents) * 100)),
        )
      : 0;
  const dueInfo = getDueInfo(invoice.due_date, options.todayYmd);
  const payable =
    invoice.kind === "invoice" &&
    invoice.status === "open" &&
    outstandingCents > 0;
  const canPayOnline =
    payable && options.mollieConfigured && options.paymentProcessing !== true;

  if (options.paymentProcessing && payable) {
    return composeFlow(invoice, {
      displayStatus: "processing",
      badgeLabel: "Wordt verwerkt",
      badgeVariant: "info",
      title: "Betaling wordt verwerkt",
      description:
        "We wachten op de bevestiging van de betaalprovider. Deze pagina werkt automatisch bij zodra de betaling is verwerkt.",
      action: "wait",
      canPayOnline: false,
      dueInfo,
      paidCents,
      outstandingCents,
      progressPct,
    });
  }

  if (invoice.kind !== "invoice") {
    return composeFlow(invoice, {
      displayStatus: "not_payable",
      badgeLabel: "Niet betaalbaar",
      badgeVariant: "outline",
      title: "Deze creditfactuur hoeft niet betaald te worden",
      description:
        "Dit is een administratieve correctie. Er is geen betaalactie nodig.",
      action: "none",
      canPayOnline: false,
      dueInfo,
      paidCents,
      outstandingCents,
      progressPct,
    });
  }

  if (invoice.status === "paid" || outstandingCents === 0) {
    return composeFlow(invoice, {
      displayStatus: "paid",
      badgeLabel: "Betaald",
      badgeVariant: "success",
      title: "Deze factuur is betaald",
      description:
        "De betaling is geregistreerd en het dossier is bijgewerkt.",
      action: "none",
      canPayOnline: false,
      dueInfo,
      paidCents: Math.max(paidCents, invoice.total_cents),
      outstandingCents: 0,
      progressPct: 100,
    });
  }

  if (invoice.status === "cancelled") {
    return composeFlow(invoice, {
      displayStatus: "cancelled",
      badgeLabel: "Geannuleerd",
      badgeVariant: "warning",
      title: "Deze factuur is geannuleerd",
      description:
        "Voor deze factuur is geen betaling meer nodig. Neem contact op met de rijschool als dit niet klopt.",
      action: "contact_school",
      canPayOnline: false,
      dueInfo,
      paidCents,
      outstandingCents,
      progressPct,
    });
  }

  if (invoice.status === "draft") {
    return composeFlow(invoice, {
      displayStatus: "draft",
      badgeLabel: "Concept",
      badgeVariant: "default",
      title: "Deze factuur is nog niet verstuurd",
      description:
        "De rijschool werkt deze factuur nog af. Je hoeft nu niets te doen.",
      action: "none",
      canPayOnline: false,
      dueInfo,
      paidCents,
      outstandingCents,
      progressPct,
    });
  }

  const display = displayStatus(invoice);
  if (display === "partially_paid") {
    return composeFlow(invoice, {
      displayStatus: display,
      badgeLabel: DISPLAY_STATUS_LABEL[display],
      badgeVariant: DISPLAY_STATUS_VARIANT[display],
      title: "Deze factuur is deels betaald",
      description: canPayOnline
        ? `Er staat nog ${formatEuros(outstandingCents)} open. Je kunt het resterende bedrag direct online voldoen.`
        : `Er staat nog ${formatEuros(outstandingCents)} open. Neem contact op met de rijschool voor de betaalwijze.`,
      action: canPayOnline ? "pay_online" : "contact_school",
      canPayOnline,
      dueInfo,
      paidCents,
      outstandingCents,
      progressPct,
    });
  }

  if (display === "overdue") {
    return composeFlow(invoice, {
      displayStatus: display,
      badgeLabel: DISPLAY_STATUS_LABEL[display],
      badgeVariant: DISPLAY_STATUS_VARIANT[display],
      title: "Deze factuur is verlopen",
      description: canPayOnline
        ? `Betaal ${formatEuros(outstandingCents)} om je dossier weer bij te werken.`
        : `Er staat ${formatEuros(outstandingCents)} open. Neem contact op met de rijschool voor betaling of een afspraak.`,
      action: canPayOnline ? "pay_online" : "contact_school",
      canPayOnline,
      dueInfo,
      paidCents,
      outstandingCents,
      progressPct,
    });
  }

  return composeFlow(invoice, {
    displayStatus: "open",
    badgeLabel: "Openstaand",
    badgeVariant: "info",
    title: "Deze factuur staat open",
    description: canPayOnline
      ? `Je kunt ${formatEuros(outstandingCents)} direct online betalen.`
      : `Er staat ${formatEuros(outstandingCents)} open. De rijschool registreert je betaling zodra die binnen is.`,
    action: canPayOnline ? "pay_online" : "contact_school",
    canPayOnline,
    dueInfo,
    paidCents,
    outstandingCents,
    progressPct,
  });
}

function composeFlow(
  invoice: Invoice,
  input: {
    displayStatus: InvoicePaymentStatusFlow["displayStatus"];
    badgeLabel: string;
    badgeVariant: InvoicePaymentStatusFlow["badgeVariant"];
    title: string;
    description: string;
    action: PaymentStatusAction;
    canPayOnline: boolean;
    dueInfo: ReturnType<typeof getDueInfo>;
    paidCents: number;
    outstandingCents: number;
    progressPct: number;
  },
): InvoicePaymentStatusFlow {
  const settled = input.outstandingCents <= 0 || invoice.status === "paid";
  const activePayment =
    input.displayStatus === "processing" ||
    input.displayStatus === "partially_paid" ||
    (invoice.status === "open" && input.outstandingCents > 0);

  return {
    displayStatus: input.displayStatus,
    badgeLabel: input.badgeLabel,
    badgeVariant: input.badgeVariant,
    title: input.title,
    description: input.description,
    action: input.action,
    canPayOnline: input.canPayOnline,
    paidCents: input.paidCents,
    remainingCents: input.outstandingCents,
    progressPct: input.progressPct,
    dueLabel: input.dueInfo.label,
    remainingLabel:
      input.outstandingCents > 0
        ? formatEuros(input.outstandingCents)
        : formatEuros(0),
    timeline: [
      {
        label: "Factuur ontvangen",
        description: invoice.issued_at ? "Verstuurd door de rijschool." : "Aangemaakt door de rijschool.",
        state: invoice.status === "draft" ? "active" : "done",
      },
      {
        label: "Betaling",
        description:
          input.displayStatus === "processing"
            ? "Betaling is gestart en wordt bevestigd."
            : input.paidCents > 0
              ? `${formatEuros(input.paidCents)} geregistreerd.`
              : "Nog geen betaling geregistreerd.",
        state: settled ? "done" : activePayment ? "active" : "open",
      },
      {
        label: "Dossier bijgewerkt",
        description: settled
          ? "Factuur is voldaan."
          : "Wordt bijgewerkt zodra de betaling is verwerkt.",
        state: settled ? "done" : "open",
      },
    ],
  };
}

function getDueInfo(
  dueDate: string | null,
  todayYmd = new Date().toISOString().slice(0, 10),
): { days: number | null; label: string | null } {
  if (!dueDate) return { days: null, label: null };
  const diff = daysBetweenYmd(todayYmd, dueDate.slice(0, 10));
  if (diff < 0) {
    const abs = Math.abs(diff);
    return {
      days: diff,
      label: abs === 1 ? "1 dag verlopen" : `${abs} dagen verlopen`,
    };
  }
  if (diff === 0) return { days: 0, label: "Vervalt vandaag" };
  if (diff === 1) return { days: 1, label: "Vervalt morgen" };
  return { days: diff, label: `Vervalt over ${diff} dagen` };
}

function daysBetweenYmd(fromYmd: string, toYmd: string): number {
  const from = ymdToUtc(fromYmd);
  const to = ymdToUtc(toYmd);
  return Math.round((to - from) / 86_400_000);
}

function ymdToUtc(value: string): number {
  const [y, m, d] = value.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return Date.UTC(1970, 0, 1);
  return Date.UTC(y, m - 1, d);
}
