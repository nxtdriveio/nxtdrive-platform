"use client";

import type { FormEvent } from "react";
import { LogOut } from "lucide-react";
import { clearEncryptedLessonDrafts } from "@/lib/offline/encrypted-draft-store";
import { clearEncryptedPublishedStops } from "@/lib/offline/encrypted-route-store";
import { cn } from "@/lib/utils";

export function SecureInstructorLogoutForm({
  className,
  icon = true,
}: {
  className?: string;
  icon?: boolean;
}) {
  async function handleLogout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    try {
      await Promise.all([
        clearEncryptedLessonDrafts(),
        clearEncryptedPublishedStops(),
      ]);
    } finally {
      form.submit();
    }
  }

  return (
    <form
      method="post"
      action="/auth/logout"
      className={cn("w-full", className)}
      onSubmit={(event) => void handleLogout(event)}
    >
      <button
        type="submit"
        className="flex min-h-11 w-full items-center gap-2 text-left font-bold text-danger"
      >
        {icon ? <LogOut className="h-4 w-4" aria-hidden /> : null}
        Uitloggen
      </button>
    </form>
  );
}
