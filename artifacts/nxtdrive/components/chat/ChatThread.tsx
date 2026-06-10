"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  sendChatMessageAction,
  fetchChatMessagesAction,
} from "@/lib/chat/actions";
import type { ChatMessage, ChatSide } from "@/lib/chat/types";
import { createNlDateTimeFormatter } from "@/lib/datetime";

const POLL_MS = 5000;

const timeFmt = createNlDateTimeFormatter({
  hour: "2-digit",
  minute: "2-digit",
});
const dayFmt = createNlDateTimeFormatter({
  weekday: "long",
  day: "numeric",
  month: "long",
});

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

export function ChatThread({
  conversationId,
  side,
  counterpartName,
  initialMessages,
}: {
  conversationId: string;
  side: ChatSide;
  counterpartName: string;
  initialMessages: ChatMessage[];
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const scrollRef = useRef<HTMLDivElement>(null);
  const seenIds = useRef<Set<string>>(
    new Set(initialMessages.map((m) => m.id)),
  );

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const mergeIncoming = useCallback((incoming: ChatMessage[]) => {
    if (incoming.length === 0) return;
    setMessages((prev) => {
      const fresh = incoming.filter((m) => !seenIds.current.has(m.id));
      if (fresh.length === 0) return prev;
      for (const m of fresh) seenIds.current.add(m.id);
      return [...prev, ...fresh].sort((a, b) =>
        a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0,
      );
    });
  }, []);

  // Near-realtime via polling: fetch only messages newer than the last we have.
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      const last = messages[messages.length - 1]?.createdAt ?? null;
      try {
        const res = await fetchChatMessagesAction(conversationId, last);
        if (!cancelled) mergeIncoming(res.messages);
      } catch {
        // best-effort polling; ignore transient errors
      }
    };
    const id = setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [conversationId, messages, mergeIncoming]);

  function send() {
    const body = draft.trim();
    if (!body || pending) return;
    setError(null);
    startTransition(async () => {
      const res = await sendChatMessageAction(conversationId, body);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setDraft("");
      mergeIncoming([res.message]);
    });
  }

  let lastDay = "";

  return (
    <div className="flex h-[calc(100dvh-13rem)] min-h-[24rem] flex-col rounded-lg border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">
          Gesprek met
        </p>
        <p className="font-semibold text-foreground">{counterpartName}</p>
      </div>

      <div
        ref={scrollRef}
        className="flex-1 space-y-2 overflow-y-auto px-4 py-4"
      >
        {messages.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Nog geen berichten. Stuur het eerste bericht hieronder.
          </p>
        ) : null}
        {messages.map((m) => {
          const mine = m.senderSide === side;
          const dk = dayKey(m.createdAt);
          const showDay = dk !== lastDay;
          lastDay = dk;
          return (
            <div key={m.id}>
              {showDay ? (
                <div className="my-3 text-center text-xs text-muted-foreground">
                  {dayFmt.format(new Date(m.createdAt))}
                </div>
              ) : null}
              <div
                className={`flex ${mine ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                    mine
                      ? "rounded-br-sm bg-primary text-primary-foreground"
                      : "rounded-bl-sm bg-muted text-foreground"
                  }`}
                >
                  <p className="whitespace-pre-wrap break-words">{m.body}</p>
                  <p
                    className={`mt-1 text-right text-[10px] ${
                      mine
                        ? "text-primary-foreground/70"
                        : "text-muted-foreground"
                    }`}
                  >
                    {timeFmt.format(new Date(m.createdAt))}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="border-t border-border p-3">
        {error ? (
          <p className="mb-2 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-300">
            {error}
          </p>
        ) : null}
        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            rows={1}
            placeholder="Typ een bericht…"
            maxLength={4000}
            className="max-h-32 min-h-[2.5rem] flex-1 resize-none rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
          />
          <Button
            type="button"
            size="icon"
            onClick={send}
            disabled={pending || draft.trim() === ""}
            aria-label="Verzenden"
          >
            <Send className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      </div>
    </div>
  );
}
