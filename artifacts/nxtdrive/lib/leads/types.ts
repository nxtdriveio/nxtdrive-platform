export const LEAD_STATUSES = [
  "new",
  "contacted",
  "package_advised",
  "converted",
  "dropped",
] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const LEAD_SOURCES = [
  "website",
  "google",
  "instagram",
  "facebook",
  "whatsapp",
  "referral",
  "other",
] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

export const LEAD_EVENT_TYPES = [
  "created",
  "status_changed",
  "assigned",
  "note",
  "contacted",
] as const;
export type LeadEventType = (typeof LEAD_EVENT_TYPES)[number];

export const LEAD_STATUS_LABEL: Record<LeadStatus, string> = {
  new: "Nieuw",
  contacted: "Contact opgenomen",
  package_advised: "Pakketadvies",
  converted: "Klant geworden",
  dropped: "Afgehaakt",
};

export const LEAD_SOURCE_LABEL: Record<LeadSource, string> = {
  website: "Website",
  google: "Google",
  instagram: "Instagram",
  facebook: "Facebook",
  whatsapp: "WhatsApp",
  referral: "Referral",
  other: "Overig",
};

export const LEAD_EVENT_LABEL: Record<LeadEventType, string> = {
  created: "Aangemaakt",
  status_changed: "Status gewijzigd",
  assigned: "Toegewezen",
  note: "Notitie",
  contacted: "Contact gehad",
};

export const LEAD_STATUS_VARIANT: Record<
  LeadStatus,
  "info" | "warning" | "primary" | "success" | "danger"
> = {
  new: "info",
  contacted: "warning",
  package_advised: "primary",
  converted: "success",
  dropped: "danger",
};

export type Lead = {
  id: string;
  tenant_id: string;
  status: LeadStatus;
  source: LeadSource;
  full_name: string;
  email: string | null;
  phone: string | null;
  postcode: string | null;
  message: string | null;
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
};

export type LeadEvent = {
  id: string;
  lead_id: string;
  tenant_id: string;
  actor_user_id: string | null;
  event_type: LeadEventType;
  payload: Record<string, unknown>;
  created_at: string;
};
