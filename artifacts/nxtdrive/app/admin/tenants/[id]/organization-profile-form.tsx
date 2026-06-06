import type { OrganizationProfile } from "@/lib/organization";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { updateOrganizationProfileAction } from "./actions";

const ORG_TYPE_OPTIONS = [
  { value: "zzp", label: "ZZP instructeur" },
  { value: "rijschool", label: "Rijschool" },
  { value: "groot", label: "Grote rijschool" },
  { value: "multi_vestiging", label: "Multi-vestiging" },
  { value: "franchise", label: "Franchise" },
];

const LIFECYCLE_OPTIONS = [
  { value: "prospect", label: "Prospect" },
  { value: "onboarding", label: "Onboarding" },
  { value: "active", label: "Actief" },
  { value: "paused", label: "Gepauzeerd" },
  { value: "churned", label: "Gestopt" },
];

const ONBOARDING_OPTIONS = [
  { value: "not_started", label: "Niet gestart" },
  { value: "in_progress", label: "In uitvoering" },
  { value: "ready", label: "Klaar" },
  { value: "blocked", label: "Geblokkeerd" },
];

type OrganizationProfileFormProps = {
  tenantId: string;
  tenantOrgType: string | null;
  profile: OrganizationProfile | null;
  ownerEmail: string;
};

export function OrganizationProfileForm({
  tenantId,
  tenantOrgType,
  profile,
  ownerEmail,
}: OrganizationProfileFormProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Organisatieprofiel</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={updateOrganizationProfileAction} className="space-y-4">
          <input type="hidden" name="tenant_id" value={tenantId} />

          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground" htmlFor="org_type">
                Organisatietype
              </label>
              <select
                id="org_type"
                name="org_type"
                defaultValue={tenantOrgType ?? "rijschool"}
                className="w-full rounded-md border border-border bg-background px-2 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {ORG_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground" htmlFor="lifecycle_status">
                Lifecycle
              </label>
              <select
                id="lifecycle_status"
                name="lifecycle_status"
                defaultValue={profile?.lifecycle_status ?? "onboarding"}
                className="w-full rounded-md border border-border bg-background px-2 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {LIFECYCLE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground" htmlFor="onboarding_status">
                Onboarding
              </label>
              <select
                id="onboarding_status"
                name="onboarding_status"
                defaultValue={profile?.onboarding_status ?? "not_started"}
                className="w-full rounded-md border border-border bg-background px-2 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {ONBOARDING_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground" htmlFor="legal_name">
                Juridische naam
              </label>
              <Input
                id="legal_name"
                name="legal_name"
                defaultValue={profile?.legal_name ?? ""}
                placeholder="Rijschool B.V."
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground" htmlFor="billing_email">
                Facturatie e-mail
              </label>
              <Input
                id="billing_email"
                name="billing_email"
                type="email"
                defaultValue={profile?.billing_email ?? ""}
                placeholder="facturen@rijschool.nl"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground" htmlFor="support_email">
                Support e-mail
              </label>
              <Input
                id="support_email"
                name="support_email"
                type="email"
                defaultValue={profile?.support_email ?? ""}
                placeholder="info@rijschool.nl"
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground" htmlFor="kvk_number">
                KvK nummer
              </label>
              <Input
                id="kvk_number"
                name="kvk_number"
                defaultValue={profile?.kvk_number ?? ""}
                placeholder="12345678"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground" htmlFor="vat_number">
                BTW nummer
              </label>
              <Input
                id="vat_number"
                name="vat_number"
                defaultValue={profile?.vat_number ?? ""}
                placeholder="NL123456789B01"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground" htmlFor="owner_email">
                Eigenaar e-mail
              </label>
              <Input
                id="owner_email"
                name="owner_email"
                type="email"
                defaultValue={ownerEmail}
                placeholder="eigenaar@rijschool.nl"
              />
              <p className="text-xs text-muted-foreground">
                Optioneel. Het account moet al bestaan in Supabase Auth.
              </p>
            </div>
          </div>

          <Button type="submit" variant="primary">
            Organisatieprofiel opslaan
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
