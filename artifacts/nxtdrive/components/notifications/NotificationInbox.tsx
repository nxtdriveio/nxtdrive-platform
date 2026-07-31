"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, Check, CheckCheck, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/notifications/actions";
import type { InAppNotification } from "@/lib/notifications/types";
import { cn } from "@/lib/utils";

function dateLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("nl-NL", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function NotificationInbox({
  items: initialItems,
  unreadCount: initialUnreadCount,
}: {
  items: InAppNotification[];
  unreadCount: number;
}) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setItems(initialItems);
    setUnreadCount(initialUnreadCount);
  }, [initialItems, initialUnreadCount]);

  function markOne(id: string) {
    const notification = items.find((item) => item.id === id);
    if (!notification || notification.readAt) return;

    setError(null);
    setItems((current) =>
      current.map((item) =>
        item.id === id ? { ...item, readAt: new Date().toISOString() } : item,
      ),
    );
    setUnreadCount((current) => Math.max(0, current - 1));
    startTransition(async () => {
      const result = await markNotificationRead(id);
      if (result.error) {
        setError("De melding kon niet als gelezen worden gemarkeerd.");
      }
      router.refresh();
    });
  }

  function markAll() {
    if (unreadCount === 0) return;

    setError(null);
    const readAt = new Date().toISOString();
    setItems((current) =>
      current.map((item) => (item.readAt ? item : { ...item, readAt })),
    );
    setUnreadCount(0);
    startTransition(async () => {
      const result = await markAllNotificationsRead();
      if (result.error) {
        setError("De meldingen konden niet als gelezen worden gemarkeerd.");
      }
      router.refresh();
    });
  }

  return (
    <section className="overflow-hidden rounded-[1.35rem] border border-border/80 bg-card shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/80 px-4 py-3.5">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
            <Bell className="h-4 w-4" aria-hidden />
          </span>
          <div>
            <h2 className="text-sm font-bold text-foreground">Alle meldingen</h2>
            <p className="text-xs text-muted-foreground">
              {unreadCount === 0
                ? "Je bent helemaal bij."
                : `${unreadCount} ongelezen melding${unreadCount === 1 ? "" : "en"}`}
            </p>
          </div>
        </div>
        {unreadCount > 0 ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={markAll}
            disabled={pending}
          >
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <CheckCheck className="h-4 w-4" aria-hidden />
            )}
            Alles gelezen
          </Button>
        ) : null}
      </div>

      {error ? (
        <p className="border-b border-border/80 bg-danger/5 px-4 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}

      {items.length === 0 ? (
        <div className="px-4 py-10 text-center">
          <p className="text-sm font-semibold text-foreground">Geen meldingen</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Nieuwe updates over planning, lessen en acties verschijnen hier.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border/80">
          {items.map((item) => {
            const content = (
              <>
                <span
                  className={cn(
                    "mt-2 h-2.5 w-2.5 shrink-0 rounded-full",
                    item.readAt ? "bg-transparent" : "bg-primary",
                  )}
                  aria-hidden
                />
                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      "block text-sm text-foreground",
                      item.readAt ? "font-medium" : "font-bold",
                    )}
                  >
                    {item.title}
                  </span>
                  {item.body ? (
                    <span className="mt-1 block text-sm leading-6 text-muted-foreground">
                      {item.body}
                    </span>
                  ) : null}
                  <span className="mt-1.5 block text-xs text-muted-foreground">
                    {dateLabel(item.createdAt)}
                  </span>
                </span>
              </>
            );

            return (
              <li
                key={item.id}
                className={cn(
                  "flex items-start gap-3 px-4 py-3.5",
                  !item.readAt && "bg-primary/[0.035]",
                )}
              >
                {item.link ? (
                  <Link
                    href={item.link}
                    className="flex min-w-0 flex-1 items-start gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => markOne(item.id)}
                  >
                    {content}
                  </Link>
                ) : (
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    {content}
                  </div>
                )}
                {!item.readAt ? (
                  <button
                    type="button"
                    onClick={() => markOne(item.id)}
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label={`Markeer ${item.title} als gelezen`}
                  >
                    <Check className="h-4 w-4" aria-hidden />
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
