"""Read-only VPS inventory. Never source .env, print values, or deploy code."""

import argparse
import datetime
import grp
import json
import os
from pathlib import Path
import platform
import pwd
import re
import shutil
import socket
import stat
import subprocess
import urllib.error
import urllib.parse
import urllib.request


def read_env(path):
    """Parse single-line runtime values as data; do not expand shell syntax."""
    result = {}
    for line in path.read_text().splitlines():
        match = re.match(r"^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$", line)
        if match:
            value = match[2].strip()
            if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
                value = value[1:-1]
            result[match[1]] = value
    return result


def metadata(path):
    try:
        info = path.lstat()
        return {
            "path": str(path),
            "resolved": str(path.resolve()),
            "exists": True,
            "symlink": path.is_symlink(),
            "mode": oct(stat.S_IMODE(info.st_mode)),
            "uid": info.st_uid,
            "gid": info.st_gid,
        }
    except OSError as error:
        return {"path": str(path), "exists": False, "errno": error.errno}


def project_ref(api_url):
    try:
        host = urllib.parse.urlsplit(api_url).hostname or ""
        match = re.fullmatch(r"([a-z0-9-]{1,63})\.supabase\.co", host)
        return match[1] if match else None
    except ValueError:
        return None


def db_identity(value):
    # Return only validated provider metadata; never echo a malformed URL.
    try:
        url = urllib.parse.urlsplit(value)
        if url.scheme not in ("postgres", "postgresql"):
            return {"valid": False}
        host = url.hostname or ""
        direct = re.fullmatch(r"db\.([a-z0-9-]{1,63})\.supabase\.co", host)
        pooler = re.fullmatch(r"[a-z0-9.-]+\.pooler\.supabase\.com", host)
        user = urllib.parse.unquote(url.username or "")
        pooler_user = re.fullmatch(r"postgres\.([a-z0-9-]{1,63})", user)
        ref = direct[1] if direct else pooler_user[1] if pooler and pooler_user else None
        if not ref:
            return {"valid": False}
        database = url.path.lstrip("/") or "postgres"
        if not re.fullmatch(r"[a-zA-Z0-9_-]{1,63}", database):
            return {"valid": False}
        return {"valid": True, "project_ref": ref, "host": host,
                "port": url.port or 5432, "database": database}
    except ValueError:
        return {"valid": False}


def credential_status(runtime, expected):
    return {
        name: {"runtime_present": bool(runtime.get(name)),
               "github_present": bool(expected.get("EXPECTED_" + name)),
               "matches": bool(runtime.get(name)) and
               runtime.get(name) == expected.get("EXPECTED_" + name)}
        for name in ("SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY",
                     "SESSION_SECRET", "DATABASE_URL", "MOLLIE_KEY_ENCRYPTION_SECRET")
    }


def dns_status(host):
    if not host:
        return {"status": "unknown_host"}
    try:
        addresses = socket.getaddrinfo(host, 443)
        return {"status": "resolved", "addresses": sorted({a[4][0] for a in addresses})}
    except socket.gaierror as error:
        return {"status": "unresolved", "code": error.errno}


def probe(port, route):
    # No response body enters logs, including on 4xx/5xx.
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{port}{route}", timeout=10) as response:
            return {"status": response.status}
    except urllib.error.HTTPError as error:
        return {"status": error.code}
    except OSError:
        return {"status": None}


def database_inventory(release, runtime):
    helper = Path(__file__).with_name("inventory-db.mjs")
    try:
        result = subprocess.run(
            ["node", str(helper), str(release)],
            input=json.dumps({"connectionString": runtime.get("DATABASE_URL"),
                              "encryptionKey": runtime.get("MOLLIE_KEY_ENCRYPTION_SECRET")}),
            capture_output=True, text=True, timeout=90,
        )
        # Do not forward subprocess stderr or raw output on an unexpected error.
        if result.returncode:
            return {"status": "helper_failed", "exit_code": result.returncode}
        return json.loads(result.stdout)
    except (OSError, ValueError, subprocess.TimeoutExpired):
        return {"status": "helper_unavailable"}


def inventory(environment):
    base = Path("/var/www/nxtdrive") / environment
    runtime_path = base / "shared/.env"
    release = (base / "current").resolve()
    disk = shutil.disk_usage(base if base.exists() else "/")
    result = {
        "mode": "read_only", "environment": environment,
        "utc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "host": platform.node(), "runner": os.environ.get("RUNNER_NAME"),
        "runner_user": pwd.getpwuid(os.getuid()).pw_name,
        "runner_groups": [grp.getgrgid(g).gr_name for g in os.getgroups()],
        "inventory_sha": os.environ.get("GITHUB_SHA"),
        "free_bytes": disk.free,
        "base": metadata(base), "current": metadata(base / "current"),
        "runtime_file": metadata(runtime_path),
    }
    try:
        runtime = read_env(runtime_path)
        result["runtime_names"] = sorted(runtime)
    except OSError:
        runtime = {}
        result["runtime_readable"] = False
    result["credentials"] = credential_status(runtime, os.environ)
    api_ref = project_ref(runtime.get("SUPABASE_URL", ""))
    db = db_identity(runtime.get("DATABASE_URL", ""))
    expected_ref = project_ref(os.environ.get("EXPECTED_SUPABASE_URL", ""))
    result["database_target"] = db
    result["api_project_ref"] = api_ref
    result["github_project_ref"] = expected_ref
    result["api_dns"] = dns_status(api_ref + ".supabase.co" if api_ref else None)
    result["database_dns"] = dns_status(db.get("host"))
    result["tools"] = {tool: shutil.which(tool) for tool in
                       ["node", "pnpm", "pg_dump", "pg_restore", "psql", "docker", "openssl", "caddy"]}
    result["postgres_toolchains"] = [str(p) for p in Path("/usr/lib/postgresql").glob("*/bin/pg_dump")]
    identity_matches = bool(api_ref and expected_ref and db.get("valid") and
                            api_ref == expected_ref == db.get("project_ref") and
                            result["credentials"]["DATABASE_URL"]["matches"])
    result["target_identity_matches"] = identity_matches
    sha = runtime.get("GIT_SHA", "")
    result["deployed_sha"] = sha if re.fullmatch(r"[a-f0-9]{40}", sha) else None
    result["releases"] = sorted(p.name for p in (base / "releases").glob("*")
                                if p.is_dir() and re.fullmatch(r"[0-9]{14}", p.name))
    try:
        service = subprocess.run(
            ["systemctl", "show", f"nxtdrive-{environment}", "--no-pager",
             "--property=ActiveState,User,Group,WorkingDirectory,EnvironmentFiles,FragmentPath,MainPID"],
            capture_output=True, text=True, timeout=10,
        )
        result["service"] = dict(line.split("=", 1) for line in service.stdout.splitlines() if "=" in line)
    except (OSError, subprocess.TimeoutExpired):
        result["service"] = {"status": "unavailable"}
    port = 5000 if environment == "staging" else 5001
    result["health"] = probe(port, "/api/health")
    result["readiness"] = probe(port, "/api/health/ready")
    result["caddy"] = [metadata(Path(p)) for p in ["/etc/caddy/Caddyfile", "/etc/caddy/caddy.env"]]
    try:
        result["caddy_env_names"] = sorted(read_env(Path("/etc/caddy/caddy.env")))
    except OSError:
        result["caddy_env_readable"] = False
    result["backup_directories"] = [metadata(Path(p)) for p in
                                    ["/var/backups/nxtdrive", "/var/www/nxtdrive/backups"]]
    safe_release = (release.parent == base / "releases" and
                    re.fullmatch(r"[0-9]{14}", release.name) and release.is_dir())
    if identity_matches and safe_release:
        result["database"] = database_inventory(release, runtime)
    else:
        result["database"] = {"status": "skipped_unverified_target_or_release"}
    # Presence, identity, decryption and readiness are independent of backup/restore.
    result["reset_permitted_by_this_report"] = False
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--environment", choices=["staging", "production"], required=True)
    args = parser.parse_args()
    try:
        print(json.dumps(inventory(args.environment), indent=2))
    except Exception as error:
        # Exception messages can contain URLs/credentials; expose the class only.
        print(json.dumps({"status": "inventory_failed", "error_class": type(error).__name__}))
        raise SystemExit(1)
