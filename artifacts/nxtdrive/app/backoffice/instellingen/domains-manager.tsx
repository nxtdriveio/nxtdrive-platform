"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type {
  TenantDomain,
  TenantDomainStatus,
} from "@/lib/types";
import {
  addTenantDomain,
  removeTenantDomain,
  setPrimaryTenantDomain,
  verifyTenantDomain,
} from "./actions";

type DnsRecord = { name: string; type: string; value: string; note?: string };

export type DomainView = TenantDomain & {
  verifyRecord: DnsRecord;
  trafficRecords: DnsRecord[];
};

const STATUS_LABEL: Record<TenantDomainStatus, string> = {
  pending: "In afwachting",
  active: "Actief",
  failed: "Verificatie mislukt",
};

const STATUS_VARIANT: Record<
  TenantDomainStatus,
  "warning" | "success" | "danger"
> = {
  pending: "warning",
  active: "success",
  failed: "danger",
};

function RecordRow({ record }: { record: DnsRecord }) {
  return (
    <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs">
      <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 font-mono">
        <span className="text-muted-foreground">Type</span>
        <span className="text-foreground">{record.type}</span>
        <span className="text-muted-foreground">Naam</span>
        <span className="break-all text-foreground">{record.name}</span>
        <span className="text-muted-foreground">Waarde</span>
        <span className="break-all text-foreground">{record.value}</span>
      </div>
      {record.note ? (
        <p className="mt-2 font-sans text-[11px] leading-snug text-muted-foreground">
          {record.note}
        </p>
      ) : null}
    </div>
  );
}

export function DomainsManager({
  domains,
  editable = true,
  canAdd = true,
  lockedReason,
}: {
  domains: DomainView[];
  editable?: boolean;
  canAdd?: boolean;
  lockedReason?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [hostname, setHostname] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function run(action: () => Promise<{ ok: boolean; error?: string }>, ok?: string) {
    if (!editable) return;
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const res = await action();
      if (!res.ok) {
        setError(res.error ?? "Er ging iets mis.");
        return;
      }
      if (ok) setNotice(ok);
      router.refresh();
    });
  }

  function add() {
    if (!editable || !canAdd) return;
    const host = hostname.trim();
    if (!host) {
      setError("Vul een domeinnaam in.");
      return;
    }
    const fd = new FormData();
    fd.set("hostname", host);
    run(() => addTenantDomain(fd), "Domein toegevoegd.");
    setHostname("");
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Maak je rijschool bereikbaar via een eigen webadres. Een{" "}
        <span className="font-medium text-foreground">subdomein</span> zoals
        <span className="font-mono"> jouwschool.nxtdrive.io</span> werkt direct.
        Een <span className="font-medium text-foreground">eigen domein</span>{" "}
        zoals <span className="font-mono">www.jouwrijschool.nl</span> moet je
        eerst verifiëren via een DNS-record.
      </p>

      {/* Toevoegen */}
      <div className="space-y-2">
        <Label htmlFor="domain_hostname">Domein toevoegen</Label>
        <div className="flex gap-2">
          <Input
            id="domain_hostname"
            placeholder="www.jouwrijschool.nl of jouwschool.nxtdrive.io"
            value={hostname}
            disabled={!editable || pending}
            onChange={(e) => setHostname(e.target.value)}
            onKeyDown={(e) => {
              if (editable && e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
          />
          <Button
            type="button"
            onClick={add}
            disabled={!editable || !canAdd || pending}
          >
            Toevoegen
          </Button>
        </div>
      </div>

      {!editable ? (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
          {lockedReason ??
            "Eigen domeinen blijven hieronder zichtbaar, maar beheer is nu read-only."}
        </div>
      ) : null}

      {error ? (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      ) : null}
      {notice ? (
        <p className="text-sm text-green-600 dark:text-green-400">{notice}</p>
      ) : null}

      {/* Lijst */}
      {domains.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nog geen domeinen gekoppeld.
        </p>
      ) : (
        <ul className="space-y-4">
          {domains.map((d) => (
            <li
              key={d.id}
              className="space-y-3 rounded-lg border border-border p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm text-foreground">
                    {d.hostname}
                  </span>
                  {d.is_primary ? (
                    <Badge variant="info">Primair</Badge>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={STATUS_VARIANT[d.status]}>
                    {STATUS_LABEL[d.status]}
                  </Badge>
                  <Badge variant="outline">
                    {d.type === "subdomain" ? "Subdomein" : "Eigen domein"}
                  </Badge>
                </div>
              </div>

              {/* DNS-instructies voor eigen domeinen die nog niet actief zijn */}
              {d.type === "custom" && d.status !== "active" ? (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-foreground">
                    1. Bewijs eigendom — voeg dit TXT-record toe:
                  </p>
                  <RecordRow record={d.verifyRecord} />
                  <p className="text-xs font-medium text-foreground">
                    2. Wijs het verkeer naar NXTDRIVE:
                  </p>
                  {d.trafficRecords.map((r, i) => (
                    <RecordRow key={i} record={r} />
                  ))}
                </div>
              ) : null}

              <div className="flex flex-wrap gap-2">
                {d.status !== "active" ? (
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={!editable || pending}
                    onClick={() => {
                      const fd = new FormData();
                      fd.set("domain_id", d.id);
                      run(
                        () => verifyTenantDomain(fd),
                        "Domein geverifieerd en actief.",
                      );
                    }}
                  >
                    Verifiëren
                  </Button>
                ) : null}
                {d.status === "active" && !d.is_primary ? (
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={!editable || pending}
                    onClick={() => {
                      const fd = new FormData();
                      fd.set("domain_id", d.id);
                      run(
                        () => setPrimaryTenantDomain(fd),
                        "Primair domein ingesteld.",
                      );
                    }}
                  >
                    Als primair instellen
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="ghost"
                  disabled={!editable || pending}
                  onClick={() => {
                    const fd = new FormData();
                    fd.set("domain_id", d.id);
                    run(() => removeTenantDomain(fd), "Domein verwijderd.");
                  }}
                >
                  Verwijderen
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
