"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Check, Loader2, MapPin, Search, TriangleAlert } from "lucide-react";
import type {
  AutocompleteSuggestion,
  ResolvedPlace,
} from "../application/contracts";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

export type AddressDraft = Omit<
  ResolvedPlace,
  "provider" | "providerPlaceId" | "obtainedAt"
> & {
  provider: "GOOGLE" | null;
  providerPlaceId: string | null;
  source: "GOOGLE_PLACES" | "USER_ENTERED" | "USER_CONFIRMED";
  validationStatus:
    | "UNVALIDATED"
    | "VALID"
    | "PARTIAL"
    | "REVIEW_REQUIRED"
    | "MANUALLY_CONFIRMED"
    | "INVALID";
  changeReason: string | null;
};

const EMPTY_DRAFT: AddressDraft = {
  formattedAddress: "",
  street: null,
  houseNumber: null,
  houseNumberAddition: null,
  postalCode: null,
  city: null,
  region: null,
  countryCode: "NL",
  coordinates: null,
  provider: null,
  providerPlaceId: null,
  source: "USER_ENTERED",
  validationStatus: "UNVALIDATED",
  changeReason: null,
};

export function AddressAutocomplete({
  value,
  onChange,
  label = "Adres",
  surface,
}: {
  value?: AddressDraft | null;
  onChange: (value: AddressDraft) => void;
  label?: string;
  surface?: "INSTRUCTOR_APPOINTMENT_WIZARD";
}) {
  const listboxId = useId();
  const [draft, setDraft] = useState(value ?? EMPTY_DRAFT);
  const [query, setQuery] = useState(value?.formattedAddress ?? "");
  const [suggestions, setSuggestions] = useState<
    readonly AutocompleteSuggestion[]
  >([]);
  const [manual, setManual] = useState(!value?.providerPlaceId);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  const sessionToken = useRef(crypto.randomUUID());
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    if (manual || query.trim().length < 3 || query === draft.formattedAddress) {
      setSuggestions([]);
      return;
    }
    const timer = window.setTimeout(async () => {
      abort.current?.abort();
      abort.current = new AbortController();
      setBusy(true);
      setMessage(null);
      try {
        const response = await fetch("/api/maps/places", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: abort.current.signal,
          body: JSON.stringify({
            action: "autocomplete",
            query,
            sessionToken: sessionToken.current,
            correlationId: `address.${crypto.randomUUID()}`,
            surface,
          }),
        });
        const payload = (await response.json()) as {
          suggestions?: AutocompleteSuggestion[];
          error?: string;
        };
        if (!response.ok) throw new Error(payload.error ?? "Zoeken mislukt.");
        setSuggestions(payload.suggestions ?? []);
        setActiveIndex(-1);
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          setMessage(
            "Adreszoeken is tijdelijk niet beschikbaar. Handmatige invoer staat klaar.",
          );
          setManual(true);
        }
      } finally {
        setBusy(false);
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [draft.formattedAddress, manual, query, surface]);

  function update(next: AddressDraft) {
    setDraft(next);
    onChange(next);
  }

  async function selectSuggestion(suggestion: AutocompleteSuggestion) {
    setBusy(true);
    setSuggestions([]);
    try {
      const response = await fetch("/api/maps/places", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "resolve",
          providerReference: suggestion.providerReference,
          sessionToken: sessionToken.current,
          correlationId: `address.${crypto.randomUUID()}`,
          surface,
        }),
      });
      const payload = (await response.json()) as {
        place?: ResolvedPlace | null;
        error?: string;
      };
      if (!response.ok || !payload.place) {
        throw new Error(payload.error ?? "Adresdetails ontbreken.");
      }
      const next: AddressDraft = {
        ...payload.place,
        provider: "GOOGLE",
        source: "GOOGLE_PLACES",
        validationStatus: "UNVALIDATED",
        changeReason: null,
      };
      update(next);
      setQuery(next.formattedAddress);
      sessionToken.current = crypto.randomUUID();
      setMessage("Adres geselecteerd. Controleer de gegevens voor opslaan.");
    } catch {
      setMessage(
        "Adresdetails konden niet worden geladen. Vul het adres handmatig in.",
      );
      setManual(true);
    } finally {
      setBusy(false);
    }
  }

  function handleKeys(event: KeyboardEvent<HTMLInputElement>) {
    if (suggestions.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % suggestions.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) =>
        index <= 0 ? suggestions.length - 1 : index - 1,
      );
    } else if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      void selectSuggestion(suggestions[activeIndex]!);
    } else if (event.key === "Escape") {
      setSuggestions([]);
      setActiveIndex(-1);
    }
  }

  return (
    <fieldset className="space-y-3">
      <legend className="sr-only">{label}</legend>
      <div className="relative space-y-1.5">
        <Label htmlFor={`${listboxId}-input`}>{label}</Label>
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            id={`${listboxId}-input`}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              if (manual) {
                update({
                  ...draft,
                  formattedAddress: event.target.value,
                  provider: null,
                  providerPlaceId: null,
                  source: "USER_ENTERED",
                  validationStatus: "UNVALIDATED",
                });
              }
            }}
            onKeyDown={handleKeys}
            placeholder="Begin met typen, bijvoorbeeld straat en plaats"
            autoComplete="street-address"
            role="combobox"
            aria-autocomplete="list"
            aria-controls={listboxId}
            aria-expanded={suggestions.length > 0}
            aria-activedescendant={
              activeIndex >= 0 ? `${listboxId}-${activeIndex}` : undefined
            }
            className="pl-9 pr-10"
          />
          {busy ? (
            <Loader2
              className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-primary motion-reduce:animate-none"
              aria-label="Adres wordt geladen"
            />
          ) : null}
        </div>
        {suggestions.length > 0 ? (
          <ul
            id={listboxId}
            role="listbox"
            className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-border bg-popover p-1 shadow-xl"
          >
            {suggestions.map((suggestion, index) => (
              <li
                id={`${listboxId}-${index}`}
                key={suggestion.providerReference}
                role="option"
                aria-selected={activeIndex === index}
              >
                <button
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => void selectSuggestion(suggestion)}
                  className="flex min-h-11 w-full items-start gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-selected:bg-muted"
                >
                  <MapPin
                    className="mt-0.5 h-4 w-4 shrink-0 text-primary"
                    aria-hidden
                  />
                  <span className="min-w-0">
                    <span className="block font-semibold">
                      {suggestion.primaryText}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {suggestion.secondaryText}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => {
          setManual((current) => !current);
          setSuggestions([]);
          setMessage(null);
        }}
      >
        {manual ? "Adres zoeken" : "Handmatig invoeren"}
      </Button>

      {manual ? (
        <div className="grid gap-3 sm:grid-cols-6">
          <Field
            className="sm:col-span-4"
            label="Straat"
            value={draft.street ?? ""}
            onChange={(street) =>
              update({
                ...draft,
                street,
                formattedAddress: compose({ ...draft, street }),
                provider: null,
                providerPlaceId: null,
                source: "USER_ENTERED",
              })
            }
          />
          <Field
            label="Huisnummer"
            value={draft.houseNumber ?? ""}
            onChange={(houseNumber) =>
              update({
                ...draft,
                houseNumber,
                formattedAddress: compose({ ...draft, houseNumber }),
                provider: null,
                providerPlaceId: null,
                source: "USER_ENTERED",
              })
            }
          />
          <Field
            label="Toevoeging"
            value={draft.houseNumberAddition ?? ""}
            onChange={(houseNumberAddition) =>
              update({
                ...draft,
                houseNumberAddition,
                formattedAddress: compose({ ...draft, houseNumberAddition }),
                provider: null,
                providerPlaceId: null,
                source: "USER_ENTERED",
              })
            }
          />
          <Field
            className="sm:col-span-2"
            label="Postcode"
            value={draft.postalCode ?? ""}
            onChange={(postalCode) =>
              update({
                ...draft,
                postalCode: postalCode.toUpperCase(),
                formattedAddress: compose({
                  ...draft,
                  postalCode: postalCode.toUpperCase(),
                }),
                provider: null,
                providerPlaceId: null,
                source: "USER_ENTERED",
              })
            }
          />
          <Field
            className="sm:col-span-4"
            label="Plaats"
            value={draft.city ?? ""}
            onChange={(city) =>
              update({
                ...draft,
                city,
                formattedAddress: compose({ ...draft, city }),
                provider: null,
                providerPlaceId: null,
                source: "USER_ENTERED",
              })
            }
          />
          <div className="sm:col-span-6">
            <Label htmlFor={`${listboxId}-reason`}>
              Reden handmatige bevestiging
            </Label>
            <Input
              id={`${listboxId}-reason`}
              value={draft.changeReason ?? ""}
              onChange={(event) =>
                update({
                  ...draft,
                  changeReason: event.target.value,
                  source: "USER_CONFIRMED",
                  validationStatus: "MANUALLY_CONFIRMED",
                })
              }
              placeholder="Bijvoorbeeld: door mij gecontroleerd op de post"
            />
          </div>
        </div>
      ) : null}

      <div
        className="flex items-start gap-2 text-xs text-muted-foreground"
        role="status"
        aria-live="polite"
      >
        {message?.includes("niet") ? (
          <TriangleAlert
            className="mt-0.5 h-4 w-4 shrink-0 text-amber-500"
            aria-hidden
          />
        ) : (
          <Check
            className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600"
            aria-hidden
          />
        )}
        <span>
          {message ??
            "Je kunt altijd handmatig verder. Providerdata wordt pas na jouw controle opgeslagen."}
        </span>
      </div>
    </fieldset>
  );
}

function Field({
  label,
  value,
  onChange,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={className}>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function compose(draft: AddressDraft) {
  return [
    [draft.street, draft.houseNumber, draft.houseNumberAddition]
      .filter(Boolean)
      .join(" "),
    [draft.postalCode, draft.city].filter(Boolean).join(" "),
    draft.countryCode !== "NL" ? draft.countryCode : null,
  ]
    .filter(Boolean)
    .join(", ");
}
