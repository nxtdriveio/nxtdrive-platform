import type { InstructorAgendaCreateOptions } from "@/domains/planning/application/instructor-agenda-create-options";
import type { InstructorAgendaWizardBootstrap } from "@/domains/planning/application/smart-appointment-contracts";
import {
  DEFAULT_APPOINTMENT_WIZARD_SETTINGS,
  PLATFORM_APPOINTMENT_TYPE_POLICIES,
} from "@/domains/planning/domain/appointment-policy";
import type {
  InstructorDayAgendaItem,
  InstructorDayCalendarType,
} from "@/domains/planning/domain/instructor-day-calendar";
import type {
  InstructorAppointment,
  InstructorAppointmentType,
  InstructorExperience,
} from "@/lib/instructor/redesign-data";

export function fixtureAppointment(input: {
  id: string;
  displayType: InstructorAppointmentType;
  calendarType: InstructorDayCalendarType;
  title: string;
  studentName?: string;
  startsAtIso: string;
  endsAtIso: string;
  startsAt: string;
  endsAt: string;
  location: string;
  status?: InstructorAppointment["status"];
  travelFromPrevious?: InstructorDayAgendaItem["travelFromPrevious"];
}): InstructorAppointment {
  const href =
    input.displayType === "lesson"
      ? `/instructeur/lessen/${input.id}`
      : `/instructeur/agenda/${input.id}`;
  const calendarItem: InstructorDayAgendaItem = {
    id: input.id,
    kind:
      input.calendarType === "lesson"
        ? "lesson"
        : input.calendarType === "trial"
          ? "trial"
          : "appointment",
    type: input.calendarType,
    startsAt: input.startsAtIso,
    endsAt: input.endsAtIso,
    status: input.status ?? "planned",
    title: input.title,
    participantLabel: input.studentName,
    location: { label: "Locatie", formattedAddress: input.location },
    vehicle:
      input.displayType === "lesson"
        ? { displayName: "Volkswagen Golf · K-123-NX" }
        : undefined,
    href,
    evaluationHref: input.displayType === "lesson" ? href : undefined,
    travelFromPrevious: input.travelFromPrevious,
    permissions: {
      canOpen: true,
      canEdit: true,
      canCancel: true,
      canStartLesson: input.displayType === "lesson",
      canNavigate: true,
    },
  };
  return {
    id: input.id,
    type: input.displayType,
    title: input.title,
    studentName: input.studentName,
    dateYmd: "2026-08-11",
    dateLabel: "Di 11 aug",
    startsAtIso: input.startsAtIso,
    endsAtIso: input.endsAtIso,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    duration: `${Math.round((Date.parse(input.endsAtIso) - Date.parse(input.startsAtIso)) / 60_000)} min`,
    location: input.location,
    vehicle:
      input.displayType === "lesson" ? "Volkswagen Golf - K-123-NX" : undefined,
    status: input.status ?? "planned",
    href,
    evaluationHref: input.displayType === "lesson" ? href : undefined,
    calendarType: input.calendarType,
    calendarItem,
  };
}

/**
 * Synthetic, non-customer data for authenticated UI screenshots.
 *
 * The fixture is only rendered by the visual-fixture route, whose layout
 * returns a 404 unless VISUAL_FIXTURES_ENABLED=true.
 */
export const instructorVisualFixture: InstructorExperience = {
  profile: {
    name: "Sanne de Vries",
    role: "Instructeur",
    status: "Beschikbaar",
    tenantName: "Rijschool Horizon",
    email: "sanne@example.test",
    phone: "+31 6 12345678",
    ris20Qualified: true,
  },
  stats: [
    {
      label: "Lessen vandaag",
      value: "6",
      hint: "5 bevestigd",
      tone: "blue",
    },
    {
      label: "Proeflessen",
      value: "1",
      hint: "om 13:15",
      tone: "purple",
    },
    {
      label: "Examens",
      value: "1",
      hint: "morgen 09:30",
      tone: "rose",
    },
    {
      label: "Open taken",
      value: "3",
      hint: "1 met prioriteit",
      tone: "green",
    },
  ],
  appointments: [
    fixtureAppointment({
      id: "appointment-early",
      displayType: "admin",
      calendarType: "admin",
      title: "Vroege administratie",
      startsAtIso: "2026-08-11T04:15:00.000Z",
      endsAtIso: "2026-08-11T04:45:00.000Z",
      startsAt: "06:15",
      endsAt: "06:45",
      location: "Rijschoolkantoor",
    }),
    fixtureAppointment({
      id: "appointment-1",
      displayType: "lesson",
      calendarType: "lesson",
      title: "Rijles",
      studentName: "Noah Jansen",
      startsAtIso: "2026-08-11T05:15:00.000Z",
      endsAtIso: "2026-08-11T06:15:00.000Z",
      startsAt: "07:15",
      endsAt: "08:15",
      location: "Stationsplein 12, Utrecht",
      status: "completed",
    }),
    fixtureAppointment({
      id: "appointment-break",
      displayType: "admin",
      calendarType: "break",
      title: "Pauze",
      startsAtIso: "2026-08-11T06:30:00.000Z",
      endsAtIso: "2026-08-11T07:00:00.000Z",
      startsAt: "08:30",
      endsAt: "09:00",
      location: "Rijschoolkantoor",
    }),
    fixtureAppointment({
      id: "appointment-trial",
      displayType: "trial",
      calendarType: "trial",
      title: "Proefles",
      studentName: "Yara Visser",
      startsAtIso: "2026-08-11T07:00:00.000Z",
      endsAtIso: "2026-08-11T08:30:00.000Z",
      startsAt: "09:00",
      endsAt: "10:30",
      location: "NXTDRIVE leslocatie",
    }),
    fixtureAppointment({
      id: "appointment-2",
      displayType: "lesson",
      calendarType: "lesson",
      title: "Rijles",
      studentName: "Mila Bakker",
      startsAtIso: "2026-08-11T09:00:00.000Z",
      endsAtIso: "2026-08-11T10:00:00.000Z",
      startsAt: "11:00",
      endsAt: "12:00",
      location: "Kanaalweg 44, Utrecht",
      status: "confirmed",
      travelFromPrevious: {
        durationMinutes: 17,
        availableMinutes: 30,
        status: "AMPLE",
        asOf: "2026-08-11T08:50:00.000Z",
        method: "GOOGLE_ROUTE",
      },
    }),
    fixtureAppointment({
      id: "appointment-overlap",
      displayType: "admin",
      calendarType: "admin",
      title: "Teamoverleg",
      startsAtIso: "2026-08-11T09:30:00.000Z",
      endsAtIso: "2026-08-11T10:15:00.000Z",
      startsAt: "11:30",
      endsAt: "12:15",
      location: "Rijschoolkantoor",
    }),
    fixtureAppointment({
      id: "appointment-3",
      displayType: "lesson",
      calendarType: "lesson",
      title: "Rijles",
      studentName: "Finn Smit",
      startsAtIso: "2026-08-11T11:30:00.000Z",
      endsAtIso: "2026-08-11T12:30:00.000Z",
      startsAt: "13:30",
      endsAt: "14:30",
      location: "CBR Utrecht",
      status: "confirmed",
      travelFromPrevious: {
        durationMinutes: 24,
        availableMinutes: 10,
        status: "INFEASIBLE",
        asOf: "2026-08-11T11:20:00.000Z",
        method: "GOOGLE_TRAFFIC",
      },
    }),
    fixtureAppointment({
      id: "appointment-exam",
      displayType: "exam",
      calendarType: "exam",
      title: "Praktijkexamen",
      studentName: "Mila Bakker",
      startsAtIso: "2026-08-11T14:00:00.000Z",
      endsAtIso: "2026-08-11T15:00:00.000Z",
      startsAt: "16:00",
      endsAt: "17:00",
      location: "CBR Utrecht",
    }),
    fixtureAppointment({
      id: "appointment-private",
      displayType: "private",
      calendarType: "private_block",
      title: "Privé",
      startsAtIso: "2026-08-11T17:00:00.000Z",
      endsAtIso: "2026-08-11T18:30:00.000Z",
      startsAt: "19:00",
      endsAt: "20:30",
      location: "Privé",
    }),
    fixtureAppointment({
      id: "appointment-late",
      displayType: "admin",
      calendarType: "maintenance",
      title: "Voertuigcontrole",
      startsAtIso: "2026-08-11T20:15:00.000Z",
      endsAtIso: "2026-08-11T20:45:00.000Z",
      startsAt: "22:15",
      endsAt: "22:45",
      location: "Garage",
    }),
  ],
  agendaPeriod: {
    mode: "day",
    selectedDate: "2026-08-11",
    todayYmd: "2026-08-11",
    fromYmd: "2026-08-11",
    toYmd: "2026-08-12",
    label: "Dinsdag 11 augustus 2026",
    previousDate: "2026-08-10",
    nextDate: "2026-08-12",
  },
  agendaTimeZone: "Europe/Amsterdam",
  agendaNowIso: "2026-08-11T11:47:00.000Z",
  students: [
    {
      id: "student-1",
      name: "Noah Jansen",
      license: "Rijbewijs B",
      progress: 68,
      status: "attention",
      nextLesson: "Vandaag, 08:30",
      latestLesson: "27 juli 2026",
      phone: "+31 6 11111111",
      email: "noah@example.test",
      attention: "Extra aandacht voor kijktechniek bij kruispunten.",
      readiness: "6 tot 8 lessen",
      creditMinutes: 720,
    },
    {
      id: "student-2",
      name: "Mila Bakker",
      license: "Rijbewijs B",
      progress: 82,
      status: "exam",
      nextLesson: "Vandaag, 10:15",
      latestLesson: "25 juli 2026",
      phone: "+31 6 22222222",
      email: "mila@example.test",
      attention: "Proefexamen voorbereiden en zelfstandige route oefenen.",
      readiness: "Examenklaar",
      creditMinutes: 360,
    },
    {
      id: "student-3",
      name: "Finn Smit",
      license: "Rijbewijs B",
      progress: 54,
      status: "active",
      nextLesson: "Vandaag, 15:15",
      latestLesson: "24 juli 2026",
      phone: "+31 6 33333333",
      email: null,
      attention: "Doseren en afstand houden op hogere snelheid.",
      readiness: "10 tot 12 lessen",
      creditMinutes: 540,
    },
  ],
  tasks: [
    {
      id: "task-1",
      title: "Leskaart afronden",
      subject: "Noah Jansen",
      due: "Voor 10:15",
      priority: "high",
      status: "today",
    },
    {
      id: "task-2",
      title: "Proefexamen plannen",
      subject: "Mila Bakker",
      due: "Vandaag",
      priority: "medium",
      status: "open",
    },
    {
      id: "task-3",
      title: "Beschikbaarheid augustus",
      subject: "Persoonlijke planning",
      due: "Deze week",
      priority: "low",
      status: "open",
    },
  ],
  messages: [
    {
      id: "thread-1",
      name: "Mila Bakker",
      role: "Leerling",
      preview: "Kunnen we de ophaallocatie aanpassen?",
      time: "08:04",
      unread: 1,
      messages: [
        {
          id: "message-1",
          conversationId: "thread-1",
          senderSide: "student",
          body: "Kunnen we de ophaallocatie aanpassen?",
          createdAt: "2026-07-31T08:04:00.000Z",
        },
      ],
    },
    {
      id: "thread-2",
      name: "Noah Jansen",
      role: "Leerling",
      preview: "Dankjewel, tot straks!",
      time: "gisteren",
      unread: 0,
      messages: [
        {
          id: "message-2",
          conversationId: "thread-2",
          senderSide: "student",
          body: "Dankjewel, tot straks!",
          createdAt: "2026-07-30T16:30:00.000Z",
        },
      ],
    },
  ],
  vehicles: [
    {
      id: "vehicle-1",
      name: "Volkswagen Golf",
      plate: "K-123-NX",
      transmission: "Handgeschakeld",
      status: "active",
      apk: "12 maart 2027",
      mileage: "48.320 km",
      maintenance: "Over 4.800 km",
    },
  ],
  evaluations: [
    {
      id: "evaluation-1",
      studentId: "student-1",
      studentName: "Noah Jansen",
      lessonLabel: "Les 18",
      lessonDate: "29 juli 2026",
      status: "todo",
      mode: "ris",
      modules: [
        {
          id: "module-1",
          name: "Module 2 - Voertuigbediening",
          completed: 3,
          total: 4,
          scripts: [
            {
              id: "script-1",
              index: 1,
              name: "Wegrijden en stoppen",
              score: "8",
              status: "ready",
            },
            {
              id: "script-2",
              index: 2,
              name: "Schakelen en snelheid",
              score: "7",
              status: "ready",
            },
            {
              id: "script-3",
              index: 3,
              name: "Bijzondere verrichtingen",
              score: "6",
              status: "attention",
            },
            {
              id: "script-4",
              index: 4,
              name: "Zelfstandig rijden",
              score: null,
              status: "open",
            },
          ],
        },
      ],
    },
  ],
  availability: [
    {
      day: "Maandag",
      active: true,
      start: "08:00",
      end: "17:30",
      breakLabel: "12:00 - 12:30",
    },
    {
      day: "Dinsdag",
      active: true,
      start: "08:00",
      end: "17:30",
      breakLabel: "12:00 - 12:30",
    },
    {
      day: "Woensdag",
      active: true,
      start: "09:00",
      end: "18:00",
      breakLabel: "12:30 - 13:00",
    },
    {
      day: "Donderdag",
      active: true,
      start: "08:00",
      end: "17:30",
      breakLabel: "12:00 - 12:30",
    },
    {
      day: "Vrijdag",
      active: true,
      start: "08:00",
      end: "16:00",
      breakLabel: "12:00 - 12:30",
    },
    {
      day: "Zaterdag",
      active: false,
      start: "",
      end: "",
      breakLabel: "Niet beschikbaar",
    },
    {
      day: "Zondag",
      active: false,
      start: "",
      end: "",
      breakLabel: "Niet beschikbaar",
    },
  ],
  availabilityToday: {
    availableMinutes: 540,
    bookedMinutes: 420,
    utilizationPct: 78,
    intervalLabel: "08:00 - 17:30",
    sourceLabel: "Weekschema",
  },
  radar: [
    {
      id: "radar-1",
      student: "Noah Jansen",
      reason: "Kijktechniek opnieuw beoordelen",
      priority: "high",
    },
    {
      id: "radar-2",
      student: "Mila Bakker",
      reason: "Proefexamen inplannen",
      priority: "medium",
    },
    {
      id: "radar-3",
      student: "Finn Smit",
      reason: "Lesdoel snelweg bevestigen",
      priority: "low",
    },
  ],
  nextAction: {
    reasonCode: "NEXT_LESSON",
    title: "Les van Noah voorbereiden",
    reason: "Dit is je eerstvolgende geplande afspraak.",
    urgency: "Over 20 min",
    subject: "Noah Jansen",
    time: "08:30 - 10:00",
    href: "/instructeur/lessen/appointment-1",
  },
};

export const instructorAgendaCreateOptionsFixture: InstructorAgendaCreateOptions =
  {
    branches: [{ id: "branch-1", name: "Utrecht Centrum" }],
    ownInstructor: { id: "instructor-1", full_name: "Sanne de Vries" },
    students: [
      { id: "student-1", full_name: "Noah Jansen" },
      { id: "student-2", full_name: "Mila Bakker" },
      { id: "student-3", full_name: "Finn Smit" },
    ],
    vehicles: [
      {
        id: "vehicle-1",
        label: "Volkswagen Golf",
        license_plate: "K-123-NX",
        transmission: "schakel",
        status: "active",
        default_instructor_id: "instructor-1",
      },
    ],
    serviceAreas: [
      { id: "area-1", name: "Utrecht Centrum", branch_id: "branch-1" },
    ],
    defaultLessonDurationMinutes: 60,
    defaultLessonBufferMinutes: 0,
  };

export const instructorAgendaWizardBootstrapFixture: InstructorAgendaWizardBootstrap =
  {
    instructorId: "instructor-1",
    instructorLabel: "Sanne de Vries",
    timeZone: "Europe/Amsterdam",
    defaultBranchId: "branch-1",
    policies: Object.values(PLATFORM_APPOINTMENT_TYPE_POLICIES),
    settings: DEFAULT_APPOINTMENT_WIZARD_SETTINGS,
  };

export const instructorChatVisualFixture: InstructorExperience = {
  ...instructorVisualFixture,
  messages: instructorVisualFixture.messages.map((thread) =>
    thread.id === "thread-1"
      ? {
          ...thread,
          messages: Array.from({ length: 14 }, (_, index) => ({
            id: `chat-layout-message-${index + 1}`,
            conversationId: "thread-1",
            senderSide: index % 2 === 0 ? "student" : "instructor",
            body:
              index % 2 === 0
                ? `Vraag van Mila over lesonderdeel ${index + 1}.`
                : `Antwoord van de instructeur op bericht ${index}.`,
            createdAt: new Date(
              Date.UTC(2026, 6, 31, 8, index * 5),
            ).toISOString(),
          })),
        }
      : thread,
  ),
};
