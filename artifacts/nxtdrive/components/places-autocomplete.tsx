"use client";

// ---------------------------------------------------------------------------
// Fase 3 — Route Intelligence: Google Places address autocomplete.
//
// Captures a precise pickup/location: formatted address + place_id + lat/lng.
// Graceful degradation is a first-class requirement — when
// NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is absent (or the script fails to load) this
// renders a plain text input and simply reports the typed text with null
// coordinates. The server still works: it falls back to free-text + Haversine
// + manual confirmation.
// ---------------------------------------------------------------------------
import * as React from "react";
import { Input } from "@/components/ui/input";
import { loadGoogleMaps, MAPS_KEY } from "@/lib/maps/loader";

export type ResolvedPlace = {
  address: string;
  placeId: string | null;
  lat: number | null;
  lng: number | null;
  formattedAddress: string | null;
};

export function PlacesAutocomplete({
  id,
  value,
  placeholder,
  country = "nl",
  types = ["geocode"],
  onChange,
  onResolve,
}: {
  id?: string;
  value: string;
  placeholder?: string;
  country?: string;
  /**
   * Google Places autocomplete result types. Defaults to "geocode" (full
   * addresses). Pass ["(cities)"] to suggest cities only.
   */
  types?: string[];
  /** Called on every keystroke with the raw text (coords become unknown). */
  onChange: (text: string) => void;
  /** Called when the user picks a suggestion (or types, with null coords). */
  onResolve: (place: ResolvedPlace) => void;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const onResolveRef = React.useRef(onResolve);
  onResolveRef.current = onResolve;

  React.useEffect(() => {
    let cancelled = false;
    if (!MAPS_KEY) return;
    void loadGoogleMaps().then((google) => {
      if (cancelled || !google || !inputRef.current) return;
      const ac = new google.maps.places.Autocomplete(inputRef.current, {
        fields: ["place_id", "formatted_address", "geometry"],
        types,
        componentRestrictions: { country },
      });
      ac.addListener("place_changed", () => {
        const place = ac.getPlace();
        const loc = place.geometry?.location;
        const address =
          place.formatted_address ?? inputRef.current?.value ?? "";
        onResolveRef.current({
          address,
          placeId: place.place_id ?? null,
          lat: loc ? loc.lat() : null,
          lng: loc ? loc.lng() : null,
          formattedAddress: place.formatted_address ?? null,
        });
      });
    });
    return () => {
      cancelled = true;
    };
  }, [country, types.join(",")]);

  return (
    <Input
      id={id}
      ref={inputRef}
      placeholder={placeholder}
      value={value}
      autoComplete="off"
      onChange={(e) => {
        const text = e.target.value;
        onChange(text);
        // Typing invalidates any previously resolved coordinates.
        onResolveRef.current({
          address: text,
          placeId: null,
          lat: null,
          lng: null,
          formattedAddress: null,
        });
      }}
    />
  );
}
