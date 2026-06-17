import type { StudentExperience, StudentLesson } from "./types";

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || "Emma";
}

const nextLesson: StudentLesson = {
  id: "lesson-next",
  title: "Volgende les",
  dateLabel: "Do 18 juni 2026",
  timeLabel: "16:30 - 18:00",
  location: "Utrecht (Kanaalweg)",
  instructor: "Mark Jansen",
  vehicle: "Volkswagen Golf",
  lessonType: "Rijles",
  status: "planned",
  href: "/student/agenda/lesson-next",
  preparation: [
    "We oefenen kijktechniek bij rotondes.",
    "Neem je voortgangspunten van vorige les kort door.",
    "Zorg dat je 5 minuten voor vertrek klaarstaat.",
  ],
  publishedReflection: {
    summary: "Je keek rustiger vooruit en hield beter overzicht bij kruispunten.",
    feedback:
      "Blijf je binnenspiegel en zijspiegels bewust meenemen voordat je richting kiest.",
    nextFocus: "Kijktechniek en voorsorteren bij rotondes.",
  },
};

const previousLessons: StudentLesson[] = [
  {
    id: "lesson-2",
    title: "Les afgerond",
    dateLabel: "Ma 15 juni 2026",
    timeLabel: "16:30 - 18:00",
    location: "Utrecht (Kanaalweg)",
    instructor: "Mark Jansen",
    vehicle: "Volkswagen Golf",
    lessonType: "Rijles",
    status: "completed",
    href: "/student/agenda/lesson-2",
    preparation: [],
    publishedReflection: {
      summary: "Je hield goed tempo in woonwijken en bleef rustig bij drukte.",
      feedback: "Let op tijdig richting aangeven bij het verlaten van rotondes.",
      nextFocus: "Ruimte houden en eerder kijken naar oversteekplaatsen.",
    },
  },
  {
    id: "lesson-3",
    title: "Les afgerond",
    dateLabel: "Do 11 juni 2026",
    timeLabel: "16:30 - 18:00",
    location: "Utrecht (Papendorp)",
    instructor: "Mark Jansen",
    vehicle: "Volkswagen Golf",
    lessonType: "Rijles",
    status: "completed",
    href: "/student/agenda/lesson-3",
    preparation: [],
    publishedReflection: {
      summary: "Je schakelde vloeiender en hield beter afstand in stadsverkeer.",
      feedback: "Blijf je snelheid voor bochten eerder aanpassen.",
      nextFocus: "Vooruit plannen bij drukke kruisingen.",
    },
  },
];

export function createStudentDemoData({
  studentName,
  tenantName,
  email,
  phone,
}: {
  studentName: string;
  tenantName: string;
  email?: string | null;
  phone?: string | null;
}): StudentExperience {
  const first = firstName(studentName);

  return {
    profile: {
      id: "demo-student",
      name: studentName,
      firstName: first,
      tenantName,
      roleLabel: "Leerling",
      email,
      phone,
    },
    nextStep: {
      title: "Jouw volgende stap",
      body:
        "Blijf werken aan je kijktechniek en voorsorteren. Kleine stappen, groot resultaat.",
      ctaLabel: "Bekijk plan",
      href: "/student/journey",
      progressLabel: "Deze week 2/3",
      progressCurrent: 2,
      progressTotal: 3,
    },
    quickActions: [
      {
        label: "Planning",
        href: "/student/agenda",
        description: "Je lessen en tijden",
        iconName: "calendar",
      },
      {
        label: "Voortgang",
        href: "/student/journey",
        description: "Je rijbewijsreis",
        iconName: "route",
      },
      {
        label: "Betalingen",
        href: "/student/payments",
        description: "Tegoed en facturen",
        iconName: "wallet",
      },
      {
        label: "Examens",
        href: "/student/cbr-exams",
        description: "CBR en gereedheid",
        iconName: "badge",
      },
      {
        label: "Theorie",
        href: "/student/theory",
        description: "Huiswerk en toetsen",
        iconName: "book",
      },
      {
        label: "Berichten",
        href: "/student/messages",
        description: "Chat met je rijschool",
        iconName: "message",
      },
    ],
    nextLesson,
    previousLessons,
    journeyModules: [
      {
        id: "vehicle-control",
        title: "Voertuigbeheersing",
        description: "Rustig bedienen, sturen, remmen en schakelen.",
        progress: 100,
        status: "done",
      },
      {
        id: "traffic-insight",
        title: "Verkeersinzicht",
        description: "Situaties eerder herkennen en keuzes voorbereiden.",
        progress: 75,
        status: "active",
      },
      {
        id: "traffic-action",
        title: "Verkeershandelen",
        description: "Veilig handelen bij kruisingen, rotondes en drukte.",
        progress: 40,
        status: "active",
      },
      {
        id: "risk",
        title: "Risicoperceptie",
        description: "Risico's vroeg zien en voldoende ruimte houden.",
        progress: 20,
        status: "todo",
      },
      {
        id: "independence",
        title: "Zelfstandigheid",
        description: "Zelf routes rijden en keuzes uitleggen.",
        progress: 0,
        status: "todo",
      },
    ],
    journeyTrend: [
      { label: "Mrt", module1: 40, module2: 24, module3: 12, module4: 4, module5: 0 },
      { label: "Apr", module1: 72, module2: 46, module3: 26, module4: 12, module5: 0 },
      { label: "Mei", module1: 100, module2: 75, module3: 40, module4: 20, module5: 0 },
    ],
    ris: {
      active: true,
      modules: [
        {
          id: "ris-1",
          title: "Basisbediening",
          description: "Je beheerst starten, stoppen en voertuigcontrole.",
          progress: 100,
          status: "done",
        },
        {
          id: "ris-2",
          title: "Plaats op de weg",
          description: "Je oefent positie kiezen en kijken voordat je handelt.",
          progress: 68,
          status: "active",
        },
        {
          id: "ris-3",
          title: "Kruisingen en rotondes",
          description: "Je werkt aan overzicht en duidelijke keuzes.",
          progress: 42,
          status: "active",
        },
      ],
      reflection: {
        title: "Gepubliceerde lesreflectie",
        lessonLabel: "Les van 15 juni 2026",
        publishedAt: "Vandaag om 09:20",
        whatWentWell:
          "Je keek beter vooruit en bleef rustig bij het invoegen in druk verkeer.",
        workingOn:
          "We oefenen nog met vroeg voorsorteren en duidelijk richting aangeven.",
        nextFocus: "Rotondes met meerdere rijstroken.",
      },
    },
    theory: {
      progress: 72,
      statusCopy:
        "Je bent goed bezig. Blijf oefenen en maak je toetsen op tijd.",
      homework: [
        {
          id: "homework-1",
          title: "Gevaarherkenning",
          countLabel: "3 opdrachten",
          status: "open",
        },
        {
          id: "homework-2",
          title: "Voorrang",
          countLabel: "2 opdrachten",
          status: "active",
        },
        {
          id: "homework-3",
          title: "Borden en tekens",
          countLabel: "Afgerond",
          status: "done",
        },
      ],
      tests: [
        {
          id: "test-1",
          title: "Examentraining",
          meta: "5 beschikbaar",
          status: "available",
        },
        {
          id: "test-2",
          title: "Voorrangstoets",
          meta: "Geslaagd",
          status: "done",
        },
      ],
    },
    payments: {
      balance: {
        creditCents: 64500,
        creditLabel: "EUR 645,00",
        hoursAvailable: "8,5 lesuur beschikbaar",
        warning: "Let op: minder dan 10 uur. Plan op tijd je volgende les.",
      },
      invoices: [
        {
          id: "invoice-1042",
          invoiceNumber: "2025-1042",
          dateLabel: "16 mei 2026",
          amountLabel: "EUR 210,00",
          status: "paid",
          href: "/student/payments",
        },
        {
          id: "invoice-0931",
          invoiceNumber: "2025-0931",
          dateLabel: "2 mei 2026",
          amountLabel: "EUR 210,00",
          status: "paid",
          href: "/student/payments",
        },
        {
          id: "invoice-0822",
          invoiceNumber: "2025-0822",
          dateLabel: "18 apr 2026",
          amountLabel: "EUR 210,00",
          status: "paid",
          href: "/student/payments",
        },
      ],
      history: [
        {
          id: "payment-1",
          title: "Betaling ontvangen",
          dateLabel: "16 mei 2026",
          amountLabel: "+ EUR 210,00",
        },
        {
          id: "payment-2",
          title: "Les afgerond",
          dateLabel: "15 juni 2026",
          amountLabel: "- 1,5 uur",
        },
      ],
    },
    cbr: {
      readiness: 85,
      readinessCopy:
        "Op basis van je voortgang verwachten we dat je over 4-6 weken klaar bent voor het praktijkexamen.",
      statuses: [
        {
          id: "authorization",
          title: "Machtiging",
          status: "in_progress",
          explanation: "Je rijschool rondt dit met jou af.",
        },
        {
          id: "theory",
          title: "Theorie examen",
          status: "passed",
          explanation: "Geslaagd. Dit staat als schoolstatus geregistreerd.",
        },
        {
          id: "health",
          title: "Gezondheidsverklaring",
          status: "approved",
          explanation: "Goedgekeurd en klaar voor vervolgstappen.",
        },
        {
          id: "practice",
          title: "Praktijkexamen",
          status: "not_planned",
          explanation: "Nog niet gepland. Je rijschool stemt timing met je af.",
        },
      ],
    },
    messages: [
      {
        id: "instructor",
        name: "Mark Jansen",
        role: "Instructeur",
        latestMessage: "Neem je vorige focuspunten nog even door.",
        timeLabel: "09:41",
        unreadCount: 2,
        href: "/student/messages/instructor",
        messages: [
          {
            id: "m1",
            sender: "school",
            senderName: "Mark",
            body: "Goed bezig met je kijkgedrag. Donderdag pakken we rotondes verder op.",
            timeLabel: "09:12",
          },
          {
            id: "m2",
            sender: "student",
            senderName: first,
            body: "Top, ik neem mijn aantekeningen mee.",
            timeLabel: "09:18",
          },
          {
            id: "m3",
            sender: "school",
            senderName: "Mark",
            body: "Fijn. Kijk alvast naar voorrang en rijstrookkeuze.",
            timeLabel: "09:41",
          },
        ],
      },
      {
        id: "planning",
        name: "Planning",
        role: "Planning",
        latestMessage: "Je les van donderdag staat bevestigd.",
        timeLabel: "Gisteren",
        unreadCount: 0,
        href: "/student/messages/planning",
        messages: [
          {
            id: "p1",
            sender: "school",
            senderName: "Planning",
            body: "Je les van donderdag staat bevestigd om 16:30.",
            timeLabel: "Gisteren",
          },
        ],
      },
      {
        id: "admin",
        name: "Administratie",
        role: "Administratie",
        latestMessage: "Je betaling is ontvangen.",
        timeLabel: "16 mei",
        unreadCount: 0,
        href: "/student/messages/admin",
        messages: [
          {
            id: "a1",
            sender: "school",
            senderName: "Administratie",
            body: "We hebben je betaling ontvangen. Je tegoed is bijgewerkt.",
            timeLabel: "16 mei",
          },
        ],
      },
    ],
    notifications: [
      {
        id: "notif-1",
        kind: "lesson",
        title: "Les gepland",
        body: "Je volgende les staat op donderdag om 16:30.",
        timeLabel: "Vandaag",
        unread: true,
        href: "/student/agenda",
      },
      {
        id: "notif-2",
        kind: "feedback",
        title: "Feedback gepubliceerd",
        body: "Mark heeft je lesreflectie klaargezet.",
        timeLabel: "Vandaag",
        unread: true,
        href: "/student/journey/ris",
      },
      {
        id: "notif-3",
        kind: "payment",
        title: "Betaling ontvangen",
        body: "Je tegoed is bijgewerkt.",
        timeLabel: "16 mei",
        unread: false,
        href: "/student/payments",
      },
    ],
    documents: [
      {
        id: "doc-1",
        title: "Factuur 2025-1042",
        category: "Facturen",
        dateLabel: "16 mei 2026",
        status: "Klaar",
        href: "/student/payments",
      },
      {
        id: "doc-2",
        title: "Lesoverzicht mei",
        category: "Lesoverzicht",
        dateLabel: "31 mei 2026",
        status: "Nieuw",
        href: "/student/documents",
      },
      {
        id: "doc-3",
        title: "CBR statusoverzicht",
        category: "CBR",
        dateLabel: "10 juni 2026",
        status: "Verwerkt",
        href: "/student/cbr-exams",
      },
    ],
    activity: [
      {
        id: "activity-1",
        title: "Les afgerond",
        body: "Ma 15 juni 2026 - 18:35",
        timeLabel: "Vandaag",
      },
      {
        id: "activity-2",
        title: "Theorietoets gehaald",
        body: "Ma 15 juni 2026 - 14:12",
        timeLabel: "Vandaag",
      },
      {
        id: "activity-3",
        title: "Betaling ontvangen",
        body: "Vr 16 mei 2026 - 09:41",
        timeLabel: "16 mei",
      },
    ],
  };
}
