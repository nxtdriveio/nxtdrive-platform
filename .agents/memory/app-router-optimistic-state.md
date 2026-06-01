---
name: App Router optimistic client state
description: Why optimistic client UIs (drag/drop boards, lists) must reconcile from server props and roll back via snapshot, not router.refresh alone.
---

A `"use client"` component's `useState` survives Next.js App Router navigations
(`router.refresh()`, `?searchParam=` changes) and server-action `revalidatePath`
re-renders. The component is NOT remounted, so state initialized once from props
goes stale.

**Rule:** an optimistic board/list seeded from server props must reconcile when
props change. Track a signature of *every render-affecting field* (not just
id/order) and `setBoard(...)` in a `useEffect` when it changes. A signature that
only covers ordering will miss content edits (title, priority, assignee, …).

**Why:** server actions revalidate and return fresh props, but identical-looking
nav (refresh) won't change a too-narrow signature, so the UI silently keeps old
data.

**How to apply (drag/drop rollback):** `router.refresh()` does NOT change server
data, so it can't undo a failed optimistic move via the signature effect. Snapshot
state at drag start (a ref) and `setBoard(snapshot)` on mutation failure, then
refresh for eventual consistency. Don't rely on refresh alone to roll back.
