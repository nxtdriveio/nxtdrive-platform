import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { createTenant } from "./actions";

type TenantOption = {
  id: string;
  name: string;
  slug: string;
  org_type?: string | null;
};

const ORG_TYPE_OPTIONS = [
  { value: "zzp", label: "ZZP instructeur" },
  { value: "rijschool", label: "Rijschool" },
  { value: "groot", label: "Grote rijschool" },
  { value: "multi_vestiging", label: "Multi-vestiging" },
  { value: "franchise", label: "Franchisegever" },
];

export function NewTenantForm({ tenants }: { tenants: TenantOption[] }) {
  return (
    <div className="max-w-4xl">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            Nieuwe organisatie
            <Badge variant="outline" className="text-xs">
              tenant-backed
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form action={createTenant} className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor="name" className="text-sm font-medium text-foreground">
                  Handelsnaam <span className="text-red-400">*</span>
                </label>
                <Input id="name" name="name" placeholder="Rijschool De Wit" required />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="legal_name" className="text-sm font-medium text-foreground">
                  Juridische naam
                </label>
                <Input id="legal_name" name="legal_name" placeholder="De Wit Rijopleidingen B.V." />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-1.5">
                <label htmlFor="slug" className="text-sm font-medium text-foreground">
                  Slug <span className="text-red-400">*</span>
                </label>
                <Input
                  id="slug"
                  name="slug"
                  placeholder="de-wit"
                  pattern="[a-z0-9-]+"
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Wordt <span className="font-mono">slug.nxtdrive.io</span>.
                </p>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="org_type" className="text-sm font-medium text-foreground">
                  Organisatietype
                </label>
                <Select id="org_type" name="org_type" defaultValue="rijschool">
                  {ORG_TYPE_OPTIONS.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="plan" className="text-sm font-medium text-foreground">
                  Plan
                </label>
                <Select id="plan" name="plan" defaultValue="start">
                  <option value="start">Start - EUR 49/mnd</option>
                  <option value="pro">Pro - EUR 99/mnd</option>
                  <option value="elite">Elite - EUR 199/mnd</option>
                </Select>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor="billing_email" className="text-sm font-medium text-foreground">
                  Billing e-mail
                </label>
                <Input id="billing_email" name="billing_email" type="email" placeholder="facturen@rijschool.nl" />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="support_email" className="text-sm font-medium text-foreground">
                  Support e-mail
                </label>
                <Input id="support_email" name="support_email" type="email" placeholder="info@rijschool.nl" />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-1.5">
                <label htmlFor="kvk_number" className="text-sm font-medium text-foreground">
                  KvK
                </label>
                <Input id="kvk_number" name="kvk_number" placeholder="12345678" />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="vat_number" className="text-sm font-medium text-foreground">
                  BTW-nummer
                </label>
                <Input id="vat_number" name="vat_number" placeholder="NL123456789B01" />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="owner_email" className="text-sm font-medium text-foreground">
                  Eigenaar e-mail
                </label>
                <Input id="owner_email" name="owner_email" type="email" placeholder="bestaande gebruiker" />
                <p className="text-xs text-muted-foreground">
                  Optioneel. Moet al bestaan als auth user.
                </p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-1.5">
                <label htmlFor="lifecycle_status" className="text-sm font-medium text-foreground">
                  Lifecycle
                </label>
                <Select id="lifecycle_status" name="lifecycle_status" defaultValue="onboarding">
                  <option value="prospect">Prospect</option>
                  <option value="onboarding">Onboarding</option>
                  <option value="active">Actief</option>
                  <option value="paused">Gepauzeerd</option>
                  <option value="churned">Churned</option>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="onboarding_status" className="text-sm font-medium text-foreground">
                  Onboarding
                </label>
                <Select id="onboarding_status" name="onboarding_status" defaultValue="not_started">
                  <option value="not_started">Niet gestart</option>
                  <option value="in_progress">Bezig</option>
                  <option value="ready">Klaar</option>
                  <option value="blocked">Geblokkeerd</option>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="franchisegever_tenant_id" className="text-sm font-medium text-foreground">
                  Franchisegever
                </label>
                <Select id="franchisegever_tenant_id" name="franchisegever_tenant_id" defaultValue="">
                  <option value="">Geen franchise-parent</option>
                  {tenants.map((tenant) => (
                    <option key={tenant.id} value={tenant.id}>
                      {tenant.name} ({tenant.slug})
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            <Button type="submit" className="w-full md:w-auto">
              Organisatie aanmaken
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
