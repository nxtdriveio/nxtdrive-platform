"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createNlDateTimeFormatter } from "@/lib/datetime";
import {
  fetchChatMessagesAction,
  sendChatMessageAction,
} from "@/lib/chat/actions";
import type { ChatMessage, ChatSide } from "@/lib/chat/types";
import { cn } from "@/lib/utils";

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

function initialsFor(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function ChatThread({
  conversationId,
  side,
  counterpartName,
  initialMessages,
  appearance = "student",
  showHeader = true,
}: {
  conversationId: string;
  side: ChatSide;
  counterpartName: string;
  initialMessages: ChatMessage[];
  appearance?: "student" | "instructor";
  showHeader?: boolean;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const scrollRef = useRef<HTMLDivElement>(null);
  const seenIds = useRef<Set<string>>(
    new Set(initialMessages.map((message) => message.id)),
  );

  const scrollToBottom = useCallback(() => {
    const element = scrollRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const mergeIncoming = useCallback((incoming: ChatMessage[]) => {
    if (incoming.length === 0) return;
    setMessages((previous) => {
      const fresh = incoming.filter(
        (message) => !seenIds.current.has(message.id),
      );
      if (fresh.length === 0) return previous;
      for (const message of fresh) seenIds.current.add(message.id);
      return [...previous, ...fresh].sort((left, right) =>
        left.createdAt < right.createdAt
          ? -1
          : left.createdAt > right.createdAt
            ? 1
            : 0,
      );
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      const last = messages[messages.length - 1]?.createdAt ?? null;
      try {
        const result = await fetchChatMessagesAction(conversationId, last);
        if (!cancelled) mergeIncoming(result.messages);
      } catch {
        // Best-effort polling: ignore transient errors and keep the thread usable.
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
      const result = await sendChatMessageAction(conversationId, body);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setDraft("");
      mergeIncoming([result.message]);
    });
  }

  let lastDay = "";
  const instructorAppearance = appearance === "instructor";

  return (
    <div
      data-chat-thread=""
      className={cn(
        "flex flex-col overflow-hidden",
        instructorAppearance
          ? "min-h-0 flex-1 bg-white"
          : "h-[min(34rem,calc(100dvh-12.5rem))] min-h-[24rem] rounded-[1.55rem] border border-white/10 bg-[linear-gradient(180deg,rgba(18,18,33,0.96),rgba(10,10,22,0.98))] shadow-[0_24px_60px_rgba(2,3,10,0.38)]",
      )}
    >
      {showHeader ? (
        <div
          className={cn(
            "flex items-center gap-3 px-4 py-3.5",
            instructorAppearance
              ? "border-b border-brand-border"
              : "border-b border-white/8",
          )}
        >
          <span
            className={cn(
              "grid h-10 w-10 shrink-0 place-items-center rounded-full text-xs font-black",
              instructorAppearance
                ? "bg-brand-accent text-brand-primary"
                : "border border-white/10 bg-white/[0.06] text-white",
            )}
          >
            {initialsFor(counterpartName)}
          </span>
          <div className="min-w-0">
            <p
              className={cn(
                "text-[10px] font-semibold uppercase tracking-[0.2em]",
                instructorAppearance
                  ? "text-muted-foreground"
                  : "text-white/42",
              )}
            >
              Gesprek
            </p>
            <p
              className={cn(
                "truncate text-sm font-semibold",
                instructorAppearance ? "text-foreground" : "text-white",
              )}
            >
              {counterpartName}
            </p>
          </div>
        </div>
      ) : null}

      <div
        data-chat-messages=""
        ref={scrollRef}
        className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 py-4"
      >
        {messages.length === 0 ? (
          <div
            className={cn(
              "rounded-2xl border border-dashed p-5 text-center",
              instructorAppearance
                ? "border-brand-border bg-brand-muted/45"
                : "border-white/10 bg-white/[0.03]",
            )}
          >
            <p
              className={cn(
                "text-sm font-black",
                instructorAppearance ? "text-foreground" : "text-white",
              )}
            >
              Nog geen berichten
            </p>
            <p
              className={cn(
                "mt-1 text-xs",
                instructorAppearance
                  ? "text-muted-foreground"
                  : "text-white/46",
              )}
            >
              Stuur hieronder het eerste bericht. Nieuwe antwoorden verschijnen
              hier vanzelf.
            </p>
          </div>
        ) : null}

        {messages.map((message) => {
          const mine = message.senderSide === side;
          const currentDay = dayKey(message.createdAt);
          const showDay = currentDay !== lastDay;
          lastDay = currentDay;

          return (
            <div key={message.id}>
              {showDay ? (
                <div className="my-3 flex justify-center">
                  <span
                    className={cn(
                      "rounded-full border px-3 py-1 text-[11px]",
                      instructorAppearance
                        ? "border-brand-border bg-brand-muted text-muted-foreground"
                        : "border-white/10 bg-white/[0.04] text-white/46",
                    )}
                  >
                    {dayFmt.format(new Date(message.createdAt))}
                  </span>
                </div>
              ) : null}

              <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div
                  className={cn(
                    "max-w-[82%] rounded-[1.1rem] px-3.5 py-3 text-sm shadow-[0_12px_32px_rgba(0,0,0,0.14)]",
                    mine
                      ? "rounded-br-md bg-brand-primary text-white"
                      : instructorAppearance
                        ? "rounded-bl-md border border-brand-border bg-brand-muted text-foreground"
                        : "rounded-bl-md border border-white/10 bg-white/[0.04] text-white/88",
                  )}
                >
                  <p className="whitespace-pre-wrap break-words leading-6">
                    {message.body}
                  </p>
                  <p
                    className={cn(
                      "mt-1 text-right text-[10px]",
                      mine
                        ? "text-white/68"
                        : instructorAppearance
                          ? "text-muted-foreground"
                          : "text-white/34",
                    )}
                  >
                    {timeFmt.format(new Date(message.createdAt))}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div
        data-chat-composer=""
        className={cn(
          "shrink-0 border-t p-3",
          instructorAppearance
            ? "border-brand-border bg-white"
            : "border-white/8",
        )}
      >
        {error ? (
          <div className="mb-2 rounded-[1rem] border border-rose-400/24 bg-rose-500/[0.08] px-3 py-2 text-xs text-rose-200">
            {error}
          </div>
        ) : null}
        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                send();
              }
            }}
            rows={1}
            placeholder="Typ een bericht..."
            maxLength={4000}
            className={cn(
              "max-h-32 min-h-[2.75rem] flex-1 resize-none rounded-[1rem] border px-3.5 py-2.5 text-sm outline-none focus:border-primary",
              instructorAppearance
                ? "border-brand-border bg-white text-foreground placeholder:text-muted-foreground"
                : "border-white/10 bg-white/[0.03] text-white placeholder:text-white/30",
            )}
          />
          <Button
            type="button"
            size="icon"
            className="h-11 w-11 rounded-[1rem]"
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
