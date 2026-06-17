export type StudentLessonStatus =
  | "planned"
  | "completed"
  | "cancelled"
  | "pending";

export type StudentJourneyStatus = "done" | "active" | "todo";

export type StudentInvoiceStatus = "paid" | "open" | "overdue";

export type StudentCBRStatus =
  | "in_progress"
  | "passed"
  | "approved"
  | "not_planned"
  | "planned"
  | "action_needed";

export type StudentNotificationKind =
  | "lesson"
  | "feedback"
  | "payment"
  | "theory"
  | "message";

export type StudentDocumentCategory =
  | "Facturen"
  | "Lesoverzicht"
  | "CBR"
  | "Overig";

export type StudentProfileSummary = {
  id: string;
  name: string;
  firstName: string;
  tenantName: string;
  roleLabel: string;
  email?: string | null;
  phone?: string | null;
};

export type StudentNextStep = {
  title: string;
  body: string;
  ctaLabel: string;
  href: string;
  progressLabel: string;
  progressCurrent: number;
  progressTotal: number;
};

export type StudentQuickAction = {
  label: string;
  href: string;
  description: string;
  iconName:
    | "calendar"
    | "route"
    | "wallet"
    | "badge"
    | "book"
    | "message";
};

export type StudentLesson = {
  id: string;
  title: string;
  dateLabel: string;
  timeLabel: string;
  location: string;
  instructor: string;
  vehicle: string;
  lessonType: string;
  status: StudentLessonStatus;
  href: string;
  preparation: string[];
  publishedReflection?: {
    summary: string;
    feedback: string;
    nextFocus: string;
  };
};

export type StudentJourneyModule = {
  id: string;
  title: string;
  description: string;
  progress: number;
  status: StudentJourneyStatus;
};

export type StudentJourneyPoint = {
  label: string;
  module1: number;
  module2: number;
  module3: number;
  module4: number;
  module5: number;
};

export type StudentRISReflection = {
  title: string;
  lessonLabel: string;
  publishedAt: string;
  whatWentWell: string;
  workingOn: string;
  nextFocus: string;
};

export type StudentTheoryProgress = {
  progress: number;
  statusCopy: string;
  homework: Array<{
    id: string;
    title: string;
    countLabel: string;
    status: "open" | "active" | "done" | "available";
  }>;
  tests: Array<{
    id: string;
    title: string;
    meta: string;
    status: "open" | "active" | "done" | "available";
  }>;
};

export type StudentPaymentBalance = {
  creditCents: number;
  creditLabel: string;
  hoursAvailable: string;
  warning: string;
};

export type StudentInvoice = {
  id: string;
  invoiceNumber: string;
  dateLabel: string;
  amountLabel: string;
  status: StudentInvoiceStatus;
  href: string;
};

export type StudentCBRStatusItem = {
  id: string;
  title: string;
  status: StudentCBRStatus;
  explanation: string;
};

export type StudentMessage = {
  id: string;
  sender: "student" | "school";
  senderName: string;
  body: string;
  timeLabel: string;
};

export type StudentMessageThread = {
  id: string;
  name: string;
  role: "Rijschool" | "Instructeur" | "Planning" | "Administratie";
  latestMessage: string;
  timeLabel: string;
  unreadCount: number;
  href: string;
  messages: StudentMessage[];
};

export type StudentNotification = {
  id: string;
  kind: StudentNotificationKind;
  title: string;
  body: string;
  timeLabel: string;
  unread: boolean;
  href: string;
};

export type StudentDocument = {
  id: string;
  title: string;
  category: StudentDocumentCategory;
  dateLabel: string;
  status: "Klaar" | "Nieuw" | "Verwerkt";
  href: string;
};

export type StudentActivityItem = {
  id: string;
  title: string;
  body: string;
  timeLabel: string;
};

export type StudentExperience = {
  profile: StudentProfileSummary;
  nextStep: StudentNextStep;
  quickActions: StudentQuickAction[];
  nextLesson: StudentLesson;
  previousLessons: StudentLesson[];
  journeyModules: StudentJourneyModule[];
  journeyTrend: StudentJourneyPoint[];
  ris: {
    active: boolean;
    modules: StudentJourneyModule[];
    reflection: StudentRISReflection | null;
  };
  theory: StudentTheoryProgress;
  payments: {
    balance: StudentPaymentBalance;
    invoices: StudentInvoice[];
    history: Array<{ id: string; title: string; dateLabel: string; amountLabel: string }>;
  };
  cbr: {
    readiness: number;
    readinessCopy: string;
    statuses: StudentCBRStatusItem[];
  };
  messages: StudentMessageThread[];
  notifications: StudentNotification[];
  documents: StudentDocument[];
  activity: StudentActivityItem[];
};
