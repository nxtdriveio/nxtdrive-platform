import {
  loadPortalContext,
  loadPortalSections,
} from "@/lib/parent-portal/context";
import { PARENT_PORTAL_SECTIONS } from "@/lib/parent-portal/visibility";
import {
  NoChildCard,
  PortalPlanningCard,
  PortalVoortgangCard,
  PortalExamensCard,
  PortalFacturenCard,
  PortalBetalingenCard,
  PortalPakketinformatieCard,
  PortalTegoedCard,
  PortalDocumentenCard,
} from "@/components/parent-portal/PortalCards";

export const dynamic = "force-dynamic";

export default async function OuderOverviewPage() {
  const ctx = await loadPortalContext();

  if (!ctx.student) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Ouderportaal</h1>
        <NoChildCard />
      </div>
    );
  }

  const data = await loadPortalSections(ctx, [...PARENT_PORTAL_SECTIONS]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">
          Welkom in het ouderportaal
        </h1>
        <p className="text-sm text-muted-foreground">
          Een alleen-lezen overzicht van {ctx.student.full_name}.
        </p>
      </div>

      {data.planning ? (
        <PortalPlanningCard
          upcomingLessons={data.planning.upcomingLessons}
          pastLessons={data.planning.pastLessons}
          appointments={data.planning.appointments}
          pastAppointments={data.planning.pastAppointments}
        />
      ) : null}
      {data.voortgang ? (
        <PortalVoortgangCard
          readiness={data.voortgang.readiness}
          lessonHistory={data.voortgang.lessonHistory}
        />
      ) : null}
      {data.examens ? (
        <PortalExamensCard
          cbrStatus={data.examens.cbrStatus}
          cbrChecklist={data.examens.cbrChecklist}
          examAppointments={data.examens.examAppointments}
        />
      ) : null}
      {data.facturen ? (
        <PortalFacturenCard
          invoices={data.facturen.invoices}
          outstandingCents={data.facturen.outstandingCents}
        />
      ) : null}
      {data.betalingen ? (
        <PortalBetalingenCard
          paidInvoices={data.betalingen.paidInvoices}
          paidTotalCents={data.betalingen.paidTotalCents}
        />
      ) : null}
      {data.pakketinformatie ? (
        <PortalPakketinformatieCard
          packages={data.pakketinformatie.packages}
        />
      ) : null}
      {data.tegoed ? (
        <PortalTegoedCard
          balance={data.tegoed.balance}
          ledger={data.tegoed.ledger}
        />
      ) : null}
      {data.documenten ? (
        <PortalDocumentenCard documents={data.documenten.documents} />
      ) : null}
    </div>
  );
}
