"use client";

import { useState, useTransition } from "react";
import { Sparkles, Info, RefreshCw } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  generateLessonReportAction,
  saveLessonProgressSummaryAction,
} from "@/app/instructor/ai-actions";

/**
 * Leskaart L6 — AI-lesverslag. Short instructor notes → polished NL draft that is
 * fully editable. The draft is only persisted when the instructor explicitly
 * saves it (as a lesnotitie via the existing flow); the AI output itself is never
 * auto-saved.
 */
export function AiLessonReport({ lessonId }: { lessonId: string }) {
  const [notes, setNotes] = useState("");
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [generating, startGenerate] = useTransition();
  const [saving, startSave] = useTransition();

  function generate() {
    setError(null);
    setSaved(false);
    startGenerate(async () => {
      const fd = new FormData();
      fd.set("lesson_id", lessonId);
      fd.set("notes", notes);
      const res = await generateLessonReportAction(fd);
      if (res.error) setError(res.error);
      else setDraft(res.report ?? "");
    });
  }

  function save() {
    if (!draft || !draft.trim()) return;
    setError(null);
    startSave(async () => {
      const fd = new FormData();
      fd.set("lesson_id", lessonId);
      fd.set("summary", draft.trim());
      const res = await saveLessonProgressSummaryAction(fd);
      if (res?.error) {
        setError(res.error);
      } else {
        setSaved(true);
      }
    });
  }

  const busy = generating || saving;

  return (
    <Card>
      <CardContent className="space-y-3 pt-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
            <Sparkles className="h-4 w-4" aria-hidden />
            AI-lesverslag
          </div>
          <Badge variant="default">Advies</Badge>
        </div>

        <p className="text-xs text-muted-foreground">
          Schrijf een paar steekwoorden — de AI maakt er een net concept-verslag
          van dat je daarna kunt aanpassen of negeren.
        </p>

        <div className="space-y-1.5">
          <Label htmlFor="ai-notes">Korte notities</Label>
          <Textarea
            id="ai-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            maxLength={4000}
            placeholder="bv. eerste keer invoegen snelweg, spiegels nog onzeker, parkeren ging goed"
          />
        </div>

        <div className="flex justify-end">
          <Button
            type="button"
            size="sm"
            onClick={generate}
            disabled={busy || !notes.trim()}
          >
            {draft != null ? (
              <RefreshCw className="h-4 w-4" aria-hidden />
            ) : (
              <Sparkles className="h-4 w-4" aria-hidden />
            )}
            {generating
              ? "Bezig…"
              : draft != null
                ? "Opnieuw genereren"
                : "Genereer concept"}
          </Button>
        </div>

        {error ? (
          <div className="rounded-md border border-danger/40 bg-danger/5 px-3 py-2 text-xs text-danger">
            {error}
          </div>
        ) : null}

        {saved ? (
          <div className="rounded-md border border-success/40 bg-success/5 px-3 py-2 text-xs text-success">
            Voortgangstoelichting opgeslagen.
          </div>
        ) : null}

        {draft != null ? (
          <div className="space-y-2">
            <Label htmlFor="ai-draft">Concept-verslag (bewerkbaar)</Label>
            <Textarea
              id="ai-draft"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={8}
              maxLength={4000}
            />
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setDraft(null)}
                disabled={busy}
              >
                Verwerpen
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={save}
                disabled={busy || !draft.trim()}
              >
                {saving ? "Opslaan…" : "Opslaan als voortgangstoelichting"}
              </Button>
            </div>
          </div>
        ) : null}

        <p className="flex gap-1.5 text-xs text-muted-foreground">
          <Info className="h-3.5 w-3.5 shrink-0" aria-hidden />
          AI-gegenereerd advies. Controleer en pas aan voor je het opslaat — de
          instructeur beslist.
        </p>
      </CardContent>
    </Card>
  );
}
