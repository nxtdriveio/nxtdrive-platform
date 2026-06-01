import { signInWithPassword } from "@/app/login/actions";
import { Button } from "@/components/ui/button";

/**
 * One-click DEV login panel. Renders four buttons that sign in as fixed test
 * accounts seeded by `pnpm --filter @workspace/scripts run db:seed-dev-accounts`.
 *
 * No auth is bypassed — each button submits the real `signInWithPassword`
 * server action with the known dev credentials. The panel only renders in
 * development; in production this module exports a component that returns null.
 */
const DEV_PASSWORD = "NxtDev2024!";

const DEV_ACCOUNTS = [
  { label: "Platform Admin", email: "dev-admin@nxtdrive.io" },
  { label: "School Admin", email: "dev-school@demo.nxtdrive.io" },
  { label: "Instructor", email: "dev-instructor@demo.nxtdrive.io" },
  { label: "Student", email: "dev-student@demo.nxtdrive.io" },
] as const;

function DevLoginPanelImpl() {
  return (
    <div className="w-full max-w-sm rounded-md border border-dashed border-warning/50 bg-[color-mix(in_oklab,var(--warning)_8%,transparent)] p-4">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-warning">
        Dev Accounts
      </p>
      <p className="mb-3 text-xs text-muted-foreground">
        Alleen zichtbaar in ontwikkeling. Eén klik om in te loggen als een
        testaccount.
      </p>
      <div className="grid grid-cols-2 gap-2">
        {DEV_ACCOUNTS.map((account) => (
          <form key={account.email} action={signInWithPassword}>
            <input type="hidden" name="email" value={account.email} />
            <input type="hidden" name="password" value={DEV_PASSWORD} />
            <Button
              type="submit"
              variant="secondary"
              size="sm"
              className="w-full"
            >
              {account.label}
            </Button>
          </form>
        ))}
      </div>
    </div>
  );
}

function DevLoginPanelNull() {
  return null;
}

export const DevLoginPanel =
  process.env.NODE_ENV === "development" ? DevLoginPanelImpl : DevLoginPanelNull;
