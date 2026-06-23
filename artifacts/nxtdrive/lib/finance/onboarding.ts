import type { InstallmentCreditMode } from "@/lib/invoices/installment-credit";
import type { PaymentReminderPolicy } from "@/lib/invoices/payment-reminder-policy";

export type FinanceOnboardingStepStatus = "done" | "attention" | "open";

export type FinanceOnboardingFacts = {
  tenantName: string;
  mollie: {
    configured: boolean;
    mode: "test" | "live" | null;
  };
  paymentReminderPolicy: PaymentReminderPolicy;
  installmentCreditMode: InstallmentCreditMode;
  packageCount: number;
  invoiceCounts: {
    total: number;
    draft: number;
    open: number;
    paid: number;
    overdue: number;
    withOnlinePayment: number;
  };
  paymentRecordCount: number;
  vatRateCount: number;
};

export type FinanceOnboardingStep = {
  id: string;
  title: string;
  status: FinanceOnboardingStepStatus;
  owner: string;
  goal: string;
  customerQuestion: string;
  setupAction: string;
  verification: string;
};

export type FinanceOnboardingScriptSection = {
  title: string;
  body: string;
  bullets: string[];
};

export type FinanceOnboardingPlan = {
  completionPct: number;
  statusLabel: string;
  status: FinanceOnboardingStepStatus;
  steps: FinanceOnboardingStep[];
  conversationScript: FinanceOnboardingScriptSection[];
  goLiveChecklist: string[];
  riskNotes: string[];
};

export function buildFinanceOnboardingPlan(
  facts: FinanceOnboardingFacts,
): FinanceOnboardingPlan {
  const steps: FinanceOnboardingStep[] = [
    invoiceBasisStep(facts),
    packagesAndCreditStep(facts),
    installmentCreditStep(facts),
    mollieStep(facts),
    remindersStep(facts),
    accountingControlStep(facts),
    goLiveStep(facts),
  ];
  const doneCount = steps.filter((step) => step.status === "done").length;
  const completionPct = Math.round((doneCount / steps.length) * 100);
  const status =
    steps.some((step) => step.status === "open")
      ? "open"
      : steps.some((step) => step.status === "attention")
        ? "attention"
        : "done";

  return {
    completionPct,
    status,
    statusLabel:
      status === "done"
        ? "Finance klaar voor gebruik"
        : status === "attention"
          ? "Bijna klaar"
          : "Onboarding nodig",
    steps,
    conversationScript: buildConversationScript(facts),
    goLiveChecklist: buildGoLiveChecklist(facts),
    riskNotes: buildRiskNotes(facts),
  };
}

function invoiceBasisStep(facts: FinanceOnboardingFacts): FinanceOnboardingStep {
  const hasInvoices = facts.invoiceCounts.total > 0;
  return {
    id: "invoice_basis",
    title: "Factuurbasis en nummering",
    status: hasInvoices ? "done" : "open",
    owner: "Administratie",
    goal:
      "Bepaal hoe de rijschool facturen maakt, controleert en vrijgeeft naar leerlingen of ouders.",
    customerQuestion:
      "Wie mag facturen aanmaken, controleren, versturen, crediteren en handmatig betalingen vastleggen?",
    setupAction:
      "Maak minimaal een testfactuur aan met btw-regels, vervaldatum, leerlingkoppeling en interne notitie.",
    verification: hasInvoices
      ? `${facts.invoiceCounts.total} factuur/facturen gevonden in deze tenant.`
      : "Nog geen facturen gevonden; maak eerst een concept- en open factuur aan.",
  };
}

function packagesAndCreditStep(facts: FinanceOnboardingFacts): FinanceOnboardingStep {
  const hasPackages = facts.packageCount > 0;
  return {
    id: "packages_credit",
    title: "Pakketten, tegoed en lesvrijgave",
    status: hasPackages ? "done" : "open",
    owner: "Rijschoolbeheer",
    goal:
      "Zorg dat pakketten, lestegoed en facturatie op dezelfde waarheid leunen.",
    customerQuestion:
      "Welke pakketten verkoopt de rijschool, hoeveel lestegoed hoort daarbij en mag tegoed vooruitlopen op betaling?",
    setupAction:
      "Controleer pakketten, tegoedminuten, betaaltermijnen en of leerlingplanning rekening houdt met saldo.",
    verification: hasPackages
      ? `${facts.packageCount} pakket(ten) beschikbaar voor facturatie en tegoed.`
      : "Nog geen pakketten gevonden; leg eerst de verkoopstructuur vast.",
  };
}

function installmentCreditStep(facts: FinanceOnboardingFacts): FinanceOnboardingStep {
  const safe = facts.installmentCreditMode === "per_installment";
  return {
    id: "installment_credit",
    title: "Termijnbetalingen en tegoedvrijgave",
    status: safe ? "done" : "attention",
    owner: "Finance",
    goal:
      "Leg vast wanneer tegoed beschikbaar komt bij termijnfacturen, zodat planning en betaling gelijk blijven lopen.",
    customerQuestion:
      "Moet een leerling direct al het tegoed krijgen, of alleen het deel waarvoor de termijn is betaald?",
    setupAction:
      "Kies de termijn-tegoedregel en bespreek wat er gebeurt bij een gemiste termijn.",
    verification: safe
      ? "Tegoed wordt per betaalde termijn vrijgegeven."
      : "Tegoed wordt direct volledig vrijgegeven; bespreek dit als bewust kredietrisico.",
  };
}

function mollieStep(facts: FinanceOnboardingFacts): FinanceOnboardingStep {
  const status: FinanceOnboardingStepStatus = facts.mollie.configured
    ? facts.mollie.mode === "live"
      ? "done"
      : "attention"
    : "open";
  return {
    id: "mollie",
    title: "Online betalen via Mollie",
    status,
    owner: "Finance / NXTDRIVE",
    goal:
      "Maak betaalverzoeken betrouwbaar, traceerbaar en gekoppeld aan de juiste factuur.",
    customerQuestion:
      "Gebruikt de rijschool Mollie live, test eerst intern of worden betalingen voorlopig handmatig geboekt?",
    setupAction:
      "Sla de Mollie API-sleutel op, maak een betaallink voor een open factuur en controleer de webhookverwerking.",
    verification:
      status === "done"
        ? "Mollie staat in live modus."
        : status === "attention"
          ? "Mollie staat in testmodus; plan de live sleutel voor go-live."
          : "Mollie is nog niet gekoppeld.",
  };
}

function remindersStep(facts: FinanceOnboardingFacts): FinanceOnboardingStep {
  const policy = facts.paymentReminderPolicy;
  return {
    id: "payment_reminders",
    title: "Betaalherinneringen en communicatie",
    status: policy.enabled && policy.days.length > 0 ? "done" : "attention",
    owner: "Administratie",
    goal:
      "Voorkom losse opvolging door duidelijke betaalherinneringen en afspraken over toon en timing.",
    customerQuestion:
      "Wanneer wil de rijschool herinneren en wie pakt uitzonderingen of betaalafspraken op?",
    setupAction:
      "Controleer herinneringsmomenten, notificatieteksten en interne taakopvolging voor openstaande facturen.",
    verification:
      policy.enabled && policy.days.length > 0
        ? `Herinneringen actief na ${policy.days.join(", ")} dag(en) na vervaldatum.`
        : "Herinneringen staan uit of hebben geen momenten.",
  };
}

function accountingControlStep(facts: FinanceOnboardingFacts): FinanceOnboardingStep {
  const hasRevenue = facts.invoiceCounts.paid > 0 || facts.paymentRecordCount > 0;
  const hasVat = facts.vatRateCount > 0;
  return {
    id: "accounting_control",
    title: "Boekhouding, btw en maandcontrole",
    status: hasRevenue && hasVat ? "done" : facts.invoiceCounts.total > 0 ? "attention" : "open",
    owner: "Boekhouding",
    goal:
      "Maak omzet, open posten, btw en export controleerbaar voor de boekhouder.",
    customerQuestion:
      "Welke rapportage heeft de boekhouder nodig: facturenexport, open posten, btw per tarief of betaalrecords?",
    setupAction:
      "Draai een maandexport, controleer btw-tarieven en vergelijk open posten met de administratie.",
    verification:
      hasRevenue && hasVat
        ? "Betaalde omzet en btw-tarieven zijn zichtbaar in de boekhoudrapportage."
        : "Controleer de eerste betaalde factuur en btw-regels voordat finance live gaat.",
  };
}

function goLiveStep(facts: FinanceOnboardingFacts): FinanceOnboardingStep {
  const ready =
    facts.packageCount > 0 &&
    facts.invoiceCounts.total > 0 &&
    facts.mollie.configured &&
    facts.paymentReminderPolicy.enabled;
  return {
    id: "go_live",
    title: "Go-live proefrun",
    status: ready ? (facts.mollie.mode === "live" ? "done" : "attention") : "open",
    owner: "Klant + NXTDRIVE",
    goal:
      "Bewijs met een echte proefrun dat factuur, betaling, tegoed, herinnering en rapportage dezelfde uitkomst geven.",
    customerQuestion:
      "Welke leerling of interne testpersoon gebruiken we om de volledige flow veilig door te lopen?",
    setupAction:
      "Maak een factuur, genereer of boek betaling, controleer tegoed, leerlingweergave, herinneringsregels en export.",
    verification: ready
      ? "Alle basisonderdelen zijn aanwezig; voer de proefrun uit of rond live-sleutel af."
      : "Nog niet alle basisonderdelen zijn ingericht voor een volledige proefrun.",
  };
}

function buildConversationScript(
  facts: FinanceOnboardingFacts,
): FinanceOnboardingScriptSection[] {
  return [
    {
      title: "Opening",
      body: `We richten finance voor ${facts.tenantName} zo in dat facturen, betalingen, tegoed en rapportage op elkaar aansluiten.`,
      bullets: [
        "We beginnen met de verkoopstructuur: pakketten, losse lessen en eventuele termijnen.",
        "Daarna controleren we hoe leerlingen of ouders betalen en wie intern opvolgt.",
        "We sluiten af met een proefrun en maandcontrole, zodat de boekhouding dezelfde cijfers ziet.",
      ],
    },
    {
      title: "Besluitpunten met de klant",
      body:
        "Leg tijdens onboarding expliciet vast welke financiele keuzes de rijschool maakt. Dit voorkomt dat finance later per medewerker anders wordt uitgevoerd.",
      bullets: [
        "Wie mag facturen aanmaken, publiceren, crediteren en betalingen handmatig boeken?",
        "Wanneer komt lestegoed vrij: direct of per betaalde termijn?",
        "Wanneer sturen we betaalherinneringen en wanneer wordt een medewerker ingeschakeld?",
        "Welke gegevens wil de boekhouder periodiek ontvangen?",
      ],
    },
    {
      title: "Proefrun",
      body:
        "Gebruik een veilige testleerling of echte klantcasus met laag bedrag en loop de volledige keten door.",
      bullets: [
        "Maak een factuur met btw-regels en vervaldatum.",
        "Koppel een online betaling of boek een handmatige betaling.",
        "Controleer of factuurstatus, payment record, tegoed en leerlingweergave kloppen.",
        "Controleer daarna open posten, omzetrapportage en boekhoudexport.",
      ],
    },
  ];
}

function buildGoLiveChecklist(facts: FinanceOnboardingFacts): string[] {
  return [
    facts.packageCount > 0
      ? "Pakketten en tegoedregels zijn aanwezig."
      : "Maak minimaal een pakket of vaste factuurstructuur aan.",
    facts.mollie.configured
      ? facts.mollie.mode === "live"
        ? "Mollie live sleutel is gekoppeld."
        : "Vervang de Mollie test sleutel door de live sleutel voor productie."
      : "Koppel Mollie of besluit dat betalingen handmatig worden geboekt.",
    facts.paymentReminderPolicy.enabled
      ? "Betaalherinneringen zijn ingericht."
      : "Besluit bewust of betaalherinneringen uit blijven.",
    facts.invoiceCounts.total > 0
      ? "Er is minimaal een factuurflow getest."
      : "Maak een testfactuur en controleer het hele proces.",
    facts.invoiceCounts.overdue > 0
      ? "Controleer open/verlopen posten voor livegang."
      : "Geen verlopen facturen in de huidige tenantstatus.",
    facts.vatRateCount > 0
      ? "Btw-tarieven zijn zichtbaar in rapportage."
      : "Controleer btw-regels zodra de eerste factuur betaald is.",
  ];
}

function buildRiskNotes(facts: FinanceOnboardingFacts): string[] {
  const notes: string[] = [];
  if (!facts.mollie.configured) {
    notes.push("Zonder Mollie worden online betaalflows niet automatisch verwerkt.");
  } else if (facts.mollie.mode === "test") {
    notes.push("Mollie staat nog in testmodus; live betalingen werken pas met een live sleutel.");
  }
  if (facts.installmentCreditMode === "immediate") {
    notes.push("Directe tegoedvrijgave kan betekenen dat lessen vooruitlopen op betaling.");
  }
  if (!facts.paymentReminderPolicy.enabled) {
    notes.push("Betaalherinneringen staan uit; open posten vragen dan handmatige opvolging.");
  }
  if (facts.invoiceCounts.overdue > 0) {
    notes.push(`${facts.invoiceCounts.overdue} open factuur/facturen zijn verlopen.`);
  }
  if (facts.packageCount === 0) {
    notes.push("Zonder pakketten mist de standaard verkoop- en tegoedstructuur.");
  }
  return notes;
}
