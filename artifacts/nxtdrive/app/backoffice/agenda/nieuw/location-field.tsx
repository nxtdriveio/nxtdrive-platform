"use client";

// Fase 3 — Route Intelligence: lesson location field backed by Google Places.
// A thin client wrapper over PlacesAutocomplete that holds the field state and
// emits hidden inputs (location + coordinates) for the server-component form.
// Degrades to a plain typed location (null coords) when Places is unavailable.
import * as React from "react";
import { Label } from "@/components/ui/input";
import { PlacesAutocomplete } from "@/components/places-autocomplete";

export function LessonLocationField() {
  const [text, setText] = React.useState("");
  const [lat, setLat] = React.useState("");
  const [lng, setLng] = React.useState("");
  const [placeId, setPlaceId] = React.useState("");

  return (
    <div className="space-y-1.5">
      <Label htmlFor="location">Locatie</Label>
      <PlacesAutocomplete
        id="location"
        placeholder="bv. Station Amersfoort"
        value={text}
        onChange={setText}
        onResolve={(place) => {
          setText(place.address);
          setLat(place.lat != null ? String(place.lat) : "");
          setLng(place.lng != null ? String(place.lng) : "");
          setPlaceId(place.placeId ?? "");
        }}
      />
      <input type="hidden" name="location" value={text} />
      <input type="hidden" name="location_lat" value={lat} />
      <input type="hidden" name="location_lng" value={lng} />
      <input type="hidden" name="location_place_id" value={placeId} />
    </div>
  );
}
