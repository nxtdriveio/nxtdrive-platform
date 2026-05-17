import Link from "next/link";
import { NxtdriveLogo } from "@/components/nxtdrive-logo";

export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6">
      <div className="max-w-2xl w-full text-center space-y-8">
        <NxtdriveLogo className="h-12 mx-auto" />
        <h1 className="text-4xl font-bold tracking-tight text-slate-900">
          Het complete platform voor rijscholen
        </h1>
        <p className="text-lg text-slate-600">
          Van eerste lead tot geslaagd examen — alles in één systeem.
        </p>
        <div className="flex flex-wrap gap-3 justify-center">
          <Link
            href="/login"
            className="inline-flex items-center justify-center rounded-md bg-[color:var(--tenant-primary)] px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:opacity-90 transition"
          >
            Inloggen
          </Link>
        </div>
        <p className="text-xs text-slate-400">
          NXTDRIVE &middot; multi-tenant SaaS voor rijscholen
        </p>
      </div>
    </main>
  );
}
