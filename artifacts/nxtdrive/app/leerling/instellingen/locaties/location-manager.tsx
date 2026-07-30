"use client";

import { useState, useTransition } from "react";
import { Home, MapPinned, Plus } from "lucide-react";
import {
  AddressAutocomplete,
  type AddressDraft,
} from "@/domains/maps/ui/address-autocomplete";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { saveStudentLocation, type SaveStudentLocationInput } from "./actions";

export type StudentLocationView = Readonly<{
  id: string;
  role: SaveStudentLocationInput["role"];
  label: string;
  formattedAddress: string;
  validationStatus: string;
  source: string;
}>;

export function LocationManager({
  locations,
}: {
  locations: readonly StudentLocationView[];
}) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [label, setLabel] = useState("Thuis");
  const [role, setRole] = useState<SaveStudentLocationInput["role"]>(
    "STUDENT_PICKUP_DEFAULT",
  );
  const [address, setAddress] = useState<AddressDraft | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  function save() {
    if (!address?.formattedAddress.trim() || !label.trim()) {
      setMessage("Vul een label en adres in.");
      return;
    }
    if (
      address.validationStatus === "MANUALLY_CONFIRMED" &&
      !address.changeReason?.trim()
    ) {
      setMessage(
        "Leg kort vast hoe je het handmatige adres hebt gecontroleerd.",
      );
      return;
    }
    startTransition(async () => {
      const result = await saveStudentLocation({
        label,
        role,
        formattedAddress: address.formattedAddress,
        street: address.street,
        houseNumber: address.houseNumber,
        houseNumberAddition: address.houseNumberAddition,
        postalCode: address.postalCode,
        city: address.city,
        region: address.region,
        countryCode: address.countryCode,
        latitude: address.coordinates?.latitude ?? null,
        longitude: address.coordinates?.longitude ?? null,
        source: address.source,
        provider: address.provider,
        providerPlaceId: address.providerPlaceId,
        validationStatus: address.validationStatus,
        changeReason: address.changeReason,
      });
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      setMessage("Locatie opgeslagen.");
      setEditing(false);
      setAddress(null);
    });
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        {locations.map((location) => (
          <article
            key={`${location.id}:${location.role}`}
            className="rounded-2xl border border-brand-border bg-card p-4 shadow-brand-card"
          >
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-primary/10 p-2 text-primary">
                {location.role === "STUDENT_HOME" ? (
                  <Home className="h-4 w-4" aria-hidden />
                ) : (
                  <MapPinned className="h-4 w-4" aria-hidden />
                )}
              </div>
              <div className="min-w-0">
                <h2 className="font-black text-foreground">{location.label}</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {location.formattedAddress}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] font-semibold">
                  <span className="rounded-full bg-muted px-2 py-1">
                    {roleLabel(location.role)}
                  </span>
                  <span className="rounded-full bg-muted px-2 py-1">
                    {validationLabel(location.validationStatus)}
                  </span>
                </div>
              </div>
            </div>
          </article>
        ))}
        {locations.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-brand-border p-6 text-center text-sm text-muted-foreground md:col-span-2">
            Nog geen locaties. Voeg je vaste ophaalpunt toe zodat een geplande
            les expliciet naar een gepubliceerde stop kan verwijzen.
          </div>
        ) : null}
      </div>

      {!editing ? (
        <Button type="button" onClick={() => setEditing(true)}>
          <Plus className="h-4 w-4" aria-hidden />
          Locatie toevoegen
        </Button>
      ) : (
        <section className="rounded-2xl border border-brand-border bg-card p-4 shadow-brand-card sm:p-5">
          <div className="mb-4 grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="location-label">Label</Label>
              <Input
                id="location-label"
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                placeholder="Bijvoorbeeld Thuis of Werk"
              />
            </div>
            <div>
              <Label htmlFor="location-role">Gebruik als</Label>
              <select
                id="location-role"
                value={role}
                onChange={(event) =>
                  setRole(
                    event.target.value as SaveStudentLocationInput["role"],
                  )
                }
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="STUDENT_PICKUP_DEFAULT">
                  Standaard ophaalpunt
                </option>
                <option value="STUDENT_DROPOFF_DEFAULT">
                  Standaard afzetpunt
                </option>
                <option value="STUDENT_HOME">Woonadres</option>
                <option value="STUDENT_FAVORITE">Extra locatie</option>
              </select>
            </div>
          </div>
          <AddressAutocomplete value={address} onChange={setAddress} />
          <div className="mt-5 flex flex-wrap gap-2">
            <Button type="button" onClick={save} disabled={pending}>
              {pending ? "Opslaan…" : "Locatie opslaan"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setEditing(false)}
              disabled={pending}
            >
              Annuleren
            </Button>
          </div>
          {message ? (
            <p className="mt-3 text-sm text-muted-foreground" role="status">
              {message}
            </p>
          ) : null}
        </section>
      )}
    </div>
  );
}

function roleLabel(role: StudentLocationView["role"]) {
  return (
    {
      STUDENT_HOME: "Woonadres",
      STUDENT_PICKUP_DEFAULT: "Standaard ophalen",
      STUDENT_DROPOFF_DEFAULT: "Standaard afzetten",
      STUDENT_FAVORITE: "Extra locatie",
    } as const
  )[role];
}

function validationLabel(status: string) {
  return (
    (
      {
        VALID: "Gevalideerd",
        MANUALLY_CONFIRMED: "Zelf bevestigd",
        REVIEW_REQUIRED: "Controle nodig",
        PARTIAL: "Deels gecontroleerd",
        INVALID: "Ongeldig",
        UNVALIDATED: "Nog controleren",
      } as Record<string, string>
    )[status] ?? status
  );
}
