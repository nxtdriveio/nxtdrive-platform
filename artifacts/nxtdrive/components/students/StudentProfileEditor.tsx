"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil } from "lucide-react";
import { updateStudentContactProfile } from "@/app/backoffice/leerlingen/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import type { Student } from "@/lib/students/types";

export function StudentProfileEditor({ student }: { student: Student }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await updateStudentContactProfile(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        <Pencil className="h-4 w-4" aria-hidden />
        Gegevens bewerken
      </Button>

      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (!pending) {
            setError(null);
            setOpen(nextOpen);
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Leerlinggegevens bewerken</DialogTitle>
            <DialogDescription>
              Wijzig contact- en adresgegevens. Bij een gekoppeld portaalaccount
              wordt een gewijzigd e-mailadres ook als login bijgewerkt.
            </DialogDescription>
          </DialogHeader>

          <form action={submit} className="space-y-4">
            <input type="hidden" name="student_id" value={student.id} />

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="edit-student-name">Naam</Label>
                <Input
                  id="edit-student-name"
                  name="full_name"
                  required
                  maxLength={200}
                  defaultValue={student.full_name}
                  autoComplete="name"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-student-email">E-mailadres</Label>
                <Input
                  id="edit-student-email"
                  name="email"
                  type="email"
                  maxLength={320}
                  required={Boolean(student.user_id)}
                  defaultValue={student.email ?? ""}
                  autoComplete="email"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-student-phone">Telefoon</Label>
                <Input
                  id="edit-student-phone"
                  name="phone"
                  type="tel"
                  maxLength={30}
                  defaultValue={student.phone ?? ""}
                  autoComplete="tel"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-student-birth-date">Geboortedatum</Label>
                <Input
                  id="edit-student-birth-date"
                  name="birth_date"
                  type="date"
                  defaultValue={student.birth_date ?? ""}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-student-postcode">Postcode</Label>
                <Input
                  id="edit-student-postcode"
                  name="postcode"
                  maxLength={10}
                  defaultValue={student.postcode ?? ""}
                  autoComplete="postal-code"
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="edit-student-address">Adres</Label>
                <Input
                  id="edit-student-address"
                  name="address_line"
                  maxLength={240}
                  defaultValue={student.address_line ?? ""}
                  autoComplete="street-address"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-student-city">Woonplaats</Label>
                <Input
                  id="edit-student-city"
                  name="city"
                  maxLength={160}
                  defaultValue={student.city ?? ""}
                  autoComplete="address-level2"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-student-pickup">Ophaaladres</Label>
                <Input
                  id="edit-student-pickup"
                  name="pickup_address"
                  maxLength={240}
                  defaultValue={student.pickup_address ?? ""}
                />
              </div>
            </div>

            {error ? (
              <div className="rounded-xl border border-danger/30 bg-danger/5 p-3 text-sm text-danger">
                {error}
              </div>
            ) : null}

            <DialogFooter className="flex-col-reverse sm:flex-row">
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => setOpen(false)}
                className="min-h-11"
              >
                Annuleren
              </Button>
              <Button type="submit" disabled={pending} className="min-h-11">
                {pending ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : null}
                Wijzigingen opslaan
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
