/**
 * Build the Next.js app and enforce a small set of livegang performance budgets.
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run check-route-performance
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

type RouteBudget = {
  path: string;
  maxFirstLoadKb: number;
};

const routeBudgets: RouteBudget[] = [
  { path: "/account/wachtwoord-wijzigen", maxFirstLoadKb: 250 },
  { path: "/student", maxFirstLoadKb: 170 },
  { path: "/instructor", maxFirstLoadKb: 155 },
  { path: "/backoffice", maxFirstLoadKb: 290 },
  { path: "/admin/notifications/templates/[key]/[channel]", maxFirstLoadKb: 190 },
  {
    path: "/backoffice/instellingen/notificaties/templates/[key]/[channel]",
    maxFirstLoadKb: 190,
  },
];

const sharedBudgetKb = 110;
const middlewareBudgetKb = 95;

function repoRoot(): string {
  return fileURLToPath(new URL("../../", import.meta.url));
}

function parseKb(line: string): number | null {
  const match = line.match(/([\d.]+)\s*kB/);
  return match ? Number.parseFloat(match[1]) : null;
}

async function runBuild(): Promise<string> {
  return new Promise((resolve, reject) => {
    const command =
      process.platform === "win32"
        ? "cmd.exe"
        : "corepack";
    const args =
      process.platform === "win32"
        ? ["/c", "corepack", "pnpm", "--filter", "@workspace/nxtdrive", "run", "build"]
        : ["pnpm", "--filter", "@workspace/nxtdrive", "run", "build"];

    const child = spawn(command, args, {
      cwd: repoRoot(),
      env: { ...process.env, CI: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let output = "";
    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      output += text;
      process.stdout.write(text);
    });
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      output += text;
      process.stderr.write(text);
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(output);
        return;
      }
      reject(new Error(`next build exited with code ${code ?? "unknown"}`));
    });
  });
}

function findRouteFirstLoad(output: string, path: string): number | null {
  const escapedPath = path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const line = output
    .split(/\r?\n/)
    .find((candidate) => new RegExp(`\\s${escapedPath}\\s+`).test(candidate));

  if (!line) return null;
  const match = line.match(/([\d.]+)\s*kB\s+([\d.]+)\s*kB\s*$/);
  return match ? Number.parseFloat(match[2]) : null;
}

function findSharedFirstLoad(output: string): number | null {
  const line = output
    .split(/\r?\n/)
    .find((candidate) => candidate.includes("First Load JS shared by all"));
  return line ? parseKb(line) : null;
}

function findMiddlewareSize(output: string): number | null {
  const line = output
    .split(/\r?\n/)
    .find((candidate) => candidate.includes("ƒ Middleware"));
  return line ? parseKb(line) : null;
}

async function main(): Promise<void> {
  const output = await runBuild();
  const failures: string[] = [];

  for (const budget of routeBudgets) {
    const actual = findRouteFirstLoad(output, budget.path);
    if (actual === null) {
      failures.push(`missing route in build output: ${budget.path}`);
      continue;
    }

    if (actual > budget.maxFirstLoadKb) {
      failures.push(
        `${budget.path} first load ${actual} kB exceeds ${budget.maxFirstLoadKb} kB`,
      );
    } else {
      console.log(
        `OK ${budget.path} first load ${actual} kB <= ${budget.maxFirstLoadKb} kB`,
      );
    }
  }

  const shared = findSharedFirstLoad(output);
  if (shared === null) {
    failures.push("missing 'First Load JS shared by all' in build output");
  } else if (shared > sharedBudgetKb) {
    failures.push(`shared first load ${shared} kB exceeds ${sharedBudgetKb} kB`);
  } else {
    console.log(`OK shared first load ${shared} kB <= ${sharedBudgetKb} kB`);
  }

  const middleware = findMiddlewareSize(output);
  if (middleware === null) {
    failures.push("missing middleware size in build output");
  } else if (middleware > middlewareBudgetKb) {
    failures.push(`middleware bundle ${middleware} kB exceeds ${middlewareBudgetKb} kB`);
  } else {
    console.log(`OK middleware bundle ${middleware} kB <= ${middlewareBudgetKb} kB`);
  }

  if (failures.length > 0) {
    console.error("");
    for (const failure of failures) {
      console.error(`FAIL ${failure}`);
    }
    process.exit(1);
  }

  console.log("");
  console.log("Route performance budgets passed.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "unknown error");
  process.exit(1);
});
