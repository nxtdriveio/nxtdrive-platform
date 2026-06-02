"use client";

// ---------------------------------------------------------------------------
// Fase 3 — Route Intelligence: trial-lesson pickup + neighbours map preview.
//
// Renders an interactive Google map with the pickup pin and the neighbouring
// appointments around a chosen/suggested trial slot, so an instructor can trust
// the computed travel insight at a glance.
//
// Graceful degradation is mandatory (see replit.md): when
// NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is absent, the script fails to load, or there
// is no pickup coordinate, this renders nothing — the surrounding text insight
// is the fallback. It only ever reads coordinates already persisted upstream
// (trial_lessons / lessons / lead_intake_details); it never geocodes.
// ---------------------------------------------------------------------------
import * as React from "react";
import {
  loadGoogleMaps,
  MAPS_KEY,
  isMapsAuthFailed,
  onMapsAuthFailure,
  type GoogleMaps,
  type GoogleMarker,
  type GoogleInfoWindow,
} from "@/lib/maps/loader";

export type MapPoint = {
  lat: number;
  lng: number;
  label: string;
  // "pickup" is the trial pickup; "prev"/"next" are the adjacent appointments.
  kind: "pickup" | "prev" | "next";
};

// Simple coloured circle SVG markers, data-URI encoded (no extra Maps library).
function pinIcon(color: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22"><circle cx="11" cy="11" r="8" fill="${color}" stroke="#ffffff" stroke-width="2"/></svg>`;
  return "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg);
}

const KIND_COLOR: Record<MapPoint["kind"], string> = {
  pickup: "#2563eb", // blue — the pickup
  prev: "#16a34a", // green — appointment before
  next: "#ea580c", // orange — appointment after
};

export function TrialRouteMap({ points }: { points: MapPoint[] }) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [ready, setReady] = React.useState(false);
  const [failed, setFailed] = React.useState(false);

  // If Google reports an auth/activation failure (e.g. Maps JavaScript API not
  // enabled on the key), hide the map instead of showing Google's "Oops!" box.
  React.useEffect(() => {
    if (isMapsAuthFailed()) setFailed(true);
    return onMapsAuthFailure(() => setFailed(true));
  }, []);

  const pickup = points.find((p) => p.kind === "pickup");
  // A stable signature so the effect re-runs only when the points truly change.
  const signature = points
    .map((p) => `${p.kind}:${p.lat.toFixed(5)},${p.lng.toFixed(5)}`)
    .join("|");

  React.useEffect(() => {
    if (!MAPS_KEY || !pickup) return;
    const pk = pickup;
    let cancelled = false;
    const markers: GoogleMarker[] = [];
    let info: GoogleInfoWindow | null = null;

    void loadGoogleMaps()
      .then(async (google) => {
        if (cancelled) return;
        if (!google || !containerRef.current) {
          setFailed(true);
          return;
        }
        // With loading=async the constructors are only available after the
        // matching libraries are pulled. Resolve them before touching the API.
        const maps = google.maps;
        if (typeof maps.importLibrary === "function" && !maps.Map) {
          await Promise.all([
            maps.importLibrary("maps"),
            maps.importLibrary("marker"),
            maps.importLibrary("core"),
          ]);
        }
        if (cancelled) return;
        if (
          !containerRef.current ||
          !maps.Map ||
          !maps.Marker ||
          !maps.InfoWindow ||
          !maps.LatLngBounds ||
          !maps.Size ||
          !maps.Point
        ) {
          setFailed(true);
          return;
        }
        build(maps);
      })
      .catch(() => setFailed(true));

    function build(maps: GoogleMaps["maps"]) {
      const Map = maps.Map!;
      const Marker = maps.Marker!;
      const InfoWindow = maps.InfoWindow!;
      const LatLngBounds = maps.LatLngBounds!;
      const Size = maps.Size!;
      const Point = maps.Point!;
      const map = new Map(containerRef.current!, {
        center: { lat: pk.lat, lng: pk.lng },
        zoom: 13,
        disableDefaultUI: true,
        zoomControl: true,
        gestureHandling: "cooperative",
        clickableIcons: false,
      });
      info = new InfoWindow({});
      const bounds = new LatLngBounds();

      for (const p of points) {
        const marker = new Marker({
          position: { lat: p.lat, lng: p.lng },
          map,
          title: p.label,
          icon: {
            url: pinIcon(KIND_COLOR[p.kind]),
            scaledSize: new Size(22, 22),
            anchor: new Point(11, 11),
          },
        });
        marker.addListener("click", () => {
          if (!info) return;
          info.setContent(
            `<div style="font-size:12px;font-weight:500">${escapeHtml(
              p.label,
            )}</div>`,
          );
          info.open({ anchor: marker, map });
        });
        markers.push(marker);
        bounds.extend({ lat: p.lat, lng: p.lng });
      }

      if (points.length > 1 && !bounds.isEmpty()) {
        map.fitBounds(bounds, 48);
      } else {
        map.setCenter({ lat: pk.lat, lng: pk.lng });
        map.setZoom(14);
      }
      setReady(true);
    }

    return () => {
      cancelled = true;
      info?.close();
      for (const m of markers) m.setMap(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  // Graceful degradation: no key, no coordinates, or the script failed → hide.
  if (!MAPS_KEY || !pickup || failed) return null;

  return (
    <div className="mt-3">
      <div
        ref={containerRef}
        className="h-44 w-full overflow-hidden rounded-md border border-border bg-muted"
        aria-label="Kaart met ophaallocatie en omliggende afspraken"
        role="img"
      />
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        <Legend color={KIND_COLOR.pickup} label="Ophaallocatie" />
        {points.some((p) => p.kind === "prev") ? (
          <Legend color={KIND_COLOR.prev} label="Vorige afspraak" />
        ) : null}
        {points.some((p) => p.kind === "next") ? (
          <Legend color={KIND_COLOR.next} label="Volgende afspraak" />
        ) : null}
        {!ready ? <span>Kaart laden…</span> : null}
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span
        className="inline-block h-2.5 w-2.5 rounded-full border border-white"
        style={{ backgroundColor: color }}
        aria-hidden
      />
      {label}
    </span>
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
