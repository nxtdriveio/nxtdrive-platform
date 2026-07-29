"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, CircleAlert, Loader2, Plus } from "lucide-react";
import { addInstructorStudentCredits } from "@/app/instructeur/leerlingen/actions";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { formatTegoed } from "@/lib/students/types";

export function InstructorCreditManager({
  studentId,
  studentName,
  balanceMinutes,
}: {
  studentId: string;
  studentName: string;
  balanceMinutes: number;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function submit(formData: FormData) {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const result = await addInstructorStudentCredits(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }

      const hours = String(formData.get("hours") ?? "");
      setSuccess(`${hours.replace(".", ",")} uur toegevoegd.`);
      formRef.current?.reset();
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-brand-border bg-brand-muted/45 p-4">
        <p className="text-xs font-bold uppercase text-muted-foreground">
          Beschikbaar
        </p>
        <p className="mt-1 text-2xl font-black text-foreground">
          {formatTegoed(balanceMinutes)}
        </p>
      </div>

      <form ref={formRef} action={submit} className="space-y-3">
        <input type="hidden" name="student_id" value={studentId} />
        <div className="space-y-1.5">
          <Label htmlFor={`credit-hours-${studentId}`}>Uren toevoegen</Label>
          <Input
            id={`credit-hours-${studentId}`}
            name="hours"
            type="number"
            min="0.25"
            max="100"
            step="0.25"
            required
            placeholder="Bijv. 2,5"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`credit-note-${studentId}`}>Reden</Label>
          <Input
            id={`credit-note-${studentId}`}
            name="note"
            required
            maxLength={200}
            placeholder={`Bijv. extra tegoed voor ${studentName}`}
          />
        </div>

        {error ? (
          <p className="flex items-start gap-2 text-sm text-danger">
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            {error}
          </p>
        ) : null}
        {success ? (
          <p className="flex items-start gap-2 text-sm text-success">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            {success}
          </p>
        ) : null}

        <Button type="submit" size="sm" disabled={pending} className="w-full">
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Plus className="h-4 w-4" aria-hidden />
          )}
          Tegoed toevoegen
        </Button>
      </form>
    </div>
  );
}
