"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  ExternalLink,
  List,
  LocateFixed,
  Map,
  Navigation,
  WifiOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  loadEncryptedPublishedStops,
  saveEncryptedPublishedStops,
  type OfflinePublishedStop,
} from "@/lib/offline/encrypted-route-store";
import { recordTravelStatus } from "./actions";

export type DayRouteStop = OfflinePublishedStop & {
  id: string;
  coordinates: { latitude: number; longitude: number } | null;
  validationStatus: string;
  routeMethod: string;
  routeAsOf: string | null;
  routeConfidence: string;
};

export function DayRouteClient({
  stops: serverStops,
  offlineKey,
  expiresAt,
}: {
  stops: readonly DayRouteStop[];
  offlineKey: string;
  expiresAt: string;
}) {
  const [mode, setMode] = useState<"LIST" | "MAP">("LIST");
  const [offline, setOffline] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [cachedStops, setCachedStops] = useState<readonly DayRouteStop[]>([]);
  const [pending, startTransition] = useTransition();
  const stops = offline && cachedStops.length > 0 ? cachedStops : serverStops;

  useEffect(() => {
    function syncNetwork() {
      setOffline(!navigator.onLine);
    }
    syncNetwork();
    window.addEventListener("online", syncNetwork);
    window.addEventListener("offline", syncNetwork);
    void saveEncryptedPublishedStops({
      key: offlineKey,
      stops: serverStops,
      expiresAt,
    }).then(() => setSavedAt(new Date().toISOString()));
    void loadEncryptedPublishedStops(offlineKey).then((cached) => {
      if (!cached) return;
      setCachedStops(cached.stops as DayRouteStop[]);
      setSavedAt(cached.savedAt);
    });
    return () => {
      window.removeEventListener("online", syncNetwork);
      window.removeEventListener("offline", syncNetwork);
    };
  }, [expiresAt, offlineKey, serverStops]);

  const nextStop = useMemo(
    () =>
      stops.find(
        (stop) =>
          Date.parse(stop.endsAt) > Date.now() && stop.status !== "ARRIVED",
      ) ?? null,
    [stops],
  );

  function setStatus(
    appointmentId: string,
    status: "ON_MY_WAY" | "ARRIVED" | "DELAYED",
  ) {
    if (offline) return;
    startTransition(async () => {
      await recordTravelStatus({ appointmentId, status });
    });
  }

  return (
    <div className="space-y-4">
      {offline ? (
        <div
          className="flex items-start gap-3 rounded-2xl border border-amber-300/60 bg-amber-50 p-3 text-sm text-amber-950"
          role="status"
        >
          <WifiOff className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <div>
            <p className="font-black">Offline · laatst gepubliceerde stops</p>
            <p className="mt-0.5 text-xs">
              {savedAt
                ? `Versleuteld bewaard op ${new Date(savedAt).toLocaleString("nl-NL")}.`
                : "Er is nog geen veilige offlinekopie op dit apparaat."}{" "}
              Statuswijzigingen zijn uitgeschakeld totdat je weer online bent.
            </p>
          </div>
        </div>
      ) : null}

      {nextStop ? (
        <section className="overflow-hidden rounded-[1.4rem] border border-brand-border bg-gradient-to-br from-slate-950 to-slate-800 p-4 text-white shadow-xl sm:p-5">
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-white/60">
            <LocateFixed className="h-4 w-4 text-violet-300" aria-hidden />
            Volgende locatie
          </div>
          <div className="mt-3 grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
            <div>
              <p className="text-2xl font-black">{nextStop.label}</p>
              <p className="mt-1 text-sm text-white/70">
                {nextStop.formattedAddress}
              </p>
              <p className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-white/70">
                <Clock3 className="h-3.5 w-3.5" aria-hidden />
                {formatTime(nextStop.startsAt)}–{formatTime(nextStop.endsAt)}
                {" · "}
                {nextStop.routeMethod === "UNKNOWN"
                  ? "reistijd nog onbekend"
                  : `${nextStop.routeMethod.toLowerCase()} · ${nextStop.routeConfidence.toLowerCase()}`}
              </p>
            </div>
            <a
              href={nextStop.navigationUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-white px-4 text-sm font-black text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300"
            >
              <Navigation className="h-4 w-4" aria-hidden />
              Navigeer extern
            </a>
          </div>
        </section>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <div
          className="inline-flex rounded-xl border border-brand-border bg-card p-1"
          role="tablist"
          aria-label="Dagrouteweergave"
        >
          <Tab active={mode === "LIST"} onClick={() => setMode("LIST")}>
            <List className="h-4 w-4" aria-hidden />
            Lijst
          </Tab>
          <Tab active={mode === "MAP"} onClick={() => setMode("MAP")}>
            <Map className="h-4 w-4" aria-hidden />
            Kaart
          </Tab>
        </div>
        <p className="text-xs text-muted-foreground">
          {stops.length} gepubliceerde {stops.length === 1 ? "stop" : "stops"}
        </p>
      </div>

      {mode === "MAP" ? (
        <RouteMapFallback stops={stops} />
      ) : (
        <ol className="space-y-3">
          {stops.map((stop, index) => (
            <li
              key={stop.id}
              className="rounded-2xl border border-brand-border bg-card p-4 shadow-brand-card"
            >
              <div className="flex gap-3">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-black text-primary">
                  {index + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h2 className="font-black text-foreground">
                        {stop.label}
                      </h2>
                      <p className="mt-0.5 text-sm text-muted-foreground">
                        {stop.formattedAddress}
                      </p>
                    </div>
                    <span className="rounded-full bg-muted px-2 py-1 text-[11px] font-bold">
                      {statusLabel(stop.status)}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <a
                      href={stop.navigationUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-brand-border px-3 text-xs font-black hover:bg-muted"
                    >
                      <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                      Open navigatie
                    </a>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={offline || pending}
                      onClick={() => setStatus(stop.appointmentId, "ON_MY_WAY")}
                    >
                      Onderweg
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={offline || pending}
                      onClick={() => setStatus(stop.appointmentId, "ARRIVED")}
                    >
                      Aangekomen
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={offline || pending}
                      onClick={() => setStatus(stop.appointmentId, "DELAYED")}
                    >
                      Vertraging
                    </Button>
                  </div>
                </div>
              </div>
            </li>
          ))}
          {stops.length === 0 ? (
            <li className="rounded-2xl border border-dashed border-brand-border p-8 text-center text-sm text-muted-foreground">
              Vandaag zijn nog geen afspraakstops gepubliceerd.
            </li>
          ) : null}
        </ol>
      )}
    </div>
  );
}

function RouteMapFallback({ stops }: { stops: readonly DayRouteStop[] }) {
  const withCoordinates = stops.filter((stop) => stop.coordinates);
  return (
    <section className="relative min-h-[22rem] overflow-hidden rounded-2xl border border-brand-border bg-[radial-gradient(circle_at_20%_20%,rgba(139,92,246,.18),transparent_25%),linear-gradient(135deg,#f8fafc,#eef2ff)] p-4">
      <div className="absolute inset-0 opacity-30 [background-image:linear-gradient(to_right,#94a3b8_1px,transparent_1px),linear-gradient(to_bottom,#94a3b8_1px,transparent_1px)] [background-size:42px_42px]" />
      <div className="relative z-10 flex items-start justify-between gap-3">
        <div>
          <h2 className="font-black text-foreground">Dagkaart</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Lijstfallback blijft leidend; geen live tracking en geen interne
            turn-by-turn.
          </p>
        </div>
        <span className="rounded-full bg-white/90 px-2 py-1 text-[11px] font-bold shadow-sm">
          {withCoordinates.length}/{stops.length} op kaart
        </span>
      </div>
      <div className="relative z-10 mt-8 grid gap-2 sm:grid-cols-2">
        {stops.map((stop, index) => (
          <div
            key={stop.id}
            className="flex items-center gap-2 rounded-xl border border-white/80 bg-white/90 p-3 shadow-sm backdrop-blur"
          >
            {stop.coordinates ? (
              <CheckCircle2
                className="h-4 w-4 shrink-0 text-emerald-600"
                aria-hidden
              />
            ) : (
              <AlertTriangle
                className="h-4 w-4 shrink-0 text-amber-500"
                aria-hidden
              />
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-black">
                {index + 1}. {stop.label}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {stop.coordinates
                  ? "Gepubliceerde coördinatensnapshot"
                  : "Alleen als adres beschikbaar"}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Tab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3 text-xs font-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        active ? "bg-primary text-primary-foreground" : "text-muted-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("nl-NL", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function statusLabel(status: OfflinePublishedStop["status"]) {
  return (
    {
      PLANNED: "Gepland",
      ON_MY_WAY: "Onderweg",
      ARRIVED: "Aangekomen",
      DELAYED: "Vertraging",
    } as const
  )[status];
}
