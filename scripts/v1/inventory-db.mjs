import { createRequire } from "node:module";
import { resolve } from "node:path";
import { createDecipheriv } from "node:crypto";

let client;
let phase = "dependency";
try {
  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  const { connectionString, encryptionKey } = JSON.parse(input);
  const require = createRequire(
    resolve(process.argv[2], "scripts/package.json"),
  );
  const { Client } = require("pg");
  client = new Client({
    connectionString,
    application_name: "nxtdrive_v1_readonly_inventory",
    connectionTimeoutMillis: 10000,
    query_timeout: 15000,
  });
  phase = "connect";
  await client.connect();
  phase = "query";
  await client.query("begin read only");
  await client.query("set local statement_timeout = '10s'");
  await client.query("set local lock_timeout = '2s'");
  const identity = await client.query(`
    select current_database() as database, current_user as role,
           current_setting('server_version') as server_version,
           current_setting('transaction_read_only') as read_only
  `);
  const tables = await client.query(`
    select n.nspname as schema, c.relname as name, c.relrowsecurity as rls,
           c.reltuples::bigint as estimated_rows
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname in ('public', 'auth', 'storage', 'vault')
      and c.relkind in ('r', 'p') order by n.nspname, c.relname
  `);
  const existing = new Set(tables.rows.map((t) => `${t.schema}.${t.name}`));
  const config = {};
  for (const table of ["platform_secrets", "tenant_secrets"]) {
    if (!existing.has(`public.${table}`)) {
      config[table] = { exists: false };
      continue;
    }
    // Table is from a fixed allowlist. Ciphertext stays in process memory.
    const { rows } = await client.query(
      `select ciphertext, iv, auth_tag from public.${table}`,
    );
    let decrypted = 0;
    let failed = 0;
    for (const row of rows) {
      try {
        if (!/^[a-f0-9]{64}$/i.test(encryptionKey ?? "")) throw new Error();
        const decipher = createDecipheriv(
          "aes-256-gcm",
          Buffer.from(encryptionKey, "hex"),
          Buffer.from(row.iv, "base64"),
        );
        decipher.setAuthTag(Buffer.from(row.auth_tag, "base64"));
        const value = Buffer.concat([
          decipher.update(Buffer.from(row.ciphertext, "base64")),
          decipher.final(),
        ]);
        if (!value.length) throw new Error();
        value.fill(0);
        decrypted++;
      } catch {
        failed++;
      }
    }
    config[table] = { exists: true, total: rows.length, decrypted, failed };
  }
  if (existing.has("public.platform_settings")) {
    const { rows } = await client.query(`
      select count(*)::int as setting_count,
             coalesce(bool_or(key = 'sendgrid_from_email' and length(value->>'email') > 0), false) as sendgrid_from_configured
      from public.platform_settings
    `);
    config.platform_settings = rows[0];
  }
  const counts = {};
  for (const table of ["auth.users", "storage.buckets", "public._migrations"]) {
    if (existing.has(table)) {
      const { rows } = await client.query(
        `select count(*)::int as count from ${table}`,
      );
      counts[table] = rows[0].count;
    }
  }
  await client.query("rollback");
  console.log(
    JSON.stringify({
      status: "read_only_verified",
      identity: identity.rows[0],
      tables: tables.rows,
      config,
      counts,
    }),
  );
} catch (error) {
  // Provider error messages can embed credentials or real tenant data.
  const safeCodes = new Set([
    "ENOTFOUND",
    "EAI_AGAIN",
    "ECONNREFUSED",
    "ETIMEDOUT",
    "ECONNRESET",
    "ENETUNREACH",
    "ERR_MODULE_NOT_FOUND",
    "MODULE_NOT_FOUND",
    "DEPTH_ZERO_SELF_SIGNED_CERT",
    "SELF_SIGNED_CERT_IN_CHAIN",
    "CERT_HAS_EXPIRED",
  ]);
  const code =
    safeCodes.has(error?.code) || /^[0-9][A-Z0-9]{4}$/.test(error?.code ?? "")
      ? error.code
      : "unavailable";
  const category = /tenant or user not found/i.test(error?.message ?? "")
    ? "provider_target_rejected"
    : /timeout/i.test(error?.message ?? "")
      ? "timeout"
      : "unavailable";
  console.log(JSON.stringify({ status: "unavailable", phase, code, category }));
} finally {
  if (client) await client.end().catch(() => {});
}
