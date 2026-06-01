// Leskaart L0 — typed contract for the hierarchical skill taxonomy and the
// 1..10 per-skill score model. Pure types + tree helpers, no IO. Readiness
// logic lives in ./readiness.ts (L1).

export type SkillLevel = 1 | 2 | 3;

export type SkillTaxonomyNode = {
  id: string;
  tenant_id: string;
  parent_id: string | null;
  level: SkillLevel;
  code: string;
  label: string;
  sort_order: number;
  is_critical: boolean;
  theory_link: string | null;
  active: boolean;
  version: number;
  created_at: string;
  updated_at: string;
};

export type LessonSkillScoreRow = {
  lesson_id: string;
  tenant_id: string;
  student_id: string;
  skill_id: string;
  score: number;
  scored_by: string | null;
  created_at: string;
  updated_at: string;
};

export type StudentSkillScoreRow = {
  student_id: string;
  tenant_id: string;
  skill_id: string;
  score: number;
  last_lesson_id: string | null;
  scored_at: string;
  scored_by: string | null;
  updated_at: string;
};

export type SkillTreeNode = SkillTaxonomyNode & {
  children: SkillTreeNode[];
};

/**
 * Build the hoofdcategorie -> subcategorie -> vaardigheid tree from a flat list
 * of taxonomy rows. Children are ordered by (sort_order, label). Rows whose
 * parent is missing from the input are treated as roots so nothing is dropped.
 */
export function buildSkillTree(nodes: SkillTaxonomyNode[]): SkillTreeNode[] {
  const byId = new Map<string, SkillTreeNode>();
  for (const n of nodes) {
    byId.set(n.id, { ...n, children: [] });
  }

  const roots: SkillTreeNode[] = [];
  for (const node of byId.values()) {
    const parent = node.parent_id ? byId.get(node.parent_id) : undefined;
    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const sort = (a: SkillTreeNode, b: SkillTreeNode) =>
    a.sort_order - b.sort_order || a.label.localeCompare(b.label);

  const sortRec = (list: SkillTreeNode[]) => {
    list.sort(sort);
    for (const n of list) sortRec(n.children);
  };
  sortRec(roots);

  return roots;
}

/** Flatten the gradable leaves (level 3, active) from a taxonomy list. */
export function leafSkills(nodes: SkillTaxonomyNode[]): SkillTaxonomyNode[] {
  return nodes.filter((n) => n.level === 3 && n.active);
}
