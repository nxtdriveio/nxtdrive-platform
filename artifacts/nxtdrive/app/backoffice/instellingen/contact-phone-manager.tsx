"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { saveContactPhone } from "./actions";

export function ContactPhoneManager({ phone }: { phone: string | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [value, setValue] = useState(phone ?? "");

  function submit() {
    setError(null);
    setSaved(false);
    const fd = new FormData();
    fd.set("contact_phone", value.trim());
    startTransition(async () => {
      const res = await saveContactPhone(fd);
      if (!res.ok) {
        setError(res.error ?? "Er ging iets mis.");
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Het telefoonnummer dat leerlingen zien bij de &quot;Bel&quot;-knop in de
        app. Laat leeg om de belknop te verbergen.
      </p>
      <div className="space-y-1.5">
        <Label htmlFor="contact_phone">Contacttelefoonnummer</Label>
        <Input
          id="contact_phone"
          type="tel"
          inputMode="tel"
          placeholder="+31 6 12345678"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      </div>
      {error ? (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      ) : null}
      {saved ? (
        <p className="text-sm text-green-600 dark:text-green-400">Opgeslagen.</p>
      ) : null}
      <Button type="button" onClick={submit} disabled={pending}>
        {pending ? "Opslaan…" : "Opslaan"}
      </Button>
    </div>
  );
}
