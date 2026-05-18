export type CbrCompetency = {
  id: string;
  tenant_id: string;
  code: string;
  label: string;
  sort_order: number;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type StudentCbrProgressRow = {
  student_id: string;
  tenant_id: string;
  competency_id: string;
  achieved_at: string;
  achieved_by: string | null;
  updated_at: string;
};

export type CbrChecklistItem = {
  competency: CbrCompetency;
  achieved: boolean;
  achieved_at: string | null;
};

export function buildChecklist(
  competencies: CbrCompetency[],
  progress: StudentCbrProgressRow[],
): CbrChecklistItem[] {
  const progressById = new Map(progress.map((p) => [p.competency_id, p]));
  return competencies
    .filter((c) => c.active)
    .map((c) => {
      const row = progressById.get(c.id) ?? null;
      return {
        competency: c,
        achieved: row != null,
        achieved_at: row?.achieved_at ?? null,
      };
    });
}

export function readinessPct(items: CbrChecklistItem[]): number {
  if (items.length === 0) return 0;
  const done = items.filter((i) => i.achieved).length;
  return Math.round((done / items.length) * 100);
}
