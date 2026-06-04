"use client";

import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import type { Branch } from "@/lib/branches/service";

type BranchFormProps = {
  action: (formData: FormData) => Promise<void>;
  branch?: Branch | null;
};

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export function BranchForm({ action, branch }: BranchFormProps) {
  const isEdit = !!branch;

  return (
    <form action={action} className="space-y-4">
      {isEdit ? (
        <input type="hidden" name="branch_id" value={branch!.id} />
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="name">
            Naam <span className="text-destructive">*</span>
          </Label>
          <Input
            id="name"
            name="name"
            type="text"
            placeholder="Hoofdkantoor"
            defaultValue={branch?.name ?? ""}
            required
            autoComplete="off"
          />
        </div>

        {!isEdit ? (
          <div className="space-y-1.5">
            <Label htmlFor="slug">
              Slug <span className="text-destructive">*</span>
            </Label>
            <Input
              id="slug"
              name="slug"
              type="text"
              placeholder="hoofdkantoor"
              required
              autoComplete="off"
              pattern="^[a-z0-9][a-z0-9-]*[a-z0-9]$"
              title="Alleen kleine letters, cijfers en koppeltekens; minimaal 2 tekens"
            />
            <p className="text-[11px] text-muted-foreground">
              Mag alleen kleine letters, cijfers en koppeltekens bevatten.
              Kan niet meer worden gewijzigd.
            </p>
          </div>
        ) : null}

        <div className="space-y-1.5">
          <Label htmlFor="address">Adres</Label>
          <Input
            id="address"
            name="address"
            type="text"
            placeholder="Hoofdstraat 1"
            defaultValue={branch?.address ?? ""}
            autoComplete="off"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="city">Stad</Label>
          <Input
            id="city"
            name="city"
            type="text"
            placeholder="Den Haag"
            defaultValue={branch?.city ?? ""}
            autoComplete="off"
          />
        </div>
      </div>

      {isEdit ? (
        <div className="space-y-1.5">
          <Label htmlFor="is_active">Status</Label>
          <select
            id="is_active"
            name="is_active"
            defaultValue={branch!.is_active ? "true" : "false"}
            className="flex h-9 w-full max-w-[200px] rounded-md border border-input bg-background px-3 py-1 text-sm text-foreground shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value="true">Actief</option>
            <option value="false">Inactief</option>
          </select>
        </div>
      ) : null}

      <div className="flex gap-2">
        <Button type="submit" size="sm">
          {isEdit ? "Wijzigingen opslaan" : "Vestiging aanmaken"}
        </Button>
        {isEdit ? (
          <a
            href="/backoffice/instellingen/vestigingen"
            className="inline-flex h-8 items-center justify-center rounded-md border border-input bg-background px-3 text-sm text-muted-foreground shadow-sm transition-colors hover:bg-muted hover:text-foreground"
          >
            Annuleren
          </a>
        ) : null}
      </div>
    </form>
  );
}
