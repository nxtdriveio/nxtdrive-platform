import Link from "next/link";
import { ChevronLeft, MapPinned } from "lucide-react";
import { getStudentPwaContext } from "@/lib/student-pwa/context";
import { createServiceRoleClient } from "@/lib/supabase/service";
import {
  StudentPageHeader,
  StudentSection,
} from "@/components/student/StudentPwa";
import { LocationManager, type StudentLocationView } from "./location-manager";

export const dynamic = "force-dynamic";

export default async function StudentLocationsPage() {
  const { tenant, student } = await getStudentPwaContext();
  const locations: StudentLocationView[] = [];
  if (student) {
    const service = createServiceRoleClient();
    const { data: links } = await service
      .from("entity_location_links")
      .select("location_record_id, role, label")
      .eq("tenant_id", tenant.id)
      .eq("student_id", student.id)
      .is("valid_until", null)
      .order("created_at");
    const recordIds = [
      ...new Set((links ?? []).map((link) => link.location_record_id)),
    ];
    if (recordIds.length > 0) {
      const [{ data: records }, { data: versions }] = await Promise.all([
        service
          .from("location_records")
          .select("id, canonical_version_id")
          .eq("tenant_id", tenant.id)
          .in("id", recordIds),
        service
          .from("location_versions")
          .select(
            "id, location_record_id, formatted_address, validation_status, source",
          )
          .eq("tenant_id", tenant.id)
          .in("location_record_id", recordIds),
      ]);
      const canonicalByRecord = new Map(
        (records ?? []).map((record) => [
          record.id,
          record.canonical_version_id,
        ]),
      );
      const versionById = new Map(
        (versions ?? []).map((version) => [version.id, version]),
      );
      for (const link of links ?? []) {
        const version = versionById.get(
          canonicalByRecord.get(link.location_record_id),
        );
        if (!version) continue;
        locations.push({
          id: link.location_record_id,
          role: link.role as StudentLocationView["role"],
          label: link.label || "Locatie",
          formattedAddress: version.formatted_address,
          validationStatus: version.validation_status,
          source: version.source,
        });
      }
    }
  }

  return (
    <div className="min-w-0 space-y-4 lg:space-y-6">
      <Link
        href="/leerling/instellingen"
        className="inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden />
        Instellingen
      </Link>
      <StudentPageHeader
        eyebrow="Instellingen"
        title="Mijn locaties"
        subtitle="Beheer je woonadres, vaste ophaal- en afzetpunten en extra locaties. Een les gebruikt altijd de laatst gepubliceerde stopsnapshot."
      />
      <StudentSection title="Opgeslagen locaties" icon={MapPinned}>
        <LocationManager locations={locations} />
      </StudentSection>
    </div>
  );
}
