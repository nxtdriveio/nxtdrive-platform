import type { PlanningReason } from "@/lib/planning-core/types";

export type PlanningReasonExplanation = {
  title: string;
  detail: string;
  action: string;
  category: "rechten" | "tijd" | "beschikbaarheid" | "voertuig" | "rayon" | "capability";
};

export function explainPlanningReason(
  reason: PlanningReason,
): PlanningReasonExplanation {
  const meta = reason.meta ?? {};
  switch (reason.code) {
    case "ACTOR_NOT_ALLOWED_FOR_SCOPE":
      return {
        title: "Geen planningsrechten",
        detail: "Je account mag binnen deze vestiging of franchisescope niet plannen.",
        action: "Vraag een beheerder om rechten of kies een scope waar je toegang toe hebt.",
        category: "rechten",
      };
    case "INVALID_TIME_RANGE":
      return {
        title: "Ongeldig tijdslot",
        detail: "Start- en eindtijd vormen geen geldig planningsblok.",
        action: "Kies een latere eindtijd of een ander moment.",
        category: "tijd",
      };
    case "INSTRUCTOR_NOT_AVAILABLE":
      return {
        title: "Instructeur niet beschikbaar",
        detail:
          "De gekozen tijd valt buiten de beschikbaarheid, of in een geblokkeerd moment.",
        action: "Kies een beschikbaar groen tijdvak of pas beschikbaarheid aan.",
        category: "beschikbaarheid",
      };
    case "INSTRUCTOR_HAS_OVERLAP":
      return {
        title: "Instructeur heeft overlap",
        detail: "Deze instructeur heeft al een afspraak in hetzelfde tijdvak.",
        action: "Kies een ander tijdslot of een andere instructeur.",
        category: "beschikbaarheid",
      };
    case "OUTSIDE_INSTRUCTOR_SERVICE_AREA":
      return {
        title: "Buiten rayon",
        detail: "De ophaallocatie valt buiten het rayon van deze instructeur.",
        action: "Kies een instructeur met dit rayon of pas het rayon/locatie aan.",
        category: "rayon",
      };
    case "INSUFFICIENT_TRAVEL_TIME_BEFORE":
      return {
        title: "Te weinig reistijd vanaf vorige afspraak",
        detail: travelDetail(meta),
        action: "Gebruik routeoptimalisatie, kies een dichterbij gelegen leerling of maak meer buffer.",
        category: "rayon",
      };
    case "INSUFFICIENT_TRAVEL_TIME_AFTER":
      return {
        title: "Te weinig reistijd naar volgende afspraak",
        detail: travelDetail(meta),
        action: "Gebruik routeoptimalisatie, kies een dichterbij gelegen leerling of maak meer buffer.",
        category: "rayon",
      };
    case "UNKNOWN_SERVICE_AREA_TRAVEL_TIME":
      return {
        title: "Reistijd is geschat",
        detail: `Geen exacte rayonmatrix gevonden; NXTDRIVE rekent met ${meta.fallbackMinutes ?? "standaard"} minuten.`,
        action: "Controleer de route handmatig of vul de rayonmatrix aan.",
        category: "rayon",
      };
    case "MISSING_REQUIRED_CAPABILITY":
      return {
        title: "Instructeur mist verplichte eigenschap",
        detail: capabilityDetail(meta, "instructeur"),
        action: "Kies een instructeur met de juiste bevoegdheid, taal of begeleidingservaring.",
        category: "capability",
      };
    case "MISSING_REQUIRED_VEHICLE_CAPABILITY":
      return {
        title: "Voertuig mist verplichte eigenschap",
        detail: capabilityDetail(meta, "voertuig"),
        action: "Kies een geschikt voertuig of pas de afspraakvereisten aan.",
        category: "voertuig",
      };
    case "PREFERRED_CAPABILITY_MISSING":
      return {
        title: "Voorkeur ontbreekt",
        detail: capabilityDetail(meta, "planning"),
        action: "Je kunt doorplannen, maar een betere match is beschikbaar als deze voorkeur wordt ingevuld.",
        category: "capability",
      };
    case "VEHICLE_NOT_FOUND":
      return {
        title: "Voertuig niet gevonden",
        detail: "Het gekozen voertuig staat niet in deze planningcontext.",
        action: "Kies een zichtbaar voertuig binnen dezelfde vestiging.",
        category: "voertuig",
      };
    case "VEHICLE_UNAVAILABLE":
      return {
        title: "Voertuig niet beschikbaar",
        detail: `Voertuigstatus: ${String(meta.status ?? "niet beschikbaar")}.`,
        action: "Kies een actief voertuig of wijzig de voertuigstatus.",
        category: "voertuig",
      };
    case "VEHICLE_APK_EXPIRED":
      return {
        title: "APK verlopen",
        detail: "Dit voertuig mag niet worden ingepland zolang de APK is verlopen.",
        action: "Plan onderhoud/APK of kies een ander voertuig.",
        category: "voertuig",
      };
    case "VEHICLE_APK_EXPIRING_SOON":
      return {
        title: "APK verloopt binnenkort",
        detail: `APK verloopt over ${meta.daysUntilExpiry ?? "enkele"} dag(en).`,
        action: "Plan preventief onderhoud of houd rekening met uitvalrisico.",
        category: "voertuig",
      };
    case "VEHICLE_HAS_OVERLAP":
      return {
        title: "Voertuig heeft overlap",
        detail: "Dit voertuig is al ingepland in hetzelfde tijdvak.",
        action: "Kies een ander voertuig of verplaats een van de afspraken.",
        category: "voertuig",
      };
    case "VEHICLE_HAS_BLOCKING_DAMAGE":
      return {
        title: "Voertuig blokkeert door schade",
        detail: "Er staat open schade geregistreerd die planning blokkeert.",
        action: "Rond de schadeafhandeling af of kies een ander voertuig.",
        category: "voertuig",
      };
    case "VEHICLE_HAS_NON_BLOCKING_DAMAGE":
      return {
        title: "Voertuig heeft aandachtspunt",
        detail: "Er staat open schade geregistreerd, maar planning wordt niet geblokkeerd.",
        action: "Controleer of het voertuig geschikt blijft voor deze les.",
        category: "voertuig",
      };
    case "VEHICLE_MAINTENANCE_BLOCK":
      return {
        title: "Voertuig in onderhoud",
        detail: "Het onderhoud overlapt met deze afspraak.",
        action: "Kies een ander voertuig of verplaats de afspraak.",
        category: "voertuig",
      };
    case "VEHICLE_MAINTENANCE_UPCOMING":
      return {
        title: "Onderhoud komt eraan",
        detail: "Er staat binnenkort onderhoud gepland voor dit voertuig.",
        action: "Controleer of deze afspraak nog verantwoord is.",
        category: "voertuig",
      };
    case "VEHICLE_TRANSMISSION_MISMATCH":
      return {
        title: "Transmissie past niet",
        detail: `Vereist ${meta.requiredTransmission ?? "onbekend"}, voertuig is ${meta.vehicleTransmission ?? "onbekend"}.`,
        action: "Kies een voertuig met de juiste transmissie.",
        category: "voertuig",
      };
    case "VEHICLE_OUTSIDE_BRANCH_SCOPE":
      return {
        title: "Voertuig hoort bij andere vestiging",
        detail: "Het voertuig valt buiten de vestigingsscope van de afspraak.",
        action: "Kies een voertuig uit dezelfde vestiging of wijzig de vestiging.",
        category: "voertuig",
      };
    case "VEHICLE_ODOMETER_STALE":
      return {
        title: "Kilometerstand controleren",
        detail: "De kilometerstand is onbekend of te oud voor betrouwbare voertuigplanning.",
        action: "Werk de kilometerstand bij bij de volgende voertuigcontrole.",
        category: "voertuig",
      };
    case "QUEUE_STUDENT_BRANCH_MISMATCH":
      return {
        title: "Leerling en queue-item verschillen van vestiging",
        detail:
          "Deze leerling hoort bij een andere vestiging dan het planning queue-item.",
        action: "Pas eerst de vestiging van de leerling of het queue-item aan.",
        category: "beschikbaarheid",
      };
    default:
      return {
        title: reason.message,
        detail: reason.message,
        action: "Controleer de planningcontext en probeer opnieuw.",
        category: "tijd",
      };
  }
}

export function formatPlanningReason(reason: PlanningReason): string {
  const explanation = explainPlanningReason(reason);
  return `${explanation.title}: ${explanation.action}`;
}

function travelDetail(meta: Record<string, unknown>): string {
  const available = Number(meta.availableGapMinutes);
  const required = Number(meta.requiredTravelMinutes);
  if (Number.isFinite(available) && Number.isFinite(required)) {
    return `${available} minuten ruimte, ${required} minuten reistijd nodig.`;
  }
  return "De beschikbare ruimte tussen afspraken is kleiner dan de verwachte reistijd.";
}

function capabilityDetail(
  meta: Record<string, unknown>,
  entity: string,
): string {
  const missing = meta.missingCapabilityIds;
  if (Array.isArray(missing) && missing.length > 0) {
    return `De ${entity} mist: ${missing.join(", ")}.`;
  }
  return `De ${entity} mist minimaal een vereiste of gewenste eigenschap.`;
}
