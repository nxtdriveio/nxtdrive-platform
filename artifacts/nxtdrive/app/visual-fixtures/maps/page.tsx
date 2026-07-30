import { notFound } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  Clock3,
  Euro,
  Gauge,
  MapPin,
  Navigation,
  Route,
  Search,
  ShieldCheck,
  Users,
} from "lucide-react";

const scenarios = {
  autocomplete: {
    eyebrow: "Leerling toevoegen",
    title: "Zoek een ophaallocatie",
    notice: "4 resultaten · sessie actief",
    rows: ["Stationsplein 1, Utrecht", "Stationsplein 6, Gouda", "Stationsweg 1, Woerden"],
  },
  manual: {
    eyebrow: "Adrescontrole",
    title: "Controleer het adres handmatig",
    notice: "Provider tijdelijk niet beschikbaar · handmatige invoer blijft werken",
    rows: ["Straat en huisnummer", "Postcode", "Plaats", "Reden van handmatige bevestiging"],
  },
  "student-locations": {
    eyebrow: "Mijn profiel",
    title: "Mijn leslocaties",
    notice: "Thuis is je standaard ophaallocatie",
    rows: ["Thuis · Vondellaan 18, Utrecht", "School · Daltonlaan 200, Utrecht", "Nieuwe locatie toevoegen"],
  },
  "lesson-location": {
    eyebrow: "Les plannen",
    title: "Kies de locatie voor deze les",
    notice: "Alleen deze les · je standaardlocatie verandert niet",
    rows: ["Thuis (standaard)", "School", "Tijdelijk alternatief"],
  },
  "instructor-next": {
    eyebrow: "Volgende les · 10:30",
    title: "Mila ophalen",
    notice: "12 min rijden · vertrek om 10:14 · verkeersinformatie 2 min oud",
    rows: ["Vondellaan 18, Utrecht", "Open externe navigatie", "Markeer als onderweg"],
  },
  "instructor-day": {
    eyebrow: "Dagroute",
    title: "Donderdag 30 juli",
    notice: "4 lessen · 58 min geplande reistijd · offline beschikbaar",
    rows: ["09:00 Noor · aangekomen", "10:30 Mila · volgende", "12:30 Finn · 14 min", "15:00 Yara · 11 min"],
  },
  planboard: {
    eyebrow: "Planning vandaag",
    title: "Lijst en kaart",
    notice: "3 aandachtspunten · kaart toont alleen de zichtbare dagselectie",
    rows: ["09:00 Noor · Brandon", "10:30 Mila · Brandon", "12:00 Reisbuffer te klein", "13:30 Finn · Lizzy"],
  },
  conflict: {
    eyebrow: "Commitcontrole",
    title: "Onvoldoende reistijdbuffer",
    notice: "Geblokkeerd · 18 min nodig, 10 min beschikbaar",
    rows: ["Tijd aanpassen", "Andere instructeur bekijken", "Override met verplichte reden"],
  },
  optimization: {
    eyebrow: "Conceptscenario",
    title: "Routevolgorde vergelijken",
    notice: "Voorstel bespaart naar schatting 21 min en 14 km · nog niet gepubliceerd",
    rows: ["Mila 09:00 → 10:30", "Noor 10:30 → 09:00", "2 van 3 mutaties geselecteerd", "Review en publiceren"],
  },
  cancellation: {
    eyebrow: "Vrijgekomen tijdslot",
    title: "Herstel na annulering",
    notice: "3 verklaarbare opties · geen wijziging zonder bevestiging",
    rows: ["Mila eerder · +4 min route", "Finn verlengen · zelfde gebied", "Tijdslot vrij laten"],
  },
  "work-areas": {
    eyebrow: "Locatiebeheer",
    title: "Werkgebieden",
    notice: "2 overlappingen · 1 gebied nadert capaciteit",
    rows: ["Utrecht Centrum · 84%", "Leidsche Rijn · 62%", "Nieuwegein · 91%", "Versie publiceren"],
  },
  "empty-miles": {
    eyebrow: "Operationele analyse",
    title: "Lege kilometers",
    notice: "Deze week 312 km · 88% datadekking · planninginschatting",
    rows: ["Maandag · 54 km", "Dinsdag · 71 km", "Woensdag · 62 km", "Kans: westcluster · 18 km"],
  },
  postcode: {
    eyebrow: "Privacyveilige analyse",
    title: "Vraag per postcodegebied",
    notice: "Alleen groepen van minimaal 10 personen · 3 cellen onderdrukt",
    rows: ["3521 · 38 leerlingen", "3541 · 29 leerlingen", "3431 · 17 leerlingen", "Kleine groepen verborgen"],
  },
  cbr: {
    eyebrow: "Catalogus",
    title: "CBR-locaties",
    notice: "1 broncontrole nodig · publicatie vereist bevoegde review",
    rows: ["Utrecht · gepubliceerd", "Leusden · review nodig", "Nieuwe locatie voorstellen"],
  },
  control: {
    eyebrow: "Platformbeheer",
    title: "Maps & Routing Control Center",
    notice: "1 budgetwaarschuwing · 0 open circuitbreakers",
    rows: ["Forecast € 1.284", "48.912 billable units", "Fallbackratio 1,8%", "Grootste tenants"],
  },
  limits: {
    eyebrow: "Tenantconfiguratie",
    title: "Limieten en degradatie",
    notice: "Route Matrix op 72% van soft limit",
    rows: ["Autocomplete · 18.400 / 30.000", "Route Matrix · 72.140 / 100.000", "Optimalisatie · uit", "Veilige modus: lijst + handmatig"],
  },
  degraded: {
    eyebrow: "Veilige modus",
    title: "Kaart tijdelijk niet beschikbaar",
    notice: "Planning blijft beschikbaar als lijst · routewaarden zijn gelabelde schattingen",
    rows: ["Handmatige adresinvoer", "Lijstplanning", "Haversine-inschatting (laag vertrouwen)", "Probeer provider later opnieuw"],
  },
  validation: {
    eyebrow: "Adreskwaliteit",
    title: "Bevestig de voorgestelde correctie",
    notice: "Postcode en huisnummer zijn door de bron bevestigd",
    rows: ["Ingevoerd: Vondel laan 18", "Voorstel: Vondellaan 18", "Waarom deze correctie?", "Bevestigen"],
  },
  "student-confirmation": {
    eyebrow: "Les op 3 augustus",
    title: "Bevestig je ophaallocatie",
    notice: "De instructeur ziet alleen de gepubliceerde stop voor deze les",
    rows: ["Vondellaan 18, Utrecht", "Klopt deze locatie?", "Correctie voorstellen", "Bevestigen"],
  },
} as const;

type ScenarioKey = keyof typeof scenarios;

export default async function MapsVisualFixturePage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  if (process.env["VISUAL_FIXTURES_ENABLED"] !== "true") notFound();
  const { view } = await searchParams;
  const key = (view && view in scenarios ? view : "planboard") as ScenarioKey;
  const scenario = scenarios[key];
  const warning = ["conflict", "degraded", "manual", "limits"].includes(key);

  return (
    <main
      data-maps-fixture={key}
      className="min-h-screen bg-[#f3f5fa] p-3 text-slate-950 sm:p-6"
    >
      <div className="mx-auto max-w-[92rem] overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-xl shadow-slate-300/40">
        <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-violet-600 text-white">
              <Route className="h-5 w-5" aria-hidden />
            </span>
            <div>
              <p className="text-sm font-black tracking-tight">NXTDRIVE</p>
              <p className="text-[10px] font-bold uppercase tracking-[.18em] text-slate-400">
                Maps & Routing
              </p>
            </div>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600">
            Demo Rijschool · Utrecht
          </span>
        </header>

        <div className="grid min-h-[calc(100vh-8rem)] lg:grid-cols-[23rem_minmax(0,1fr)]">
          <section className="border-b border-slate-200 p-4 sm:p-6 lg:border-b-0 lg:border-r">
            <p className="text-[11px] font-black uppercase tracking-[.18em] text-violet-600">
              {scenario.eyebrow}
            </p>
            <h1 className="mt-1 text-2xl font-black tracking-tight">
              {scenario.title}
            </h1>
            <div
              className={`mt-4 flex gap-2 rounded-xl p-3 text-xs font-bold ${
                warning
                  ? "bg-amber-50 text-amber-900"
                  : "bg-violet-50 text-violet-900"
              }`}
            >
              {warning ? (
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              ) : (
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              )}
              {scenario.notice}
            </div>
            <div className="mt-4 space-y-2">
              {scenario.rows.map((row, index) => (
                <button
                  key={row}
                  type="button"
                  className="flex w-full items-center gap-3 rounded-xl border border-slate-200 p-3 text-left transition hover:border-violet-300"
                >
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-500">
                    {index === scenario.rows.length - 1 ? (
                      <ArrowRight className="h-4 w-4" aria-hidden />
                    ) : (
                      <MapPin className="h-4 w-4" aria-hidden />
                    )}
                  </span>
                  <span className="min-w-0 flex-1 text-sm font-bold">{row}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="relative min-h-[28rem] overflow-hidden bg-[#eceff5]">
            <div className="absolute inset-0 opacity-70 [background-image:linear-gradient(#d7dce6_1px,transparent_1px),linear-gradient(90deg,#d7dce6_1px,transparent_1px)] [background-size:42px_42px]" />
            <div className="absolute left-[9%] top-[15%] h-3/5 w-4/5 rotate-[-7deg] rounded-[45%] border-[12px] border-white shadow-sm" />
            <div className="absolute left-[18%] top-[28%] h-2/5 w-3/5 rotate-[16deg] rounded-[45%] border-[8px] border-white/80" />
            <div className="absolute left-4 right-4 top-4 flex flex-wrap items-center justify-between gap-2 sm:left-6 sm:right-6">
              <label className="flex h-11 min-w-56 flex-1 items-center gap-2 rounded-xl bg-white px-3 shadow-md">
                <Search className="h-4 w-4 text-slate-400" aria-hidden />
                <span className="text-sm font-bold text-slate-500">
                  Zoek of filter in deze weergave
                </span>
              </label>
              <span className="rounded-xl bg-white px-3 py-2.5 text-xs font-black shadow-md">
                Lijst + kaart
              </span>
            </div>

            {[
              ["top-[35%] left-[22%]", "1"],
              ["top-[54%] left-[48%]", "2"],
              ["top-[31%] left-[72%]", "3"],
            ].map(([position, label]) => (
              <span
                key={label}
                className={`absolute ${position} grid h-10 w-10 place-items-center rounded-full border-4 border-white bg-violet-600 text-sm font-black text-white shadow-lg`}
              >
                {label}
              </span>
            ))}

            <div className="absolute bottom-4 left-4 right-4 grid gap-2 sm:bottom-6 sm:left-6 sm:right-6 sm:grid-cols-4">
              {[
                [Clock3, "Reistijd", "58 min"],
                [Navigation, "Lege afstand", "21 km"],
                [Users, "Dekking", "88%"],
                [key === "control" ? Euro : Gauge, "Vertrouwen", "Hoog"],
              ].map(([Icon, label, value]) => {
                const MetricIcon = Icon as typeof Clock3;
                return (
                  <div
                    key={String(label)}
                    className="rounded-xl border border-white/70 bg-white/95 p-3 shadow-md backdrop-blur"
                  >
                    <div className="flex items-center gap-2 text-slate-400">
                      <MetricIcon className="h-4 w-4" aria-hidden />
                      <span className="text-[10px] font-black uppercase tracking-wider">
                        {String(label)}
                      </span>
                    </div>
                    <p className="mt-1 text-lg font-black">{String(value)}</p>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
        <footer className="flex items-center justify-between border-t border-slate-200 px-4 py-2 text-[10px] font-bold text-slate-400">
          <span className="inline-flex items-center gap-1">
            <Check className="h-3 w-3 text-emerald-500" aria-hidden />
            Geen live GPS of interne navigatie
          </span>
          <span>nxtdrive.io</span>
        </footer>
      </div>
    </main>
  );
}
