"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TaskLinkType, TenantMember } from "@/lib/tasks/types";
import type { LaunchBoard } from "@/lib/tasks/launch-data";
import { TaskDialog } from "./task-dialog";

/**
 * "Taak aanmaken" launcher for entity detail pages. Opens the card form
 * pre-filled with a link to the originating entity and a board picker (entity
 * pages have no board context). Renders nothing when the tenant has no boards.
 */
export function CreateTaskFromEntityButton({
  entityType,
  entityId,
  entityLabel,
  boards,
  members,
  label = "Taak aanmaken",
}: {
  entityType: TaskLinkType;
  entityId: string;
  entityLabel: string;
  boards: LaunchBoard[];
  members: TenantMember[];
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  if (boards.length === 0) return null;

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
      >
        <Plus className="mr-1.5 h-4 w-4" aria-hidden />
        {label}
      </Button>
      {open ? (
        <TaskDialog
          boardId={boards[0]!.id}
          members={members}
          mode="create"
          boards={boards}
          initialLink={{
            entity_type: entityType,
            entity_id: entityId,
            label: entityLabel,
          }}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}
