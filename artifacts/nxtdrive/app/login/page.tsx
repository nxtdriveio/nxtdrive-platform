import { NxtdriveLogo } from "@/components/nxtdrive-logo";
import { sendMagicLink, signInWithPassword } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  const params = await searchParams;
  const sent = params.sent === "1";
  const errorMsg = params.error;

  return (
    <main className="min-h-screen flex items-center justify-center px-6 bg-slate-50">
      <div className="w-full max-w-sm space-y-6 bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
        <div className="text-center">
          <NxtdriveLogo className="h-10 mx-auto mb-4" />
          <h1 className="text-2xl font-semibold text-slate-900">Inloggen</h1>
          <p className="text-sm text-slate-500 mt-1">
            Log in met je e-mailadres en wachtwoord.
          </p>
        </div>

        {sent ? (
          <div className="rounded-md bg-emerald-50 border border-emerald-200 p-4 text-sm text-emerald-800">
            Check je inbox — we hebben je een inloglink gestuurd.
          </div>
        ) : null}

        {errorMsg ? (
          <p className="text-sm text-red-600">{decodeURIComponent(errorMsg)}</p>
        ) : null}

        <form action={signInWithPassword} className="space-y-4">
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-slate-700 mb-1"
            >
              E-mailadres
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--tenant-primary)]"
              placeholder="naam@rijschool.nl"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-slate-700 mb-1"
            >
              Wachtwoord
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--tenant-primary)]"
            />
          </div>

          <button
            type="submit"
            className="w-full rounded-md bg-[color:var(--tenant-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition"
          >
            Inloggen
          </button>
        </form>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-slate-200" />
          </div>
          <div className="relative flex justify-center text-xs uppercase tracking-wide">
            <span className="bg-white px-2 text-slate-400">of</span>
          </div>
        </div>

        <form action={sendMagicLink} className="space-y-3">
          <p className="text-xs text-slate-500 text-center">
            Wachtwoord vergeten? Vul hierboven je e-mailadres in en vraag een inloglink aan.
          </p>
          <button
            type="submit"
            className="w-full rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition"
          >
            Stuur inloglink per e-mail
          </button>
        </form>
      </div>
    </main>
  );
}
