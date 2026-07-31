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

export type InstructorStudentStatus = "active" | "attention" | "exam" | "new";

export type InstructorEvaluationStatus = "todo" | "draft" | "published";

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
  phone: string | null;
  email: string | null;
  conversationId?: string | null;
  attention: string;
  readiness: string;
  creditMinutes: number;
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
  score: "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | null;
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
  date?: string;
  sourceLabel?: string;
  availableMinutes?: number;
  intervals?: string[];
};

export type InstructorAvailabilityToday = {
  availableMinutes: number;
  bookedMinutes: number;
  utilizationPct: number;
  intervalLabel: string;
  sourceLabel: string;
};

export type InstructorExperience = {
  profile: {
    name: string;
    role: string;
    status: string;
    tenantName: string;
    email?: string | null;
    phone?: string | null;
    ris20Qualified: boolean;
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
  availabilityToday: InstructorAvailabilityToday;
  radar: Array<{
    id: string;
    student: string;
    reason: string;
    priority: InstructorTaskPriority;
  }>;
  nextAction: import("./next-action").InstructorNextAction;
};
