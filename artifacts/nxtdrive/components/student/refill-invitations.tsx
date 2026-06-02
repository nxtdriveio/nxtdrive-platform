"use client";

import { useState, useTransition } from "react";
import { CalendarClock, Check, MapPin, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { respondRefillInvitation } from "@/app/student/actions";
import type { RefillInvitation } from "@/lib/lesson-refill/invitations";

const dateTimeFmt = new Intl.DateTimeFormat("nl-NL", {
  weekday: "long",
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

function formatExpiry(iso: string): string {
  return new Intl.DateTimeFormat("nl-NL", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function RefillInvitations({
  invitations,
}: {
  invitations: RefillInvitation[];
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  if (invitations.length === 0) return null;

  function respond(id: string, response: "accept" | "decline") {
    const fd = new FormData();
    fd.set("invitation_id", id);
    fd.set("response", response);
    setError(null);
    setBusyId(id);
    startTransition(async () => {
      const res = await respondRefillInvitation(fd);
      setBusyId(null);
      if (res?.error) setError(res.error);
    });
  }

  return (
    <Card className="border-primary/40 bg-primary-soft/40">
      <CardContent className="space-y-3 pt-5">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-primary">
          <CalendarClock className="h-4 w-4" aria-hidden />
          Vrijgekomen lesmoment{invitations.length > 1 ? "en" : ""}
        </div>

        <p className="text-sm text-muted-foreground">
          Er is een lesmoment vrijgekomen. Bevestig je de les, dan wordt deze
          direct ingepland en je tegoed verrekend.
        </p>

        {error ? (
          <div className="rounded-md border border-danger/40 bg-danger/5 px-3 py-2 text-xs text-danger">
            {error}
          </div>
        ) : null}

        <ol className="space-y-2">
          {invitations.map((inv) => {
            const busy = pending && busyId === inv.id;
            return (
              <li
                key={inv.id}
                className="rounded-md border border-border bg-card/70 p-3"
              >
                <div className="space-y-1">
                  <div className="text-sm font-medium capitalize text-foreground">
                    {dateTimeFmt.format(new Date(inv.startsAt))}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Duur: {inv.durationMin} min
                  </div>
                  {inv.location ? (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      {inv.location}
                    </div>
                  ) : null}
                  <div className="text-xs text-muted-foreground">
                    Reageer vóór {formatExpiry(inv.expiresAt)}
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    disabled={busy}
                    onClick={() => respond(inv.id, "accept")}
                  >
                    <Check className="h-4 w-4" aria-hidden />
                    Bevestig les
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => respond(inv.id, "decline")}
                  >
                    <X className="h-4 w-4" aria-hidden />
                    Afwijzen
                  </Button>
                </div>
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}
