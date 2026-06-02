"use client";

// ---------------------------------------------------------------------------
// Fase 3 — Shared Google Maps JS loader.
//
// A single, process-wide loader so every client component (places autocomplete,
// the trial route map) shares one script tag and one in-flight promise. Loading
// the script twice triggers Google's "included multiple times" warning, so this
// must be the only place that injects the Maps JS API.
//
// Graceful degradation is a first-class requirement: when
// NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is absent (or the script fails to load) every
// path resolves to null and callers render their non-map fallback.
// ---------------------------------------------------------------------------

export const MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

// Minimal structural typing for the bits of the Maps JS API we touch. Avoids a
// dependency on @types/google.maps while keeping callers type-safe.
export type GooglePlace = {
  place_id?: string;
  formatted_address?: string;
  geometry?: { location?: { lat: () => number; lng: () => number } };
};

export type GoogleAutocomplete = {
  addListener: (event: string, handler: () => void) => void;
  getPlace: () => GooglePlace;
};

export type GoogleLatLng = { lat: number; lng: number };

export type GoogleMarker = {
  setMap: (map: unknown | null) => void;
  addListener: (event: string, handler: () => void) => void;
};

export type GoogleInfoWindow = {
  open: (opts: { anchor?: unknown; map?: unknown }) => void;
  setContent: (content: string) => void;
  close: () => void;
};

export type GoogleMap = {
  fitBounds: (bounds: unknown, padding?: number) => void;
  setCenter: (latLng: GoogleLatLng) => void;
  setZoom: (zoom: number) => void;
};

export type GoogleBounds = {
  extend: (latLng: GoogleLatLng) => void;
  isEmpty: () => boolean;
  getCenter: () => { lat: () => number; lng: () => number };
};

export type GoogleMaps = {
  maps: {
    // With loading=async the constructors below are only populated once the
    // matching library has been pulled via importLibrary(); they are undefined
    // immediately after the bootstrap script's onload fires.
    importLibrary?: (name: string) => Promise<Record<string, unknown>>;
    Map?: new (el: HTMLElement, opts: Record<string, unknown>) => GoogleMap;
    Marker?: new (opts: Record<string, unknown>) => GoogleMarker;
    InfoWindow?: new (opts: Record<string, unknown>) => GoogleInfoWindow;
    LatLngBounds?: new () => GoogleBounds;
    Size?: new (w: number, h: number) => unknown;
    Point?: new (x: number, y: number) => unknown;
    places: {
      Autocomplete: new (
        input: HTMLInputElement,
        opts: {
          fields: string[];
          types?: string[];
          componentRestrictions?: { country: string | string[] };
        },
      ) => GoogleAutocomplete;
    };
  };
};

// The official Google Maps "bootstrap" loader. Plain `<script ...&loading=async>`
// fires `onload` BEFORE google.maps (and importLibrary) are usable, so we install
// the bootstrap stub instead. It defines google.maps.importLibrary synchronously;
// the first importLibrary() call injects the real script and resolves once ready.
// See https://developers.google.com/maps/documentation/javascript/load-maps-js-api
function installBootstrap(key: string) {
  /* eslint-disable */
  // prettier-ignore
  (g => {
    // @ts-ignore
    var h,a,k,p="The Google Maps JavaScript API",c="google",l="importLibrary",q="__ib__",m=document,b=window;b=b[c]||(b[c]={});var d=b.maps||(b.maps={}),r=new Set,e=new URLSearchParams,u=()=>h||(h=new Promise(async(f,n)=>{await(a=m.createElement("script"));e.set("libraries",[...r]+"");for(k in g)e.set(k.replace(/[A-Z]/g,t=>"_"+t[0].toLowerCase()),g[k]);e.set("callback",c+".maps."+q);a.src=`https://maps.${c}apis.com/maps/api/js?`+e;d[q]=f;a.onerror=()=>h=n(Error(p+" could not load."));a.nonce=m.querySelector("script[nonce]")?.nonce||"";m.head.append(a)}));d[l]?console.warn(p+" only loads once. Ignoring:",g):d[l]=(f,...n)=>r.add(f)&&u().then(()=>d[l](f,...n))})({ key, v: "weekly" });
  /* eslint-enable */
}

// Libraries both callers depend on (places = autocomplete; maps/marker/core =
// the trial route map). Loaded together once so every consumer shares one script
// and the returned google.maps namespace has all constructors populated.
const REQUIRED_LIBRARIES = ["places", "maps", "marker", "core"] as const;

let scriptPromise: Promise<GoogleMaps | null> | null = null;

// Google calls window.gm_authFailure on auth/activation problems (invalid key,
// billing off, Maps JavaScript API not enabled, referrer not allowed). It then
// paints an "Oops!" overlay inside every map div. We capture it so callers can
// hide the map and fall back to their non-map UI instead of showing that box.
let authFailed = false;
const authListeners = new Set<() => void>();

export function isMapsAuthFailed(): boolean {
  return authFailed;
}

export function onMapsAuthFailure(cb: () => void): () => void {
  authListeners.add(cb);
  return () => authListeners.delete(cb);
}

function installAuthFailureHook() {
  const w = window as unknown as { gm_authFailure?: () => void };
  if (w.gm_authFailure) return;
  w.gm_authFailure = () => {
    authFailed = true;
    for (const cb of authListeners) cb();
  };
}

export function loadGoogleMaps(): Promise<GoogleMaps | null> {
  if (typeof window === "undefined" || !MAPS_KEY) return Promise.resolve(null);
  if (scriptPromise) return scriptPromise;

  scriptPromise = (async () => {
    try {
      installAuthFailureHook();
      const w = window as unknown as { google?: GoogleMaps };
      if (typeof w.google?.maps?.importLibrary !== "function") {
        installBootstrap(MAPS_KEY);
      }
      const importLibrary = (window as unknown as { google?: GoogleMaps }).google
        ?.maps?.importLibrary;
      if (typeof importLibrary !== "function") return null;
      await Promise.all(REQUIRED_LIBRARIES.map((lib) => importLibrary(lib)));
      return (window as unknown as { google?: GoogleMaps }).google ?? null;
    } catch {
      return null;
    }
  })();
  return scriptPromise;
}
