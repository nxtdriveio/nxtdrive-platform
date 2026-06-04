-- Platform-level non-sensitive settings (key/value store)
CREATE TABLE platform_settings (
  key         text        PRIMARY KEY,
  value       jsonb       NOT NULL DEFAULT '{}'::jsonb,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE platform_settings ENABLE ROW LEVEL SECURITY;

-- Only the service role may access this table; no authenticated user should
-- ever read or write platform settings directly.
CREATE POLICY "platform_settings_deny_authenticated"
  ON platform_settings FOR ALL TO authenticated
  USING (false) WITH CHECK (false);

-- Platform-level encrypted secrets (AES-256-GCM, same key as Mollie)
CREATE TABLE platform_secrets (
  key         text        PRIMARY KEY,
  ciphertext  text        NOT NULL,
  iv          text        NOT NULL,
  auth_tag    text        NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE platform_secrets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform_secrets_deny_authenticated"
  ON platform_secrets FOR ALL TO authenticated
  USING (false) WITH CHECK (false);
