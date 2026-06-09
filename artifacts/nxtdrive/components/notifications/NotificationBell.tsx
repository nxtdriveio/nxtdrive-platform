"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, Check, CheckCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/notifications/actions";
import type { InAppNotification } from "@/lib/notifications/types";

function relativeNL(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Date.now() - then;
  const min = Math.round(diff / 60000);
  if (min < 1) return "zojuist";
  if (min < 60) return `${min} min geleden`;
  const hrs = Math.round(min / 60);
  if (hrs < 24) return `${hrs} uur geleden`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days} ${days === 1 ? "dag" : "dagen"} geleden`;
  return new Intl.DateTimeFormat("nl-NL", {
    day: "numeric",
    month: "short",
  }).format(new Date(iso));
}

/**
 * Notificatiebel met ongelezen-teller en dropdown-overzicht. Server-gerenderde
 * begintoestand (items + unreadCount) wordt lokaal optimistisch bijgewerkt bij
 * markeren-als-gelezen, met een router.refresh om de server-staat te synchronen.
 * Werkt identiek in de student-PWA, instructeur-PWA en backoffice — de RPC's
 * achter de acties valideren eigenaarschap, dus de bel toont/raakt alleen de
 * eigen meldingen van de ingelogde gebruiker.
 */
export function NotificationBell({
  items: initialItems,
  unreadCount: initialUnread,
  variant = "default",
  viewAllHref,
}: {
  items: InAppNotification[];
  unreadCount: number;
  variant?: "default" | "floating";
  viewAllHref?: string;
}) {
  const router = useRouter();
  const floating = variant === "floating";
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState(initialItems);
  const [unread, setUnread] = useState(initialUnread);
  const [, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setItems(initialItems);
    setUnread(initialUnread);
  }, [initialItems, initialUnread]);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  function markOne(id: string) {
    setItems((prev) =>
      prev.map((n) =>
        n.id === id && !n.readAt
          ? { ...n, readAt: new Date().toISOString() }
          : n,
      ),
    );
    setUnread((u) => {
      const was = items.find((n) => n.id === id);
      return was && !was.readAt ? Math.max(0, u - 1) : u;
    });
    startTransition(async () => {
      await markNotificationRead(id);
      router.refresh();
    });
  }

  function markAll() {
    setItems((prev) =>
      prev.map((n) =>
        n.readAt ? n : { ...n, readAt: new Date().toISOString() },
      ),
    );
    setUnread(0);
    startTransition(async () => {
      await markAllNotificationsRead();
      router.refresh();
    });
  }

  const badge = unread > 99 ? "99+" : String(unread);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Meldingen"
        aria-haspopup="true"
        aria-expanded={open}
        className={cn(
          "relative inline-flex items-center justify-center transition active:scale-95",
          floating
            ? "h-10 w-10 rounded-full border border-border/60 bg-card/75 text-foreground shadow-2xl shadow-black/10 backdrop-blur-2xl hover:bg-card/90"
            : "h-10 w-10 rounded-xl border border-border/80 bg-card text-muted-foreground shadow-sm hover:bg-muted hover:text-foreground",
        )}
      >
        <Bell className={cn(floating ? "h-5 w-5" : "h-4 w-4")} aria-hidden />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 inline-flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-4 text-primary-foreground">
            {badge}
          </span>
        )}
      </button>

      {open && (
        <div
          className={cn(
            "absolute right-0 z-50 mt-3 w-80 max-w-[calc(100vw-2rem)] overflow-hidden text-popover-foreground",
            floating
              ? "rounded-[1.75rem] border border-border/60 bg-popover/80 shadow-2xl shadow-black/20 backdrop-blur-2xl"
              : "rounded-[1.35rem] border border-border/80 bg-popover shadow-2xl shadow-black/10",
          )}
        >
          <div
            className={cn(
              "flex items-center justify-between px-3 py-2",
              floating
                ? "border-b border-border/50 bg-background/20"
                : "border-b border-border/80 bg-card",
            )}
          >
            <span className="text-sm font-medium">Meldingen</span>
            <div className="flex items-center gap-3">
              {viewAllHref ? (
                <Link
                  href={viewAllHref}
                  className="text-xs font-semibold text-primary hover:underline"
                  onClick={() => setOpen(false)}
                >
                  Bekijk alles
                </Link>
              ) : null}
              {unread > 0 && (
                <button
                  type="button"
                  onClick={markAll}
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  <CheckCheck className="h-3.5 w-3.5" aria-hidden />
                  Alles gelezen
                </button>
              )}
            </div>
          </div>

          <ul
            className={cn(
              "max-h-96 overflow-y-auto",
              floating ? "divide-y divide-border/50" : "divide-y divide-border",
            )}
          >
            {items.length === 0 && (
              <li className="px-3 py-6 text-center text-sm text-muted-foreground">
                Geen meldingen
              </li>
            )}
            {items.map((n) => {
              const inner = (
                <div className="flex items-start gap-2">
                  <span
                    className={cn(
                      "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                      n.readAt ? "bg-transparent" : "bg-primary",
                    )}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <div
                      className={cn(
                        "truncate text-sm",
                        n.readAt
                          ? "font-normal text-foreground"
                          : "font-semibold text-foreground",
                      )}
                    >
                      {n.title}
                    </div>
                    {n.body && (
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                        {n.body}
                      </p>
                    )}
                    <div className="mt-1 text-[11px] text-muted-foreground">
                      {relativeNL(n.createdAt)}
                    </div>
                  </div>
                  {!n.readAt && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        markOne(n.id);
                      }}
                      aria-label="Markeer als gelezen"
                      className={cn(
                        "shrink-0 rounded p-1 text-muted-foreground hover:text-foreground",
                        floating ? "hover:bg-muted/40" : "hover:bg-muted",
                      )}
                    >
                      <Check className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  )}
                </div>
              );

              const cls = cn(
                "block px-3 py-2.5 transition-colors",
                floating ? "hover:bg-muted/40" : "hover:bg-muted/60",
                !n.readAt && (floating ? "bg-primary/10" : "bg-muted/30"),
              );

              return (
                <li key={n.id}>
                  {n.link ? (
                    <Link
                      href={n.link}
                      className={cls}
                      onClick={() => {
                        if (!n.readAt) markOne(n.id);
                        setOpen(false);
                      }}
                    >
                      {inner}
                    </Link>
                  ) : (
                    <div className={cls}>{inner}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
