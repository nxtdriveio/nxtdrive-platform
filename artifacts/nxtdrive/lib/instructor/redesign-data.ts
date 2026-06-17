export type InstructorAppointmentType =
  | "lesson"
  | "trial"
  | "exam"
  | "admin"
  | "theory"
  | "private";

export type InstructorAppointmentStatus =
  | "planned"
  | "confirmed"
  | "completed"
  | "draft";

export type InstructorStudentStatus =
  | "active"
  | "attention"
  | "exam"
  | "new";

export type InstructorEvaluationStatus =
  | "todo"
  | "draft"
  | "published";

export type InstructorTaskPriority = "high" | "medium" | "low";

export type InstructorTaskStatus = "open" | "today" | "done" | "late";

export type InstructorVehicleStatus = "active" | "maintenance" | "unavailable";

export type InstructorAppointment = {
  id: string;
  type: InstructorAppointmentType;
  title: string;
  studentName?: string;
  startsAt: string;
  endsAt: string;
  duration: string;
  location: string;
  vehicle?: string;
  status: InstructorAppointmentStatus;
  href: string;
};

export type InstructorStudent = {
  id: string;
  name: string;
  license: string;
  progress: number;
  status: InstructorStudentStatus;
  nextLesson: string;
  latestLesson: string;
  phone: string;
  email: string;
  attention: string;
  readiness: string;
};

export type InstructorTask = {
  id: string;
  title: string;
  subject: string;
  due: string;
  priority: InstructorTaskPriority;
  status: InstructorTaskStatus;
};

export type InstructorMessageThread = {
  id: string;
  name: string;
  role: string;
  preview: string;
  time: string;
  unread: number;
  messages: Array<{
    id: string;
    sender: "instructor" | "student";
    body: string;
    time: string;
  }>;
};

export type InstructorVehicle = {
  id: string;
  name: string;
  plate: string;
  transmission: string;
  status: InstructorVehicleStatus;
  apk: string;
  mileage: string;
  maintenance: string;
};

export type InstructorRISScript = {
  id: string;
  index: number;
  name: string;
  score: "N" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8";
  status: "ready" | "attention" | "open";
};

export type InstructorRISModule = {
  id: string;
  name: string;
  completed: number;
  total: number;
  scripts: InstructorRISScript[];
};

export type InstructorEvaluation = {
  id: string;
  studentId: string;
  studentName: string;
  lessonLabel: string;
  lessonDate: string;
  status: InstructorEvaluationStatus;
  mode: "ris" | "legacy";
  modules: InstructorRISModule[];
};

export type InstructorAvailabilityDay = {
  day: string;
  active: boolean;
  start: string;
  end: string;
  breakLabel: string;
};

export type InstructorExperience = {
  profile: {
    name: string;
    role: string;
    status: string;
    tenantName: string;
    email?: string | null;
    phone?: string | null;
  };
  stats: Array<{
    label: string;
    value: string;
    hint: string;
    tone: "blue" | "purple" | "rose" | "green";
  }>;
  appointments: InstructorAppointment[];
  students: InstructorStudent[];
  tasks: InstructorTask[];
  messages: InstructorMessageThread[];
  vehicles: InstructorVehicle[];
  evaluations: InstructorEvaluation[];
  availability: InstructorAvailabilityDay[];
  radar: Array<{
    id: string;
    student: string;
    reason: string;
    priority: InstructorTaskPriority;
  }>;
};

const risModules: InstructorRISModule[] = [
  {
    id: "vehicle-control",
    name: "Voertuigbeheersing",
    completed: 2,
    total: 4,
    scripts: [
      { id: "start", index: 1, name: "Starten en wegrijden", score: "6", status: "ready" },
      { id: "shift", index: 2, name: "Schakelen", score: "5", status: "ready" },
      { id: "steer", index: 3, name: "Sturen", score: "4", status: "attention" },
      { id: "turn", index: 4, name: "Keren", score: "N", status: "open" },
    ],
  },
  {
    id: "traffic-insight",
    name: "Verkeersinzicht",
    completed: 3,
    total: 5,
    scripts: [
      { id: "situations", index: 1, name: "Verkeerssituaties herkennen", score: "6", status: "ready" },
      { id: "priority", index: 2, name: "Voorrangssituaties", score: "5", status: "ready" },
      { id: "road-position", index: 3, name: "Plaats op de weg", score: "4", status: "attention" },
    ],
  },
  {
    id: "traffic-actions",
    name: "Verkeershandelen",
    completed: 1,
    total: 4,
    scripts: [
      { id: "roundabouts", index: 1, name: "Rotondes", score: "N", status: "open" },
      { id: "speed", index: 2, name: "Snelheid aanpassen", score: "5", status: "ready" },
      { id: "overtake", index: 3, name: "Inhalen", score: "N", status: "open" },
    ],
  },
];

export const instructorExperience: InstructorExperience = {
  profile: {
    name: "Mark de Vries",
    role: "Instructeur",
    status: "Online",
    tenantName: "NXTDRIVE",
    email: "mark@nxtdrive.nl",
    phone: null,
  },
  stats: [
    { label: "Rijlessen", value: "7", hint: "Vandaag", tone: "blue" },
    { label: "Proeflessen", value: "1", hint: "Vandaag", tone: "purple" },
    { label: "Examens / TTT", value: "1", hint: "Vandaag", tone: "rose" },
    { label: "Open taken", value: "4", hint: "Totaal", tone: "green" },
  ],
  appointments: [
    {
      id: "apt-0800",
      type: "lesson",
      title: "Rijles",
      studentName: "Lucas van Dijk",
      startsAt: "08:00",
      endsAt: "09:30",
      duration: "90 min",
      location: "Utrecht",
      vehicle: "Volkswagen Golf",
      status: "confirmed",
      href: "/instructor/afspraak/apt-0800",
    },
    {
      id: "apt-1000",
      type: "lesson",
      title: "Rijles",
      studentName: "Emma Jansen",
      startsAt: "10:00",
      endsAt: "11:30",
      duration: "90 min",
      location: "Utrecht, Kanaalweg 22",
      vehicle: "Volkswagen Golf",
      status: "planned",
      href: "/instructor/evaluations/lesson-emma",
    },
    {
      id: "apt-1200",
      type: "trial",
      title: "Proefles",
      studentName: "Tom Bakker",
      startsAt: "12:00",
      endsAt: "13:00",
      duration: "60 min",
      location: "Utrecht",
      vehicle: "Volkswagen Polo",
      status: "planned",
      href: "/instructor/intake",
    },
    {
      id: "apt-1330",
      type: "exam",
      title: "TTT",
      studentName: "Sophie Vermeer",
      startsAt: "13:30",
      endsAt: "14:30",
      duration: "60 min",
      location: "CBR Utrecht",
      vehicle: "Volkswagen Golf",
      status: "confirmed",
      href: "/instructor/agenda/apt-1330",
    },
    {
      id: "apt-1500",
      type: "lesson",
      title: "Rijles",
      studentName: "Lotte Willems",
      startsAt: "15:00",
      endsAt: "16:30",
      duration: "90 min",
      location: "Utrecht",
      vehicle: "Toyota Yaris",
      status: "planned",
      href: "/instructor/agenda/apt-1500",
    },
    {
      id: "apt-1630",
      type: "admin",
      title: "Administratie",
      startsAt: "16:30",
      endsAt: "17:30",
      duration: "60 min",
      location: "Eigen tijd",
      status: "planned",
      href: "/instructor/agenda/apt-1630",
    },
  ],
  students: [
    {
      id: "emma-jansen",
      name: "Emma Jansen",
      license: "Rijbewijs B",
      progress: 68,
      status: "active",
      nextLesson: "Vandaag 10:00 - 11:30",
      latestLesson: "22 mei 2025",
      phone: "+31 6 12 34 56 78",
      email: "emma@example.test",
      attention: "Kijktechniek bij kruispunten",
      readiness: "4-6 weken",
    },
    {
      id: "lucas-van-dijk",
      name: "Lucas van Dijk",
      license: "Rijbewijs B",
      progress: 54,
      status: "attention",
      nextLesson: "Morgen 09:00",
      latestLesson: "21 mei 2025",
      phone: "+31 6 23 45 67 89",
      email: "lucas@example.test",
      attention: "Risicoperceptie aandachtspunt",
      readiness: "6-8 weken",
    },
    {
      id: "sophie-vermeer",
      name: "Sophie Vermeer",
      license: "Rijbewijs B",
      progress: 72,
      status: "exam",
      nextLesson: "Vandaag 13:30",
      latestLesson: "20 mei 2025",
      phone: "+31 6 34 56 78 90",
      email: "sophie@example.test",
      attention: "Theorie: toets inplannen",
      readiness: "2-3 weken",
    },
    {
      id: "tom-bakker",
      name: "Tom Bakker",
      license: "Rijbewijs B",
      progress: 31,
      status: "new",
      nextLesson: "Vandaag 12:00",
      latestLesson: "Nieuw dossier",
      phone: "+31 6 45 67 89 01",
      email: "tom@example.test",
      attention: "Proefles intake afronden",
      readiness: "Nog onbekend",
    },
    {
      id: "lotte-willems",
      name: "Lotte Willems",
      license: "Rijbewijs B",
      progress: 46,
      status: "active",
      nextLesson: "Vandaag 15:00",
      latestLesson: "19 mei 2025",
      phone: "+31 6 56 78 90 12",
      email: "lotte@example.test",
      attention: "Voorsorteren in druk verkeer",
      readiness: "8-10 weken",
    },
  ],
  tasks: [
    { id: "task-1", title: "Lesevaluatie afronden", subject: "Emma Jansen", due: "Vandaag", priority: "high", status: "today" },
    { id: "task-2", title: "Voortgangscheck", subject: "Lucas van Dijk", due: "Vandaag", priority: "medium", status: "open" },
    { id: "task-3", title: "Examens plannen", subject: "Sophie Vermeer", due: "Morgen", priority: "medium", status: "open" },
    { id: "task-4", title: "Voertuigcheck uitvoeren", subject: "Volkswagen Golf", due: "Vrijdag", priority: "low", status: "open" },
  ],
  messages: [
    {
      id: "emma",
      name: "Emma Jansen",
      role: "Leerling",
      preview: "Hoi Mark, ik heb een vraag over de les van morgen.",
      time: "10:21",
      unread: 2,
      messages: [
        { id: "m1", sender: "student", body: "Hoi Mark, ik heb een vraag over de les van morgen. Kun je me even bellen?", time: "10:14" },
        { id: "m2", sender: "instructor", body: "Hoi Emma, ik bel je zo even. Tot dan!", time: "10:16" },
      ],
    },
    {
      id: "sophie",
      name: "Sophie Vermeer",
      role: "Leerling",
      preview: "Kan niet eerder dan 13:30.",
      time: "09:08",
      unread: 1,
      messages: [
        { id: "m3", sender: "student", body: "Kan niet eerder dan 13:30 vandaag.", time: "09:08" },
      ],
    },
    {
      id: "team",
      name: "Team NXTDRIVE",
      role: "Rijschool",
      preview: "Roosterwijziging volgende week.",
      time: "Gisteren",
      unread: 0,
      messages: [
        { id: "m4", sender: "student", body: "Roosterwijziging voor volgende week is verwerkt.", time: "Gisteren" },
      ],
    },
  ],
  vehicles: [
    {
      id: "golf",
      name: "Volkswagen Golf",
      plate: "N-285-DF",
      transmission: "Handgeschakeld",
      status: "active",
      apk: "12-06-2025",
      mileage: "84.240 km",
      maintenance: "18-04-2025",
    },
    {
      id: "polo",
      name: "Volkswagen Polo",
      plate: "KO-154-G",
      transmission: "Handgeschakeld",
      status: "active",
      apk: "04-11-2025",
      mileage: "61.440 km",
      maintenance: "08-03-2025",
    },
    {
      id: "yaris",
      name: "Toyota Yaris",
      plate: "P-456-CO",
      transmission: "Automaat",
      status: "maintenance",
      apk: "22-09-2025",
      mileage: "92.180 km",
      maintenance: "Gepland",
    },
  ],
  evaluations: [
    {
      id: "lesson-emma",
      studentId: "emma-jansen",
      studentName: "Emma Jansen",
      lessonLabel: "Rijles - 90 minuten",
      lessonDate: "Vandaag 10:00 - 11:30",
      status: "draft",
      mode: "ris",
      modules: risModules,
    },
    {
      id: "lesson-lucas",
      studentId: "lucas-van-dijk",
      studentName: "Lucas van Dijk",
      lessonLabel: "Rijles - 90 minuten",
      lessonDate: "22 mei 2025",
      status: "todo",
      mode: "ris",
      modules: risModules,
    },
    {
      id: "lesson-sophie",
      studentId: "sophie-vermeer",
      studentName: "Sophie Vermeer",
      lessonLabel: "TTT voorbereiding",
      lessonDate: "20 mei 2025",
      status: "published",
      mode: "ris",
      modules: risModules,
    },
  ],
  availability: [
    { day: "Maandag", active: true, start: "08:00", end: "18:00", breakLabel: "12:30 - 13:00" },
    { day: "Dinsdag", active: true, start: "08:00", end: "18:00", breakLabel: "12:30 - 13:00" },
    { day: "Woensdag", active: true, start: "09:00", end: "17:00", breakLabel: "12:30 - 13:00" },
    { day: "Donderdag", active: true, start: "08:00", end: "18:00", breakLabel: "12:30 - 13:00" },
    { day: "Vrijdag", active: true, start: "08:00", end: "16:30", breakLabel: "12:30 - 13:00" },
    { day: "Zaterdag", active: false, start: "-", end: "-", breakLabel: "Niet beschikbaar" },
  ],
  radar: [
    { id: "radar-1", student: "Lucas van Dijk", reason: "Risicoperceptie aandachtspunt", priority: "high" },
    { id: "radar-2", student: "Sophie Vermeer", reason: "Theorie: toets inplannen", priority: "medium" },
    { id: "radar-3", student: "Tom Bakker", reason: "Voortgang stagneert", priority: "medium" },
  ],
};

export function getInstructorExperience(): InstructorExperience {
  return instructorExperience;
}

export function getInstructorStudent(studentId?: string): InstructorStudent {
  return (
    instructorExperience.students.find((student) => student.id === studentId) ??
    instructorExperience.students[0]!
  );
}

export function getInstructorEvaluation(lessonId?: string): InstructorEvaluation {
  return (
    instructorExperience.evaluations.find((evaluation) => evaluation.id === lessonId) ??
    instructorExperience.evaluations[0]!
  );
}

export function getInstructorMessageThread(threadId?: string): InstructorMessageThread {
  return (
    instructorExperience.messages.find((thread) => thread.id === threadId) ??
    instructorExperience.messages[0]!
  );
}

export function getInstructorAppointment(appointmentId?: string): InstructorAppointment {
  return (
    instructorExperience.appointments.find((appointment) => appointment.id === appointmentId) ??
    instructorExperience.appointments[1]!
  );
}
