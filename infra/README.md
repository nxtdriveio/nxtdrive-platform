# NXTDRIVE infrastructure — one-time VPS setup

This folder contains the Caddy config and systemd units the GitHub Actions
deploy workflows expect to find on the VPS (`178.251.232.105`).

Before the first deploy succeeds you must do this once on the server.

## 1. System packages

```bash
sudo apt update
sudo apt install -y caddy rsync curl git
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo bash -
sudo apt install -y nodejs
sudo npm install -g pnpm
```

## 2. Deploy user

```bash
sudo adduser --disabled-password --gecos "" deployer
sudo mkdir -p /home/deployer/.ssh
sudo cp ~/.ssh/authorized_keys /home/deployer/.ssh/  # or paste your CI public key
sudo chown -R deployer:deployer /home/deployer/.ssh
sudo chmod 700 /home/deployer/.ssh
sudo chmod 600 /home/deployer/.ssh/authorized_keys
```

Allow the deployer to restart the systemd units without a password:

```bash
sudo tee /etc/sudoers.d/nxtdrive-deployer >/dev/null <<'EOF'
deployer ALL=(root) NOPASSWD: /bin/systemctl restart nxtdrive-staging
deployer ALL=(root) NOPASSWD: /bin/systemctl restart nxtdrive-production
EOF
sudo chmod 440 /etc/sudoers.d/nxtdrive-deployer
```

The `SSH_USER` GitHub Actions secret must be `deployer` and the
`SSH_PRIVATE_KEY` secret must be the private key matching the public key in
`/home/deployer/.ssh/authorized_keys`.

## 3. Directory layout

```bash
sudo mkdir -p /var/www/nxtdrive/{staging,production}/{releases,shared}
sudo chown -R deployer:deployer /var/www/nxtdrive
```

The deploy workflow writes the runtime env file to
`/var/www/nxtdrive/<env>/shared/.env` and rsyncs releases into
`/var/www/nxtdrive/<env>/releases/<timestamp>/`, then symlinks `current/` to
the new release and restarts the systemd unit.

## 4. systemd units

```bash
sudo cp infra/nxtdrive-staging.service    /etc/systemd/system/
sudo cp infra/nxtdrive-production.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable nxtdrive-staging nxtdrive-production
# Don't start yet — they will fail until the first deploy populates current/.
```

## 5. Caddy

```bash
sudo mkdir -p /etc/caddy/sites-enabled
sudo cp infra/Caddyfile.staging    /etc/caddy/sites-enabled/staging
sudo cp infra/Caddyfile.production /etc/caddy/sites-enabled/production
```

In `/etc/caddy/Caddyfile` add the import line (only once):

```caddyfile
import /etc/caddy/sites-enabled/*
```

Validate and reload:

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

## 6. DNS (Cloudflare)

| Record | Target |
|---|---|
| `staging.nxtdrive.io` A | `178.251.232.105` |
| `app.nxtdrive.io` A | `178.251.232.105` |
| `rijschool.nxtdrive.io` A | `178.251.232.105` (marketing site, later phase) |
| `nxtdrive.io` A | `178.251.232.105` |

Set the records to **DNS only** (grey cloud) until Caddy has obtained the
Let's Encrypt certificate, then flip back to **Proxied** if you want
Cloudflare in front.

## 7. First deploy

After all of the above, pushing to the `staging` branch triggers
`.github/workflows/deploy-staging.yml`. Pushing to `main` triggers
`deploy-production.yml`. The first deploy will:

1. Build the Next.js app on the runner.
2. Apply pending DB migrations against the appropriate Supabase project.
3. SSH into the VPS, write `shared/.env`, rsync a new release, install
   dependencies, build again on the VPS, swap the `current/` symlink, and
   restart the systemd unit.
