"use client";

import { Info } from "lucide-react";
import { usePathname } from "next/navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

type RouteInfoScope = "student" | "instructor" | "backoffice";
type RouteInfoMatchMode = "exact" | "prefix";

type RouteInfoEntry = {
  title: string;
  description: string;
  href: string;
  match: RouteInfoMatchMode;
};

const ROUTE_INFO: Record<RouteInfoScope, RouteInfoEntry[]> = {
  student: [
    {
      href: "/student/lessons/",
      match: "prefix",
      title: "Lesdetails",
      description:
        "Bekijk per les precies wat is geoefend, welke feedback je kreeg en wat je volgende focus is.",
    },
    {
      href: "/student/lessons",
      match: "prefix",
      title: "Lessen",
      description:
        "Hier zie je je planning en open je iedere les voor details, context en voortgang.",
    },
    {
      href: "/student/facturen/",
      match: "prefix",
      title: "Factuurdetail",
      description:
        "Open een factuur om regels, betaalstatus en online betaling rustig te bekijken.",
    },
    {
      href: "/student/betalingen",
      match: "prefix",
      title: "Betalingen",
      description:
        "Dit scherm bundelt tegoed, facturen en betaalstatus op een plek.",
    },
    {
      href: "/student/voortgang",
      match: "prefix",
      title: "Voortgang",
      description:
        "Volg hier je rijontwikkeling, leskaart en examenvoorbereiding.",
    },
    {
      href: "/student/theorie",
      match: "prefix",
      title: "Theorie",
      description:
        "Werk theorie-opdrachten af en zie wat nog openstaat voor je volgende stap.",
    },
    {
      href: "/student/berichten",
      match: "prefix",
      title: "Berichten",
      description:
        "Chat direct met je rijschool of instructeur zonder de app te verlaten.",
    },
    {
      href: "/student/profile",
      match: "prefix",
      title: "Profiel",
      description:
        "Beheer je account, contactgegevens en gekoppelde leerling vanuit dit scherm.",
    },
    {
      href: "/student/cbr",
      match: "prefix",
      title: "CBR-status",
      description:
        "Zie welke CBR-stappen al geregeld zijn en wat er nog openstaat.",
    },
    {
      href: "/student/select-child",
      match: "prefix",
      title: "Leerling kiezen",
      description:
        "Kies welke gekoppelde leerling je nu bekijkt als er meerdere onder je account hangen.",
    },
    {
      href: "/student",
      match: "exact",
      title: "Startscherm",
      description:
        "Je thuisscherm toont je eerstvolgende les, tegoed en de snelste acties voor vandaag.",
    },
  ],
  instructor: [
    {
      href: "/instructor/afspraak/nieuw",
      match: "prefix",
      title: "Nieuwe afspraak",
      description:
        "Plan hier een examen, theorieblok of ander agenda-item dat tijd reserveert.",
    },
    {
      href: "/instructor/afspraak/",
      match: "prefix",
      title: "Afspraak bewerken",
      description:
        "Werk een bestaand agenda-item bij of verwijder het wanneer de planning wijzigt.",
    },
    {
      href: "/instructor/berichten/",
      match: "prefix",
      title: "Gesprek",
      description:
        "Dit is de volledige chat met een leerling, zodat je snel kunt bijsturen of antwoorden.",
    },
    {
      href: "/instructor/berichten",
      match: "prefix",
      title: "Berichten",
      description:
        "Bekijk al je gesprekken met leerlingen en open direct de juiste thread.",
    },
    {
      href: "/instructor/beschikbaarheid",
      match: "prefix",
      title: "Beschikbaarheid",
      description:
        "Stel je vaste beschikbaarheid en uitzonderingen in zodat planning en capaciteit kloppen.",
    },
    {
      href: "/instructor/leerlingen",
      match: "prefix",
      title: "Leerlingen",
      description:
        "Hier vind je je actieve leerlingenlijst met snelle toegang tot dossiers en lessen.",
    },
    {
      href: "/instructor/meldingen",
      match: "prefix",
      title: "Meldingen",
      description:
        "Bekijk updates en beheer welke pushmeldingen je op je toestel wilt ontvangen.",
    },
    {
      href: "/instructor/taken",
      match: "prefix",
      title: "Taken",
      description:
        "Werk jouw toegewezen taken af en verplaats ze door je workflow.",
    },
    {
      href: "/instructor/week",
      match: "prefix",
      title: "Weekplanning",
      description:
        "Je overzicht van alle lessen, afspraken en gaten in je komende week.",
    },
    {
      href: "/instructor/meer",
      match: "prefix",
      title: "Meer",
      description:
        "Extra functies zoals instellingen en aanvullende tools voor je instructeurapp.",
    },
    {
      href: "/instructor/",
      match: "prefix",
      title: "Lescockpit",
      description:
        "Werk hier een les af met alle context, acties, feedback en vervolg op een plek.",
    },
    {
      href: "/instructor",
      match: "exact",
      title: "Vandaag",
      description:
        "Je startscherm voor vandaag met dagritme, lessen en directe aandachtspunten.",
    },
  ],
  backoffice: [
    {
      href: "/backoffice/organisatie/dashboard",
      match: "prefix",
      title: "Organisatiedashboard",
      description:
        "Stuur organisatiebreed op ritme, omzet, vestigingen en opvolging.",
    },
    {
      href: "/backoffice/organisatie/permissies",
      match: "prefix",
      title: "Permissies",
      description:
        "Beheer hier welke rechten per rol of medewerker binnen de organisatie gelden.",
    },
    {
      href: "/backoffice/organisatie/rollen",
      match: "prefix",
      title: "Rollen",
      description:
        "Dit scherm legt uit welke rollen er zijn en hoe hun verantwoordelijkheden verdeeld zijn.",
    },
    {
      href: "/backoffice/organisatie/teams",
      match: "prefix",
      title: "Teams",
      description:
        "Richt teams in om medewerkers logisch te groeperen per discipline of verantwoordelijkheid.",
    },
    {
      href: "/backoffice/organisatie",
      match: "prefix",
      title: "Organisatiebeheer",
      description:
        "Beheer de basisstructuur van je organisatie, inclusief vestigingen, teams en governance.",
    },
    {
      href: "/backoffice/medewerkers/",
      match: "prefix",
      title: "Medewerkerstoegang",
      description:
        "Werk rollen, teams, vestigingen en scopes per medewerker gericht bij.",
    },
    {
      href: "/backoffice/medewerkers",
      match: "prefix",
      title: "Medewerkers",
      description:
        "Bekijk, nodig uit en beheer hier alle medewerkers binnen je organisatie.",
    },
    {
      href: "/backoffice/instellingen/vestigingen/",
      match: "prefix",
      title: "Vestigingsdashboard",
      description:
        "Zoom in op een vestiging om lokaal ritme, capaciteit en opvolging te beoordelen.",
    },
    {
      href: "/backoffice/instellingen/vestigingen",
      match: "prefix",
      title: "Vestigingen",
      description:
        "Beheer vestigingen en houd hun operationele inrichting en dashboards bij.",
    },
    {
      href: "/backoffice/instellingen/notificaties/templates/",
      match: "prefix",
      title: "Notificatietemplate",
      description:
        "Pas hier de inhoud en het kanaal van een specifieke notificatietemplate aan.",
    },
    {
      href: "/backoffice/instellingen/notificaties",
      match: "prefix",
      title: "Notificaties",
      description:
        "Beheer notificatie-instellingen en templates voor je organisatie.",
    },
    {
      href: "/backoffice/instellingen",
      match: "prefix",
      title: "Instellingen",
      description:
        "Hier regel je de algemene organisatie-instellingen en systeemgedrag.",
    },
    {
      href: "/backoffice/franchise/playbook",
      match: "prefix",
      title: "Franchise playbook",
      description:
        "Gebruik het playbook voor governance, template-uitrol en netwerkreadiness.",
    },
    {
      href: "/backoffice/franchise/aandacht",
      match: "prefix",
      title: "Franchise aandacht",
      description:
        "Prioriteer hier welke franchisees directe opvolging of coaching nodig hebben.",
    },
    {
      href: "/backoffice/franchise/prestaties",
      match: "prefix",
      title: "Franchiseprestaties",
      description:
        "Vergelijk omzet, lesvolume en aandachtssignalen over het hele netwerk.",
    },
    {
      href: "/backoffice/franchise/planning",
      match: "prefix",
      title: "Centrale planning",
      description:
        "Bekijk waar binnen het netwerk drukte of juist ruimte ontstaat in de planning.",
    },
    {
      href: "/backoffice/franchise/vergelijking",
      match: "prefix",
      title: "Franchisevergelijking",
      description:
        "Zet franchisees naast elkaar om verschillen in kwaliteit, capaciteit en resultaat te zien.",
    },
    {
      href: "/backoffice/franchise/templates",
      match: "prefix",
      title: "Franchisetemplates",
      description:
        "Beheer standaarden en sjablonen die franchisees centraal kunnen overnemen.",
    },
    {
      href: "/backoffice/franchise",
      match: "prefix",
      title: "Franchisedashboard",
      description:
        "Stuur het franchisenetwerk centraal aan zonder lokale uitvoering uit handen te nemen.",
    },
    {
      href: "/backoffice/agenda/herbezetten",
      match: "prefix",
      title: "Herbezetten",
      description:
        "Vind snel nieuwe plekken voor lessen of afspraken die verplaatst moeten worden.",
    },
    {
      href: "/backoffice/agenda/afspraak/nieuw",
      match: "prefix",
      title: "Nieuwe afspraak",
      description:
        "Plan hier een afspraak zoals een examen, theorieblok of ander agenda-item.",
    },
    {
      href: "/backoffice/agenda/afspraak/",
      match: "prefix",
      title: "Afspraakdetail",
      description:
        "Bekijk en wijzig een specifieke afspraak zonder de agenda te verlaten.",
    },
    {
      href: "/backoffice/agenda/nieuw",
      match: "prefix",
      title: "Nieuwe les",
      description:
        "Plan een nieuwe les met de juiste leerling, instructeur en middelen.",
    },
    {
      href: "/backoffice/agenda/",
      match: "prefix",
      title: "Agenda-item",
      description:
        "Open een gepland item om details, context en acties direct te beheren.",
    },
    {
      href: "/backoffice/agenda",
      match: "prefix",
      title: "Agenda",
      description:
        "Je operationele planning voor lessen, afspraken en bezetting binnen de rijschool.",
    },
    {
      href: "/backoffice/beschikbaarheid",
      match: "prefix",
      title: "Beschikbaarheid",
      description:
        "Beheer beschikbaarheid van instructeurs en houd capaciteit planbaar.",
    },
    {
      href: "/backoffice/boekhouding",
      match: "prefix",
      title: "Boekhouding",
      description:
        "Controleer hier de financiële administratie en afstemming rondom betalingen.",
    },
    {
      href: "/backoffice/cbr",
      match: "prefix",
      title: "CBR-status",
      description:
        "Volg CBR-gerelateerde voortgang en openstaande acties per leerling.",
    },
    {
      href: "/backoffice/facturen/termijn",
      match: "prefix",
      title: "Factuurtermijn",
      description:
        "Werk betaaltermijnen uit voor facturen die in delen voldaan worden.",
    },
    {
      href: "/backoffice/facturen/nieuw",
      match: "prefix",
      title: "Nieuwe factuur",
      description:
        "Maak hier een nieuwe factuur aan met regels, ontvanger en betaalafspraken.",
    },
    {
      href: "/backoffice/facturen/",
      match: "prefix",
      title: "Factuurdetail",
      description:
        "Bekijk een specifieke factuur, de status en bijbehorende betalingen.",
    },
    {
      href: "/backoffice/facturen",
      match: "prefix",
      title: "Facturen",
      description:
        "Beheer openstaande, betaalde en conceptfacturen vanuit een centraal overzicht.",
    },
    {
      href: "/backoffice/leads/",
      match: "prefix",
      title: "Leaddetail",
      description:
        "Werk een lead inhoudelijk bij en stuur hem door de funnel naar proefles of conversie.",
    },
    {
      href: "/backoffice/leads",
      match: "prefix",
      title: "Leads",
      description:
        "Volg nieuwe aanvragen op en stuur ze gestructureerd door de salesfunnel.",
    },
    {
      href: "/backoffice/leerlingen/",
      match: "prefix",
      title: "Leerlingdossier",
      description:
        "Open het volledige dossier van een leerling met voortgang, betalingen en context.",
    },
    {
      href: "/backoffice/leerlingen",
      match: "prefix",
      title: "Leerlingen",
      description:
        "Dit overzicht helpt je leerlingen beheren, opvolgen en openen voor detailwerk.",
    },
    {
      href: "/backoffice/packages",
      match: "prefix",
      title: "Pakketten",
      description:
        "Beheer lespakketten en de commerciële opbouw van je aanbod.",
    },
    {
      href: "/backoffice/rapportages",
      match: "prefix",
      title: "Rapportages",
      description:
        "Analyseer hier trends in omzet, capaciteit, conversie en operationeel ritme.",
    },
    {
      href: "/backoffice/referrals",
      match: "prefix",
      title: "Referrals",
      description:
        "Bekijk en beheer het doorverwijsprogramma van leerlingen en relaties.",
    },
    {
      href: "/backoffice/taken",
      match: "prefix",
      title: "Taken",
      description:
        "Beheer operationele opvolging via borden, kolommen en taakverantwoordelijkheid.",
    },
    {
      href: "/backoffice/theorie",
      match: "prefix",
      title: "Theorie",
      description:
        "Beheer theoriecontent, voortgang en voorbereiding rondom theorielessen.",
    },
    {
      href: "/backoffice/voertuigen",
      match: "prefix",
      title: "Voertuigen",
      description:
        "Houd voertuigen, inzetbaarheid en koppeling aan planning of vestiging bij.",
    },
    {
      href: "/backoffice",
      match: "exact",
      title: "Dashboard",
      description:
        "Je management-overzicht voor planning, leads, omzet en directe opvolging van vandaag.",
    },
  ],
};

const SCOPE_FALLBACK: Record<RouteInfoScope, RouteInfoEntry> = {
  student: {
    href: "/student",
    match: "exact",
    title: "Leerlingapp",
    description:
      "Deze app helpt leerlingen met planning, voortgang, betalingen en contact met de rijschool.",
  },
  instructor: {
    href: "/instructor",
    match: "exact",
    title: "Instructeurapp",
    description:
      "Deze app ondersteunt instructeurs met planning, lessen, leerlingen en dagelijkse opvolging.",
  },
  backoffice: {
    href: "/backoffice",
    match: "exact",
    title: "Backoffice",
    description:
      "De backoffice is het centrale werkgebied voor operatie, beheer, rapportage en organisatieaansturing.",
  },
};

function matches(pathname: string, entry: RouteInfoEntry) {
  if (entry.match === "exact") {
    return pathname === entry.href;
  }

  if (entry.href.endsWith("/")) {
    return pathname.startsWith(entry.href);
  }

  return pathname === entry.href || pathname.startsWith(`${entry.href}/`);
}

function resolveRouteInfo(scope: RouteInfoScope, pathname: string) {
  return ROUTE_INFO[scope].find((entry) => matches(pathname, entry)) ?? SCOPE_FALLBACK[scope];
}

export function RouteInfoBubble({
  scope,
  className,
}: {
  scope: RouteInfoScope;
  className?: string;
}) {
  const pathname = usePathname() ?? "";
  const info = resolveRouteInfo(scope, pathname);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Uitleg over deze pagina"
          className={cn(
            "inline-flex h-9 w-9 items-center justify-center rounded-full border border-border/60 bg-card/72 text-muted-foreground shadow-xl shadow-black/10 backdrop-blur-2xl transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:text-foreground",
            className,
          )}
        >
          <Info className="h-4 w-4" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-[20rem] rounded-[1.4rem] border border-border/70 bg-popover/92 p-4 text-popover-foreground shadow-2xl shadow-black/15 backdrop-blur-2xl"
      >
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            Functie-uitleg
          </p>
          <p className="text-sm font-semibold text-foreground">{info.title}</p>
          <p className="text-sm leading-6 text-muted-foreground">
            {info.description}
          </p>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
