import { requireOrganizationPermission } from "@/lib/organization";
import { loadTenantInstructors } from "@/lib/availability/service";
import { loadVehicles } from "@/lib/lessons/context-data";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  saveCapabilityDefinition,
  setInstructorCapability,
  setStudentRequirement,
  setVehicleCapability,
} from "./actions";

export const dynamic = "force-dynamic";

type CapabilityDefinition = {
  id: string;
  key: string;
  label: string;
  category: string;
  applies_to: "instructor" | "vehicle" | "student" | "appointment" | "queue_item";
  match_behavior: "required" | "preferred" | "informational";
  active: boolean;
};

type StudentOption = {
  id: string;
  full_name: string;
  branch_id: string | null;
  active: boolean;
};

type CapabilityLink = {
  instructor_id?: string;
  vehicle_id?: string;
  student_id?: string;
  capability_id: string;
  requirement_type?: "required" | "preferred";
};

const CATEGORY_LABEL: Record<string, string> = {
  transmission: "Transmissie",
  specialty: "Specialisme",
  language: "Taal",
  lesson_type: "Lessoort",
  certification: "Certificaat",
  custom: "Vrij",
};

const APPLIES_TO_LABEL: Record<string, string> = {
  instructor: "Instructeur",
  vehicle: "Voertuig",
  student: "Leerling",
  appointment: "Afspraak",
  queue_item: "Wachtrij",
};

const MATCH_LABEL: Record<string, string> = {
  required: "Verplicht",
  preferred: "Voorkeur",
  informational: "Info",
};

function activeCapabilities(
  capabilities: readonly CapabilityDefinition[],
  appliesTo: CapabilityDefinition["applies_to"],
) {
  return capabilities.filter(
    (capability) => capability.active && capability.applies_to === appliesTo,
  );
}

function hasLink(
  rows: readonly CapabilityLink[],
  entityKey: "instructor_id" | "vehicle_id" | "student_id",
  entityId: string,
  capabilityId: string,
  type?: "required" | "preferred",
) {
  return rows.some(
    (row) =>
      row[entityKey] === entityId &&
      row.capability_id === capabilityId &&
      (!type || row.requirement_type === type),
  );
}

export default async function EigenschappenPage() {
  const context = await requireOrganizationPermission("settings:manage");
  const { organization: tenant } = context;
  const service = createServiceRoleClient();

  const [
    capabilityRes,
    instructors,
    vehicles,
    studentsRes,
    instructorCapabilitiesRes,
    vehicleCapabilitiesRes,
    studentRequirementsRes,
  ] = await Promise.all([
    service
      .from("capability_definitions")
      .select("id, key, label, category, applies_to, match_behavior, active")
      .eq("tenant_id", tenant.id)
      .order("applies_to", { ascending: true })
      .order("label", { ascending: true }),
    loadTenantInstructors(tenant.id),
    loadVehicles(service, tenant.id, { includeShared: true }),
    service
      .from("students")
      .select("id, full_name, branch_id, active")
      .eq("tenant_id", tenant.id)
      .order("full_name", { ascending: true })
      .limit(100),
    service
      .from("instructor_capabilities")
      .select("instructor_id, capability_id")
      .eq("tenant_id", tenant.id),
    service
      .from("vehicle_capabilities")
      .select("vehicle_id, capability_id")
      .eq("tenant_id", tenant.id),
    service
      .from("student_requirements")
      .select("student_id, capability_id, requirement_type")
      .eq("tenant_id", tenant.id),
  ]);

  if (capabilityRes.error)
    throw new Error(`Eigenschappen laden mislukt: ${capabilityRes.error.message}`);
  if (studentsRes.error)
    throw new Error(`Leerlingen laden mislukt: ${studentsRes.error.message}`);
  if (instructorCapabilitiesRes.error)
    throw new Error(
      `Instructeur-eigenschappen laden mislukt: ${instructorCapabilitiesRes.error.message}`,
    );
  if (vehicleCapabilitiesRes.error)
    throw new Error(
      `Voertuig-eigenschappen laden mislukt: ${vehicleCapabilitiesRes.error.message}`,
    );
  if (studentRequirementsRes.error)
    throw new Error(
      `Leerling-eisen laden mislukt: ${studentRequirementsRes.error.message}`,
    );

  const capabilities = (capabilityRes.data ?? []) as CapabilityDefinition[];
  const students = (studentsRes.data ?? []) as StudentOption[];
  const instructorCapabilities =
    (instructorCapabilitiesRes.data ?? []) as CapabilityLink[];
  const vehicleCapabilities = (vehicleCapabilitiesRes.data ?? []) as CapabilityLink[];
  const studentRequirements =
    (studentRequirementsRes.data ?? []) as CapabilityLink[];
  const instructorDefs = activeCapabilities(capabilities, "instructor");
  const vehicleDefs = activeCapabilities(capabilities, "vehicle");
  const studentDefs = activeCapabilities(capabilities, "student");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Planningeigenschappen
        </h1>
        <p className="text-sm text-muted-foreground">
          Beheer dynamische eigenschappen voor instructeurs, voertuigen en leerlingen.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Card>
          <CardHeader>
            <CardTitle>Definities</CardTitle>
          </CardHeader>
          <CardContent>
            {capabilities.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nog geen eigenschappen ingericht.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="py-2 pr-3">Label</th>
                      <th className="py-2 pr-3">Key</th>
                      <th className="py-2 pr-3">Voor</th>
                      <th className="py-2 pr-3">Gedrag</th>
                      <th className="py-2 pr-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {capabilities.map((capability) => (
                      <tr key={capability.id}>
                        <td className="py-3 pr-3 font-medium text-foreground">
                          {capability.label}
                        </td>
                        <td className="py-3 pr-3 text-muted-foreground">
                          {capability.key}
                        </td>
                        <td className="py-3 pr-3">
                          {APPLIES_TO_LABEL[capability.applies_to] ??
                            capability.applies_to}
                        </td>
                        <td className="py-3 pr-3">
                          <Badge variant="outline">
                            {MATCH_LABEL[capability.match_behavior] ??
                              capability.match_behavior}
                          </Badge>
                        </td>
                        <td className="py-3 pr-3">
                          <Badge variant={capability.active ? "success" : "outline"}>
                            {capability.active ? "Actief" : "Inactief"}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Nieuwe eigenschap</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={saveCapabilityDefinition} className="space-y-3">
              <div className="space-y-1.5">
                <Label>Label</Label>
                <Input name="label" required placeholder="bv. Engels" />
              </div>
              <div className="space-y-1.5">
                <Label>Key</Label>
                <Input name="key" required placeholder="engels" />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-1">
                <div className="space-y-1.5">
                  <Label>Categorie</Label>
                  <Select name="category" defaultValue="custom">
                    {Object.entries(CATEGORY_LABEL).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Voor</Label>
                  <Select name="applies_to" defaultValue="instructor">
                    <option value="instructor">Instructeur</option>
                    <option value="vehicle">Voertuig</option>
                    <option value="student">Leerling</option>
                    <option value="appointment">Afspraak</option>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Matchgedrag</Label>
                <Select name="match_behavior" defaultValue="preferred">
                  <option value="required">Verplicht</option>
                  <option value="preferred">Voorkeur</option>
                  <option value="informational">Info</option>
                </Select>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="active" defaultChecked />
                Actief
              </label>
              <Button type="submit" size="sm" className="w-full">
                Eigenschap aanmaken
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <AssignmentCard
          title="Instructeurs"
          emptyLabel="Geen instructeur-eigenschappen actief."
          rows={instructors.map((instructor) => ({
            id: instructor.id,
            label: instructor.full_name,
          }))}
          capabilities={instructorDefs}
          isEnabled={(rowId, capabilityId) =>
            hasLink(instructorCapabilities, "instructor_id", rowId, capabilityId)
          }
          action={setInstructorCapability}
          entityField="instructor_id"
        />
        <AssignmentCard
          title="Voertuigen"
          emptyLabel="Geen voertuig-eigenschappen actief."
          rows={vehicles.map((vehicle) => ({
            id: vehicle.id,
            label: vehicle.license_plate ?? vehicle.label,
          }))}
          capabilities={vehicleDefs}
          isEnabled={(rowId, capabilityId) =>
            hasLink(vehicleCapabilities, "vehicle_id", rowId, capabilityId)
          }
          action={setVehicleCapability}
          entityField="vehicle_id"
        />
        <StudentRequirementsCard
          students={students}
          capabilities={studentDefs}
          requirements={studentRequirements}
        />
      </div>
    </div>
  );
}

function AssignmentCard({
  title,
  emptyLabel,
  rows,
  capabilities,
  isEnabled,
  action,
  entityField,
}: {
  title: string;
  emptyLabel: string;
  rows: { id: string; label: string }[];
  capabilities: CapabilityDefinition[];
  isEnabled: (rowId: string, capabilityId: string) => boolean;
  action: (formData: FormData) => Promise<void>;
  entityField: "instructor_id" | "vehicle_id";
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {capabilities.length === 0 ? (
          <p className="text-sm text-muted-foreground">{emptyLabel}</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Geen records beschikbaar.</p>
        ) : (
          rows.slice(0, 12).map((row) => (
            <div key={row.id} className="rounded-md border border-border p-3">
              <p className="mb-2 truncate text-sm font-medium text-foreground">
                {row.label}
              </p>
              <div className="space-y-2">
                {capabilities.map((capability) => {
                  const checked = isEnabled(row.id, capability.id);
                  return (
                    <form
                      key={capability.id}
                      action={action}
                      className="flex items-center justify-between gap-2 text-sm"
                    >
                      <input type="hidden" name={entityField} value={row.id} />
                      <input
                        type="hidden"
                        name="capability_id"
                        value={capability.id}
                      />
                      <span className="truncate">{capability.label}</span>
                      <input
                        type="hidden"
                        name="enabled"
                        value={checked ? "false" : "true"}
                      />
                      <Button type="submit" size="sm" variant="secondary">
                        {checked ? "Uit" : "Aan"}
                      </Button>
                    </form>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function StudentRequirementsCard({
  students,
  capabilities,
  requirements,
}: {
  students: StudentOption[];
  capabilities: CapabilityDefinition[];
  requirements: CapabilityLink[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Leerling-eisen</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {capabilities.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Geen leerling-eigenschappen actief.
          </p>
        ) : students.length === 0 ? (
          <p className="text-sm text-muted-foreground">Geen leerlingen beschikbaar.</p>
        ) : (
          students.slice(0, 12).map((student) => (
            <div key={student.id} className="rounded-md border border-border p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="truncate text-sm font-medium text-foreground">
                  {student.full_name}
                </p>
                <Badge variant={student.active ? "success" : "outline"}>
                  {student.active ? "Actief" : "Inactief"}
                </Badge>
              </div>
              <div className="space-y-2">
                {capabilities.map((capability) => {
                  const required = hasLink(
                    requirements,
                    "student_id",
                    student.id,
                    capability.id,
                    "required",
                  );
                  const preferred = hasLink(
                    requirements,
                    "student_id",
                    student.id,
                    capability.id,
                    "preferred",
                  );
                  const enabled = required || preferred;
                  return (
                    <form
                      key={capability.id}
                      action={setStudentRequirement}
                      className="grid grid-cols-[minmax(0,1fr)_7rem_auto] items-center gap-2 text-sm"
                    >
                      <input type="hidden" name="student_id" value={student.id} />
                      <input
                        type="hidden"
                        name="capability_id"
                        value={capability.id}
                      />
                      <span className="truncate">{capability.label}</span>
                      <Select
                        name="requirement_type"
                        defaultValue={required ? "required" : "preferred"}
                      >
                        <option value="required">Eis</option>
                        <option value="preferred">Voorkeur</option>
                      </Select>
                      <input
                        type="hidden"
                        name="enabled"
                        value={enabled ? "false" : "true"}
                      />
                      <Button type="submit" size="sm" variant="secondary">
                        {enabled ? "Uit" : "Aan"}
                      </Button>
                    </form>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
