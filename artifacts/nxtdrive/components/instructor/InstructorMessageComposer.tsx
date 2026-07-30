"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import { sendChatMessageAction } from "@/lib/chat/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function InstructorMessageComposer({
  conversationId,
}: {
  conversationId: string;
}) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = draft.trim();
    if (!body || pending) return;

    setError(null);
    startTransition(async () => {
      const result = await sendChatMessageAction(conversationId, body);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setDraft("");
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      {error ? (
        <p
          role="alert"
          className="rounded-xl border border-danger/30 bg-danger/5 px-3 py-2 text-xs text-danger"
        >
          {error}
        </p>
      ) : null}
      <div className="flex items-center gap-2 rounded-2xl border border-brand-border bg-white p-2">
        <Input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Typ een bericht..."
          maxLength={4000}
          className="border-0 shadow-none focus-visible:ring-0"
        />
        <Button
          type="submit"
          size="icon"
          disabled={pending || draft.trim() === ""}
          aria-label="Verzenden"
        >
          <Send className="h-4 w-4" aria-hidden />
        </Button>
      </div>
    </form>
  );
}
