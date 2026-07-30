"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  List,
  Map,
  MapPin,
  SlidersHorizontal,
} from "lucide-react";

export type MapWorkspaceItem = Readonly<{
  id: string;
  title: string;
  subtitle: string;
  meta: string;
  status: "OK" | "WARNING" | "BLOCKED" | "UNKNOWN";
  latitude: number | null;
  longitude: number | null;
  branchId?: string | null;
  instructorId?: string | null;
}>;

export function ListMapWorkspace({
  items,
  mapOriginConfigured,
}: {
  items: readonly MapWorkspaceItem[];
  mapOriginConfigured: boolean;
}) {
  const [mode, setMode] = useState<"MAP" | "LIST">(
    mapOriginConfigured ? "MAP" : "LIST",
  );
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("ALL");
  const filtered = useMemo(
    () =>
      items.filter(
        (item) =>
          (status === "ALL" || item.status === status) &&
          `${item.title} ${item.subtitle}`
            .toLocaleLowerCase("nl-NL")
            .includes(query.toLocaleLowerCase("nl-NL")),
      ),
    [items, query, status],
  );

  return (
    <div className="grid min-h-[32rem] overflow-hidden rounded-2xl border border-brand-border bg-card shadow-brand-card lg:grid-cols-[20rem_minmax(0,1fr)]">
      <aside className="flex min-h-0 flex-col border-b border-brand-border lg:border-b-0 lg:border-r">
        <div className="space-y-2 border-b border-brand-border p-3">
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">
            <SlidersHorizontal className="h-4 w-4" aria-hidden />
            Filters
          </div>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Zoek afspraak of locatie"
            className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm"
          />
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm"
          >
            <option value="ALL">Alle statussen</option>
            <option value="BLOCKED">Geblokkeerd</option>
            <option value="WARNING">Waarschuwing</option>
            <option value="UNKNOWN">Onbekend</option>
            <option value="OK">Haalbaar</option>
          </select>
        </div>
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
          {filtered.map((item) => (
            <article
              key={item.id}
              className="rounded-xl border border-brand-border bg-background p-3"
            >
              <div className="flex items-start gap-2">
                <StatusDot status={item.status} />
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-black">{item.title}</h3>
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                    {item.subtitle}
                  </p>
                  <p className="mt-2 text-[11px] font-semibold text-muted-foreground">
                    {item.meta}
                  </p>
                </div>
              </div>
            </article>
          ))}
          {filtered.length === 0 ? (
            <p className="p-5 text-center text-sm text-muted-foreground">
              Geen resultaten voor deze filters.
            </p>
          ) : null}
        </div>
      </aside>

      <section className="min-w-0">
        <div className="flex items-center justify-between border-b border-brand-border p-2">
          <div
            className="inline-flex rounded-xl border border-brand-border p-1"
            role="tablist"
            aria-label="Planbordweergave"
          >
            <ModeButton
              active={mode === "LIST"}
              onClick={() => setMode("LIST")}
            >
              <List className="h-4 w-4" aria-hidden />
              Lijst
            </ModeButton>
            <ModeButton
              active={mode === "MAP"}
              onClick={() => setMode("MAP")}
              disabled={!mapOriginConfigured}
            >
              <Map className="h-4 w-4" aria-hidden />
              Kaart
            </ModeButton>
          </div>
          <span className="text-xs text-muted-foreground">
            {filtered.length} zichtbaar
          </span>
        </div>
        {mode === "MAP" ? (
          <div className="relative min-h-[30rem] bg-[radial-gradient(circle_at_30%_20%,rgba(124,58,237,.15),transparent_22%),linear-gradient(145deg,#f8fafc,#eef2ff)]">
            <div className="absolute inset-0 opacity-30 [background-image:linear-gradient(to_right,#94a3b8_1px,transparent_1px),linear-gradient(to_bottom,#94a3b8_1px,transparent_1px)] [background-size:48px_48px]" />
            <div className="relative grid gap-2 p-5 sm:grid-cols-2 xl:grid-cols-3">
              {filtered.map((item, index) => (
                <div
                  key={item.id}
                  className="flex items-center gap-2 rounded-xl border border-white bg-white/90 p-3 shadow-sm backdrop-blur"
                >
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary text-xs font-black text-primary-foreground">
                    {index + 1}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-black">
                      {item.title}
                    </span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {item.latitude === null
                        ? "Alleen als adres beschikbaar"
                        : "Exact operationeel punt"}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="min-h-[30rem] overflow-x-auto p-3">
            <table className="w-full min-w-[44rem] text-left text-sm">
              <thead>
                <tr className="border-b border-brand-border text-xs text-muted-foreground">
                  <th className="px-3 py-2">Afspraak</th>
                  <th className="px-3 py-2">Locatie</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Routebewijs</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => (
                  <tr key={item.id} className="border-b border-brand-border/70">
                    <td className="px-3 py-3 font-black">{item.title}</td>
                    <td className="px-3 py-3">{item.subtitle}</td>
                    <td className="px-3 py-3">
                      <span className="inline-flex items-center gap-1.5">
                        <StatusDot status={item.status} />
                        {statusLabel(item.status)}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">
                      {item.meta}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!mapOriginConfigured ? (
          <div className="flex items-start gap-2 border-t border-amber-200 bg-amber-50 p-3 text-xs text-amber-950">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
            Interactieve kaart is veilig gedegradeerd naar lijstmodus totdat de
            geïsoleerde kaartorigin en CSP-releasegate actief zijn.
          </div>
        ) : null}
      </section>
    </div>
  );
}

function ModeButton({
  active,
  disabled,
  onClick,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40 ${
        active ? "bg-primary text-primary-foreground" : "text-muted-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function StatusDot({ status }: { status: MapWorkspaceItem["status"] }) {
  return status === "BLOCKED" || status === "WARNING" ? (
    <AlertTriangle
      className={`mt-0.5 h-4 w-4 shrink-0 ${
        status === "BLOCKED" ? "text-red-500" : "text-amber-500"
      }`}
      aria-hidden
    />
  ) : (
    <MapPin
      className={`mt-0.5 h-4 w-4 shrink-0 ${
        status === "OK" ? "text-emerald-600" : "text-slate-400"
      }`}
      aria-hidden
    />
  );
}

function statusLabel(status: MapWorkspaceItem["status"]) {
  return (
    {
      OK: "Haalbaar",
      WARNING: "Waarschuwing",
      BLOCKED: "Geblokkeerd",
      UNKNOWN: "Onbekend",
    } as const
  )[status];
}
