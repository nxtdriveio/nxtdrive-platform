import Link from "next/link";
import { NxtdriveLogo } from "@/components/nxtdrive-logo";

export default function HomePage() {
  return (
    <main className="bg-nxt-grid relative min-h-screen overflow-hidden">
      <div className="mx-auto flex min-h-screen max-w-5xl flex-col items-center justify-center px-6 py-12 text-center">
        <NxtdriveLogo className="text-3xl" />
        <h1 className="mt-10 text-balance text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
          De slimme software voor{" "}
          <span className="bg-gradient-to-r from-brand-300 via-brand-500 to-brand-700 bg-clip-text text-transparent">
            moderne rijscholen
          </span>
        </h1>
        <p className="mt-5 max-w-xl text-balance text-base text-muted-foreground sm:text-lg">
          Van eerste lead tot geslaagd examen — alles in één systeem. Plannen,
          leerlingen, voortgang, betalingen en meer.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/login"
            className="inline-flex h-11 items-center justify-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground shadow-sm transition hover:opacity-90"
          >
            Inloggen
          </Link>
          <Link
            href="#"
            className="inline-flex h-11 items-center justify-center rounded-md border border-border bg-card px-6 text-sm font-medium text-foreground transition hover:bg-muted"
          >
            Plan een demo
          </Link>
        </div>
        <p className="mt-10 text-xs text-muted-foreground">
          NXTDRIVE · multi-tenant SaaS voor rijscholen
        </p>
      </div>
    </main>
  );
}
