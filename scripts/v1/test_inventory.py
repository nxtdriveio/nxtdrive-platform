import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from inventory import credential_status, db_identity, inventory, project_ref, read_env


class InventorySafetyTests(unittest.TestCase):
    def test_env_is_data_and_does_not_execute_shell(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / ".env"
            marker = Path(directory) / "executed"
            path.write_text(f'KEY=$(touch {marker})\nexport QUOTED="a=b"\n#ignored\n')
            env = read_env(path)
            self.assertFalse(marker.exists())
            self.assertEqual(env["QUOTED"], "a=b")
            self.assertIn("$(touch", env["KEY"])

    def test_connection_metadata_never_contains_password_or_query(self):
        ref = "abcdefghijklmnopqrst"
        for host, user in [(f"db.{ref}.supabase.co", "postgres"),
                           ("aws-0-eu-central-1.pooler.supabase.com", f"postgres.{ref}")]:
            result = db_identity(f"postgresql://{user}:private-password@{host}:5432/postgres?secret=private-query")
            self.assertEqual(result["project_ref"], ref)
            self.assertNotIn("private", json.dumps(result))
        for invalid in ["secret-text", "postgresql://user:secret@untrusted.example/db",
                        f"postgresql://postgres:secret@db.{ref}.supabase.co:bad/db"]:
            self.assertEqual(db_identity(invalid), {"valid": False})

    def test_credential_comparison_only_reports_presence_and_equality(self):
        result = credential_status({"SESSION_SECRET": "do-not-print"},
                                   {"EXPECTED_SESSION_SECRET": "different-secret"})
        self.assertEqual(result["SESSION_SECRET"],
                         {"runtime_present": True, "github_present": True, "matches": False})
        self.assertNotIn("do-not-print", json.dumps(result))
        self.assertNotIn("different-secret", json.dumps(result))

    def test_unverified_environment_cannot_open_database(self):
        with patch("inventory.read_env", return_value={"DATABASE_URL": "do-not-print"}), \
             patch("inventory.database_inventory") as database, \
             patch("inventory.probe", return_value={"status": None}), \
             patch("inventory.dns_status", return_value={"status": "unknown_host"}), \
             patch.dict(os.environ, {}, clear=True):
            result = inventory("staging")
            database.assert_not_called()
            self.assertFalse(result["target_identity_matches"])
            self.assertFalse(result["reset_permitted_by_this_report"])
            self.assertNotIn("do-not-print", json.dumps(result))

    def test_only_valid_supabase_refs_are_returned(self):
        self.assertEqual(project_ref("https://abcdefghijklmnopqrst.supabase.co"), "abcdefghijklmnopqrst")
        self.assertIsNone(project_ref("https://untrusted.example/?secret=hidden"))
        self.assertIsNone(project_ref("not-a-url"))


if __name__ == "__main__":
    unittest.main()
