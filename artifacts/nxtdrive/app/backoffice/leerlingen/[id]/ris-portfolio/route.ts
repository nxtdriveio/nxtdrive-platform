import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { loadStudentRisProgress } from "@/lib/ris/data";
import { requireStudentBackofficeAccess } from "@/lib/students/access";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const service = createServiceRoleClient();
  const { context, student } = await requireStudentBackofficeAccess(
    service,
    id,
    "read",
  );
  if (!student) {
    return NextResponse.json(
      { error: "Leerling niet gevonden of niet toegankelijk." },
      { status: 404 },
    );
  }
  const ris = await loadStudentRisProgress(
    service,
    context.organization.id,
    student.id,
  );
  const safeName =
    student.full_name
      .toLocaleLowerCase("nl-NL")
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-|-$/g, "") || "leerling";

  return NextResponse.json(
    {
      schema: "nxtdrive.ris-portfolio.v1",
      generatedAt: new Date().toISOString(),
      source: "https://nxtdrive.io",
      disclaimer:
        "Dit portfolio bevat gepubliceerde RIS-lesinformatie en is geen formeel CBR- of examenadvies.",
      student: { id: student.id, name: student.full_name },
      catalogVersion: ris.catalog.version,
      didacticProgressPct: ris.progressPct,
      progress: ris.progress,
      modules: ris.moduleProgress,
      publishedLessonCards: ris.publishedCards,
    },
    {
      headers: {
        "Content-Disposition": `attachment; filename="ris-portfolio-${safeName}.json"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}
