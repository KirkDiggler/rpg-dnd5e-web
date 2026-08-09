#!/usr/bin/env python3
"""Trusted licensed-assets workflow policy/oracle.

This file is executed only from the released default-main workflow commit.  A PR
checkout is data until ``sandbox-run`` invokes fixed commands with no network.
The module is deliberately Python-stdlib-only so no PR dependency is imported.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import mimetypes
import os
import re
import shutil
import stat
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path, PurePosixPath
from typing import Any, Mapping, Sequence

OWNER = "KirkDiggler"
REPOSITORY = "KirkDiggler/rpg-dnd5e-web"
PROVIDER_REPOSITORY = "KirkDiggler/rpg-game-assets"
DEFAULT_REF = "refs/heads/main"
BASE_REF = "dev"
ENVIRONMENT = "licensed-assets"
WORKFLOW_PATH = ".github/workflows/trusted-licensed-assets.yml"
HEX40 = re.compile(r"^[0-9a-f]{40}$")
HEX64 = re.compile(r"^[0-9a-f]{64}$")
SAFE_ID = re.compile(r"^[a-z0-9][a-z0-9._/-]{0,95}$")
TOKENISH = re.compile(
    r"(?i)(?:github_pat_|gh[pousr]_|x-access-token|authorization\s*:|bearer\s+|"
    r"-----BEGIN [A-Z ]*PRIVATE KEY-----|(?:token|secret|password|credential)\s*[=:])"
)
URLISH = re.compile(r"(?i)(?:https?|ssh|git)://|git@github\.com|github\.com/")
BLOBISH = re.compile(r"[A-Za-z0-9+/]{160,}={0,2}")
LICENSED_SUFFIXES = {".glb", ".gltf", ".fbx", ".blend", ".unitypackage", ".zip", ".7z", ".rar"}
LICENSED_PREFIXES = ("public/models/synty/", ".asset-stage/", "assets/synty/")
SCREENSHOT_SUFFIXES = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"}
ALLOWED_CONTEXT_ROOTS = {
    "index.html", "package.json", "package-lock.json", "eslint.config.js",
    "postcss.config.js", "vite.config.ts", "vitest.config.ts", "nginx.conf",
    "nginx.main.conf", "tsconfig.json", "tsconfig.app.json", "tsconfig.node.json",
}
ALLOWED_CONTEXT_PREFIXES = ("src/", "public/")
MAX_CHANGED_FILES = 4096
MAX_TREE_FILES = 20000
MAX_ARTIFACT_BYTES = 4096
MAX_STAGE_FILES = 10000
MAX_STAGE_BYTES = 8 * 1024 * 1024 * 1024

class TrustError(RuntimeError):
    pass

def fail(message: str) -> None:
    raise TrustError(message)

def require(condition: bool, message: str) -> None:
    if not condition:
        fail(message)

def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()

def canonical_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True)

def read_json(path: Path, max_bytes: int = 2 * 1024 * 1024) -> Any:
    require(path.is_file() and not path.is_symlink(), f"not a regular JSON file: {path}")
    require(path.stat().st_size <= max_bytes, f"JSON file too large: {path}")
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        fail(f"invalid JSON {path}: {exc}")

def exact_keys(value: Mapping[str, Any], keys: set[str], label: str) -> None:
    require(isinstance(value, dict), f"{label} must be an object")
    require(set(value) == keys, f"{label} keys mismatch")

def clean_scalar(value: Any, label: str, *, max_len: int = 128) -> None:
    require(value is None or isinstance(value, (str, bool, int, float)), f"{label} is not scalar")
    if isinstance(value, str):
        require(len(value) <= max_len and "\n" not in value and "\r" not in value, f"{label} invalid string")
        require(not TOKENISH.search(value), f"{label} is secret-shaped")
        require(not URLISH.search(value), f"{label} is URL-shaped")
        require(not BLOBISH.search(value), f"{label} is blob-shaped")
    if isinstance(value, float):
        require(math.isfinite(value), f"{label} is not finite")

def validate_workflow_identity(*, event_name: str, repository: str, actor: str,
                               ref: str, workflow_ref: str, workflow_sha: str,
                               run_sha: str) -> None:
    require(event_name == "workflow_dispatch", "event must be workflow_dispatch")
    require(repository == REPOSITORY, "wrong executing repository")
    require(actor == OWNER, "dispatch actor is not Kirk")
    require(ref == DEFAULT_REF, "dispatch ref is not default main")
    require(HEX40.fullmatch(workflow_sha) is not None, "workflow SHA must be full lowercase SHA")
    require(run_sha == workflow_sha, "run SHA differs from workflow SHA")
    expected = f"{REPOSITORY}/{WORKFLOW_PATH}@{DEFAULT_REF}"
    require(workflow_ref == expected, "workflow was not loaded from the default-main ref")

def validate_pr(pr: Mapping[str, Any], *, number: int, expected_sha: str,
                actor: str, checkout_sha: str | None = None,
                original: Mapping[str, Any] | None = None) -> dict[str, Any]:
    require(isinstance(number, int) and 0 < number < 1_000_000_000, "invalid PR number")
    require(HEX40.fullmatch(expected_sha) is not None, "expected head must be a full lowercase SHA")
    require(actor == OWNER, "dispatch actor is not Kirk")
    required = {"number", "state", "draft", "user", "head", "base"}
    require(required.issubset(pr), "live PR response missing trust fields")
    require(pr["number"] == number, "live PR number mismatch")
    require(pr["state"] == "open", "PR is not open")
    require(pr["draft"] is False, "PR is draft")
    user = pr["user"]
    require(isinstance(user, dict), "PR user missing")
    require(user.get("login") == OWNER, "PR author is not Kirk")
    require(user.get("type") == "User", "PR author is a bot")
    head, base = pr["head"], pr["base"]
    require(isinstance(head, dict) and isinstance(base, dict), "PR refs missing")
    require(head.get("sha") == expected_sha, "live PR head differs from expected SHA")
    require(head.get("ref") != "dependabot", "Dependabot head rejected")
    require(not str(head.get("ref", "")).startswith("dependabot/"), "Dependabot head rejected")
    head_repo, base_repo = head.get("repo"), base.get("repo")
    require(isinstance(head_repo, dict) and isinstance(base_repo, dict), "PR repositories missing")
    require(head_repo.get("full_name") == REPOSITORY, "wrong head repository")
    require(head_repo.get("fork") is False, "fork PR rejected")
    require(base_repo.get("full_name") == REPOSITORY, "wrong base repository")
    require(base.get("ref") == BASE_REF, "PR base is not dev")
    base_sha = base.get("sha")
    require(isinstance(base_sha, str) and HEX40.fullmatch(base_sha), "live base SHA invalid")
    if checkout_sha is not None:
        require(checkout_sha == expected_sha, "quarantine checkout differs from expected SHA")
    snapshot = {
        "number": number,
        "head_sha": expected_sha,
        "head_ref": head.get("ref"),
        "base_sha": base_sha,
        "base_ref": base.get("ref"),
        "head_repo": head_repo.get("full_name"),
        "base_repo": base_repo.get("full_name"),
        "author": user.get("login"),
        "author_type": user.get("type"),
        "state": pr.get("state"),
        "draft": pr.get("draft"),
    }
    for key, value in snapshot.items():
        clean_scalar(value, f"snapshot.{key}")
    if original is not None:
        require(snapshot == dict(original), "live PR trust fields changed since preflight")
    return snapshot

def github_api(path: str, token: str) -> Any:
    require(token != "", "GITHUB_TOKEN missing")
    require(path.startswith("/repos/KirkDiggler/rpg-dnd5e-web/"), "untrusted API path")
    request = urllib.request.Request(
        f"https://api.github.com{path}",
        headers={"Accept": "application/vnd.github+json", "Authorization": f"Bearer {token}",
                 "User-Agent": "trusted-licensed-assets-bootstrap/1", "X-GitHub-Api-Version": "2022-11-28"},
    )
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            require(response.status == 200, f"GitHub API returned {response.status}")
            body = response.read(2 * 1024 * 1024 + 1)
    except urllib.error.HTTPError as exc:
        fail(f"GitHub API failed with HTTP {exc.code}")
    require(len(body) <= 2 * 1024 * 1024, "GitHub API response too large")
    return json.loads(body)

def fetch_pr(number: int, token: str) -> Any:
    return github_api(f"/repos/KirkDiggler/rpg-dnd5e-web/pulls/{number}", token)

def parse_provider_lock(path: Path) -> dict[str, Any]:
    lock = read_json(path, 32 * 1024)
    exact_keys(lock, {"schemaVersion", "provider", "catalog", "inventory", "tool", "verifier"}, "provider lock")
    require(lock["schemaVersion"] == 1, "unsupported provider lock schema")
    exact_keys(lock["provider"], {"repository", "commit"}, "provider")
    require(lock["provider"]["repository"] == PROVIDER_REPOSITORY, "wrong provider repository")
    require(HEX40.fullmatch(lock["provider"]["commit"]), "provider commit is not exact SHA")
    exact_keys(lock["catalog"], {"path", "sha256", "schemaVersion", "catalogId"}, "catalog")
    require(lock["catalog"]["path"] == "harness/catalogs/synty-web-assets.json", "wrong catalog path")
    require(HEX64.fullmatch(lock["catalog"]["sha256"]), "bad catalog digest")
    require(lock["catalog"]["schemaVersion"] == 1 and lock["catalog"]["catalogId"] == "synty-web-assets", "bad catalog identity")
    exact_keys(lock["inventory"], {"path", "sha256", "schemaVersion", "inventoryId", "tool", "fileCount", "treeSha256"}, "inventory")
    inv = lock["inventory"]
    require(inv["path"] == "harness/catalogs/synty-complete-inventory.json", "wrong inventory path")
    require(HEX64.fullmatch(inv["sha256"]) and HEX64.fullmatch(inv["treeSha256"]), "bad inventory digest")
    require(inv["schemaVersion"] == 1 and inv["inventoryId"] == "synty-complete-tree", "bad inventory identity")
    require(isinstance(inv["fileCount"], int) and 0 < inv["fileCount"] <= MAX_STAGE_FILES, "bad inventory count")
    for obj, name, version in ((lock["tool"], "build_web_asset_catalog", "1.0.0"),
                               (inv["tool"], "build_synty_complete_inventory", "1.0.0"),
                               (lock["verifier"], "verify_web_asset_stage", "1.1.0")):
        exact_keys(obj, {"name", "version"}, "tool identity")
        require(obj == {"name": name, "version": version}, "unexpected provider tool identity")
    return lock

def git(*args: str, cwd: Path | None = None, check: bool = True, env: Mapping[str, str] | None = None) -> str:
    result = subprocess.run(["git", *args], cwd=cwd, env=env, text=True,
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
    if check and result.returncode:
        fail(f"git command failed ({args[0] if args else 'git'})")
    return result.stdout

def validate_quarantine(worktree: Path, *, expected_sha: str, base_sha: str) -> dict[str, Any]:
    require(worktree.is_dir() and (worktree / ".git").exists(), "quarantine checkout missing")
    require(git("rev-parse", "HEAD", cwd=worktree).strip() == expected_sha, "quarantine HEAD mismatch")
    require(git("status", "--porcelain=v1", "--untracked-files=all", cwd=worktree).strip() == "", "quarantine is dirty")
    raw = subprocess.check_output(["git", "-C", str(worktree), "ls-tree", "-r", "-z", expected_sha])
    entries = []
    for item in raw.split(b"\0"):
        if not item:
            continue
        meta, path_b = item.split(b"\t", 1)
        mode, kind, oid = meta.decode("ascii").split()
        path = path_b.decode("utf-8")
        require(mode in {"100644", "100755"} and kind == "blob", f"special tree entry rejected: {path}")
        require(PurePosixPath(path).is_absolute() is False and ".." not in PurePosixPath(path).parts, "unsafe tree path")
        entries.append(path)
    require(0 < len(entries) <= MAX_TREE_FILES, "unexpected PR tree size")
    changed_raw = git("diff", "--name-status", "-z", f"{base_sha}...{expected_sha}", cwd=worktree)
    fields = changed_raw.split("\0")
    changed: list[str] = []
    i = 0
    while i < len(fields) and fields[i]:
        status_code = fields[i]
        i += 1
        if status_code[0] in "RC":
            require(i + 1 < len(fields), "malformed rename diff")
            old, new = fields[i], fields[i + 1]
            i += 2
            changed.extend([old, new])
        else:
            require(i < len(fields), "malformed changed-path diff")
            changed.append(fields[i]); i += 1
    require(len(changed) <= MAX_CHANGED_FILES, "too many changed files")
    for path in changed:
        lower = path.lower()
        require(not lower.startswith(LICENSED_PREFIXES), f"licensed path changed by PR: {path}")
        require(PurePosixPath(lower).suffix not in LICENSED_SUFFIXES, f"licensed binary changed by PR: {path}")
    return {"tree_files": len(entries), "changed_files": len(set(changed))}

def context_path_allowed(path: str) -> bool:
    if path in ALLOWED_CONTEXT_ROOTS:
        return True
    if path.startswith("public/models/synty/"):
        return False
    return path.startswith(ALLOWED_CONTEXT_PREFIXES)

def copy_regular(source: Path, destination: Path) -> None:
    require(source.is_file() and not source.is_symlink(), f"context source not regular: {source}")
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, destination, follow_symlinks=False)
    os.chmod(destination, 0o755 if os.access(source, os.X_OK) else 0o644)

def create_context(worktree: Path, base_sha: str, destination: Path, asset_root: Path | None) -> dict[str, Any]:
    require(not destination.exists(), "context destination already exists")
    destination.mkdir(parents=True, mode=0o700)
    for build_file in ("Dockerfile", ".dockerignore"):
        head_bytes = subprocess.check_output(["git", "-C", str(worktree), "show", f"HEAD:{build_file}"])
        base_bytes = subprocess.check_output(["git", "-C", str(worktree), "show", f"{base_sha}:{build_file}"])
        require(head_bytes == base_bytes, f"PR modified trusted {build_file}")
        out = destination / build_file
        out.write_bytes(base_bytes); os.chmod(out, 0o600)
    dockerfile = (destination / "Dockerfile").read_text(encoding="utf-8")
    require(not re.search(r"(?im)^\s*ADD\s", dockerfile), "Dockerfile ADD is forbidden")
    require(not re.search(r"(?im)^\s*FROM\s+[^\s]+@?https?://", dockerfile), "remote Docker source forbidden")
    raw = subprocess.check_output(["git", "-C", str(worktree), "ls-files", "-z"])
    copied = 0
    for item in raw.split(b"\0"):
        if not item:
            continue
        path = item.decode("utf-8")
        if context_path_allowed(path):
            copy_regular(worktree / path, destination / path); copied += 1
    require((destination / "package.json").is_file() and (destination / "src").is_dir(), "incomplete trusted build context")
    asset_count = 0
    if asset_root is not None:
        require(asset_root.is_dir() and not asset_root.is_symlink(), "asset root missing")
        for path in sorted(asset_root.rglob("*")):
            require(not path.is_symlink(), "asset-stage symlink rejected")
            if path.is_dir():
                continue
            require(path.is_file() and path.stat().st_nlink == 1, "asset-stage special/hardlink rejected")
            rel = path.relative_to(asset_root)
            copy_regular(path, destination / "public/models/synty" / rel)
            asset_count += 1
        require(asset_count > 0, "licensed context is empty")
    return {"context_files": copied + asset_count + 2, "asset_files": asset_count}

def validate_inventory(provider: Path, stage_root: Path, lock: Mapping[str, Any]) -> dict[str, Any]:
    inventory_path = provider / lock["inventory"]["path"]
    require(sha256_file(inventory_path) == lock["inventory"]["sha256"], "inventory file hash mismatch")
    inventory = read_json(inventory_path, 4 * 1024 * 1024)
    exact_keys(inventory, {"schemaVersion", "inventoryId", "root", "tool", "fileCount", "treeSha256", "files"}, "provider inventory")
    require(inventory["schemaVersion"] == 1 and inventory["inventoryId"] == "synty-complete-tree", "provider inventory identity mismatch")
    require(inventory["root"] == "harness/models/synty", "provider inventory root mismatch")
    require(inventory["tool"] == lock["inventory"]["tool"], "provider inventory tool mismatch")
    require(inventory["fileCount"] == lock["inventory"]["fileCount"], "provider inventory count lock mismatch")
    require(inventory["treeSha256"] == lock["inventory"]["treeSha256"], "provider tree lock mismatch")
    files = inventory["files"]
    require(isinstance(files, list) and len(files) == inventory["fileCount"], "provider inventory rows mismatch")
    root = stage_root / "models/synty"
    require(root.is_dir() and not root.is_symlink(), "staged licensed root missing")
    seen: set[str] = set(); rows: list[str] = []; total = 0
    for record in files:
        exact_keys(record, {"path", "size", "sha256"}, "inventory row")
        rel = record["path"]
        require(isinstance(rel, str) and 0 < len(rel) <= 300, "invalid inventory path")
        pure = PurePosixPath(rel)
        require(not pure.is_absolute() and ".." not in pure.parts and rel not in seen, "unsafe/duplicate inventory path")
        require(isinstance(record["size"], int) and 0 <= record["size"] <= MAX_STAGE_BYTES, "invalid inventory size")
        require(HEX64.fullmatch(record["sha256"]), "invalid inventory file hash")
        path = root.joinpath(*pure.parts)
        require(path.is_file() and not path.is_symlink() and path.stat().st_nlink == 1, f"missing/special staged file: {rel}")
        require(path.stat().st_size == record["size"], f"staged size mismatch: {rel}")
        require(sha256_file(path) == record["sha256"], f"staged digest mismatch: {rel}")
        seen.add(rel); total += record["size"]
        rows.append(f"{rel}\0{record['size']}\0{record['sha256']}\n")
    actual_paths = {p.relative_to(root).as_posix() for p in root.rglob("*") if p.is_file()}
    require(actual_paths == seen, "staged tree has unlisted files")
    tree_sha = hashlib.sha256("".join(rows).encode()).hexdigest()
    require(tree_sha == inventory["treeSha256"], "staged aggregate tree mismatch")
    require(total <= MAX_STAGE_BYTES, "staged aggregate too large")
    return {"asset_files": len(files), "asset_bytes": total, "tree_sha256": tree_sha}

def validate_provider_checkout(provider: Path, worktree: Path, lock: Mapping[str, Any]) -> None:
    expected = lock["provider"]["commit"]
    require(git("rev-parse", "HEAD", cwd=provider).strip() == expected, "provider HEAD mismatch")
    sym = subprocess.run(["git", "-C", str(provider), "symbolic-ref", "-q", "HEAD"], stdout=subprocess.DEVNULL).returncode
    require(sym != 0, "provider checkout is not detached")
    require(git("status", "--porcelain=v1", cwd=provider).strip() == "", "provider checkout dirty")
    catalog = provider / lock["catalog"]["path"]
    require(sha256_file(catalog) == lock["catalog"]["sha256"], "provider catalog hash mismatch")
    web_catalog = worktree / "src/rendering/visualPlacement/synty-web-assets.json"
    require(sha256_file(web_catalog) == lock["catalog"]["sha256"], "quarantined catalog hash mismatch")
    require(catalog.read_bytes() == web_catalog.read_bytes(), "provider/web catalog bytes differ")
    tool_paths = {
        "build_web_asset_catalog": provider / "scripts/build_web_asset_catalog.py",
        "build_synty_complete_inventory": provider / "scripts/build_synty_complete_inventory.py",
        "verify_web_asset_stage": provider / "scripts/verify_web_asset_stage.py",
    }
    require(all(p.is_file() and not p.is_symlink() for p in tool_paths.values()), "provider tool missing/special")

def run_provider_tools(provider: Path, stage: Path) -> None:
    env = {"PATH": os.environ.get("PATH", "/usr/bin:/bin"), "HOME": str(stage.parent / "provider-home"),
           "LANG": "C.UTF-8", "LC_ALL": "C.UTF-8", "PYTHONDONTWRITEBYTECODE": "1"}
    Path(env["HOME"]).mkdir(mode=0o700)
    commands = [
        [sys.executable, "scripts/build_web_asset_catalog.py", "--check"],
        [sys.executable, "scripts/build_synty_complete_inventory.py", "--check"],
        [sys.executable, "scripts/verify_web_asset_stage.py", "--verify-only"],
        [sys.executable, "scripts/verify_web_asset_stage.py", "--destination", str(stage)],
    ]
    for command in commands:
        result = subprocess.run(command, cwd=provider, env=env, stdout=subprocess.DEVNULL,
                                stderr=subprocess.DEVNULL, timeout=600)
        require(result.returncode == 0, f"provider check failed: {Path(command[1]).name}")
    require(git("status", "--porcelain=v1", cwd=provider).strip() == "", "provider checks dirtied checkout")

def validate_secret_input(canonical: str | None, broad: str | None) -> str:
    require(canonical is not None and canonical != "", "licensed-assets Environment secret absent")
    # Alternate/broad secret is intentionally ignored and never a fallback.
    require(len(canonical) <= 1024 and "\n" not in canonical and "\r" not in canonical, "invalid canonical secret")
    return canonical

def credential_residue(root: Path, env: Mapping[str, str], provider_path: Path | None) -> None:
    forbidden_env = {"RPG_GAME_ASSETS_READ_TOKEN", "ASSETS_READ_TOKEN", "GIT_ASKPASS", "SSH_ASKPASS", "GIT_CONFIG_GLOBAL", "GIT_CONFIG_SYSTEM"}
    require(not (forbidden_env & set(env)), "credential/control environment residue")
    if provider_path is not None:
        require(not provider_path.exists(), "private provider checkout residue")
    for path in root.rglob("*"):
        if not path.is_file() or path.is_symlink() or path.stat().st_size > 1024 * 1024:
            continue
        lower = path.name.lower()
        if lower in {".gitconfig", ".netrc", "credentials", "config"} or "askpass" in lower:
            text = path.read_text(encoding="utf-8", errors="ignore")
            require(not TOKENISH.search(text) and "x-access-token" not in text.lower(), f"credential config residue: {path.name}")

def scan_private_log(path: Path, canaries: Sequence[str] = ()) -> dict[str, Any]:
    require(path.is_file() and not path.is_symlink() and path.stat().st_nlink == 1, "private log not regular")
    require(path.stat().st_size <= 64 * 1024 * 1024, "private log too large")
    text = path.read_text(encoding="utf-8", errors="replace")
    require(not TOKENISH.search(text), "private log contains secret-shaped output")
    require(not re.search(r"(?i)https?://[^\s]*@", text), "private log contains authenticated URL")
    for canary in canaries:
        require(canary not in text, "stdout secret canary reached captured PR log")
    return {"log_bytes": len(text.encode("utf-8"))}

def parse_perf_log(path: Path) -> float:
    text = path.read_text(encoding="utf-8", errors="replace")
    matches = re.findall(r'"medianP95MsPerResolve"\s*:\s*([0-9]+(?:\.[0-9]+)?)', text)
    require(len(matches) == 1, "performance log lacks one bounded median")
    value = float(matches[0])
    require(math.isfinite(value) and 0 <= value <= 0.05, "performance threshold failed")
    return value

def validate_artifact(path: Path) -> dict[str, Any]:
    require(path.is_file() and not path.is_symlink(), "artifact is not regular")
    info = path.stat()
    require(info.st_nlink == 1, "artifact hardlink rejected")
    require(info.st_size <= MAX_ARTIFACT_BYTES, "artifact too large")
    require(path.name == "licensed-assets-evidence.json", "artifact filename not allowlisted")
    raw = path.read_bytes()
    require(not raw.startswith((b"\x89PNG", b"PK\x03\x04", b"glTF", b"GIF8", b"\xff\xd8\xff")), "artifact binary/archive/image rejected")
    evidence = json.loads(raw.decode("utf-8"))
    keys = {"schema", "pr_number", "web_sha", "provider_sha", "catalog_sha256", "inventory_sha256",
            "tree_sha256", "asset_files", "functional_pass", "hash_pass", "matrix_pass", "matrix_cases", "sandbox_pass", "docker_pass",
            "perf_median_p95_ms", "final_live_head_equal", "kirk_visual_review", "result"}
    exact_keys(evidence, keys, "evidence")
    require(evidence["schema"] == "licensed-assets-evidence/v1", "evidence schema mismatch")
    require(isinstance(evidence["pr_number"], int) and evidence["pr_number"] > 0, "invalid evidence PR")
    for key in ("web_sha", "provider_sha"):
        require(isinstance(evidence[key], str) and HEX40.fullmatch(evidence[key]), f"invalid {key}")
    for key in ("catalog_sha256", "inventory_sha256", "tree_sha256"):
        require(isinstance(evidence[key], str) and HEX64.fullmatch(evidence[key]), f"invalid {key}")
    require(isinstance(evidence["asset_files"], int) and 0 < evidence["asset_files"] <= MAX_STAGE_FILES, "invalid asset count")
    for key in ("functional_pass", "hash_pass", "matrix_pass", "sandbox_pass", "docker_pass", "final_live_head_equal"):
        require(evidence[key] is True, f"evidence gate false: {key}")
    require(evidence["matrix_cases"] == 18, "invalid matrix case count")
    require(evidence["kirk_visual_review"] in {"external-pending", "external-pass"}, "invalid visual scalar")
    require(evidence["result"] == "pass", "invalid evidence result")
    require(isinstance(evidence["perf_median_p95_ms"], (int, float)) and 0 <= evidence["perf_median_p95_ms"] <= 0.05, "invalid perf scalar")
    decoded = raw.decode("utf-8")
    require(not TOKENISH.search(decoded) and not URLISH.search(decoded) and not BLOBISH.search(decoded), "artifact content scan failed")
    return evidence

def write_outputs(path: Path | None, values: Mapping[str, Any]) -> None:
    if path is None:
        return
    with path.open("a", encoding="utf-8") as handle:
        for key, value in values.items():
            text = str(value).lower() if isinstance(value, bool) else str(value)
            require("\n" not in text and "\r" not in text, "unsafe workflow output")
            handle.write(f"{key}={text}\n")

def command_quarantine(args: argparse.Namespace) -> None:
    result = validate_quarantine(Path(args.worktree), expected_sha=args.expected_head_sha, base_sha=args.base_sha)
    write_outputs(Path(args.github_output) if args.github_output else None, result)

def command_provider_stage(args: argparse.Namespace) -> None:
    worktree, private_root, provider, stage = map(Path, (args.worktree, args.private_root, args.provider, args.stage))
    lock = parse_provider_lock(worktree / "src/rendering/visualPlacement/provider-lock.json")
    token = validate_secret_input(os.environ.get("RPG_GAME_ASSETS_READ_TOKEN"), os.environ.get("ASSETS_READ_TOKEN"))
    require(private_root.is_dir() and not private_root.is_symlink(), "private root missing")
    require(not provider.exists() and not stage.exists(), "provider/stage destination exists")
    askpass = private_root / "git-askpass.sh"
    askpass.write_text("#!/bin/sh\ncase \"$1\" in *Username*) printf '%s\\n' x-access-token;; *) printf '%s\\n' \"$RPG_GAME_ASSETS_READ_TOKEN\";; esac\n", encoding="utf-8")
    os.chmod(askpass, 0o700)
    fetch_env = {"PATH": os.environ.get("PATH", "/usr/bin:/bin"), "HOME": str(private_root / "fetch-home"),
                 "GIT_TERMINAL_PROMPT": "0", "GIT_ASKPASS": str(askpass),
                 "RPG_GAME_ASSETS_READ_TOKEN": token, "GIT_CONFIG_NOSYSTEM": "1"}
    Path(fetch_env["HOME"]).mkdir(mode=0o700)
    try:
        provider.mkdir(mode=0o700)
        subprocess.run(["git", "init", "-q", str(provider)], env=fetch_env, check=True,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        subprocess.run(["git", "-C", str(provider), "config", "core.hooksPath", "/dev/null"], env=fetch_env, check=True,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        subprocess.run(["git", "-C", str(provider), "remote", "add", "origin",
                        "https://github.com/KirkDiggler/rpg-game-assets.git"], env=fetch_env, check=True,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        subprocess.run(["git", "-C", str(provider), "fetch", "--no-tags", "--depth=1", "origin",
                        lock["provider"]["commit"]], env=fetch_env, check=True,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=300)
        subprocess.run(["git", "-C", str(provider), "checkout", "-q", "--detach", lock["provider"]["commit"]],
                       env=fetch_env, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired):
        fail("exact provider fetch/checkout failed")
    finally:
        os.environ.pop("RPG_GAME_ASSETS_READ_TOKEN", None)
        os.environ.pop("ASSETS_READ_TOKEN", None)
        if askpass.exists():
            askpass.unlink()
        shutil.rmtree(Path(fetch_env["HOME"]), ignore_errors=True)
    try:
        validate_provider_checkout(provider, worktree, lock)
        run_provider_tools(provider, stage)
        result = validate_inventory(provider, stage, lock)
        result.update({"provider_sha": lock["provider"]["commit"],
                       "catalog_sha256": lock["catalog"]["sha256"],
                       "inventory_sha256": lock["inventory"]["sha256"]})
    finally:
        shutil.rmtree(provider, ignore_errors=True)
    credential_residue(private_root, {k: v for k, v in os.environ.items() if k not in {"GITHUB_TOKEN"}}, provider)
    write_outputs(Path(args.github_output) if args.github_output else None, result)

def validate_hosted_docker_proof(dockerfile: Path) -> None:
    require(dockerfile.is_file() and not dockerfile.is_symlink(), "trusted Dockerfile missing")
    text = dockerfile.read_text(encoding="utf-8")
    require(not re.search(r"(?im)^\s*ADD\s", text), "Dockerfile ADD is forbidden")
    # `docker build --network=none` constrains RUN networking, but the hosted
    # daemon exposes no build flags equivalent to docker-run --cap-drop ALL and
    # --security-opt no-new-privileges. The trusted base also executes npm ci
    # and npm run build before a nonroot USER. Do not silently weaken the run
    # sandbox merely to obtain an image.
    fail("GH-hosted Docker cannot prove nonroot, cap-drop ALL, and no-new-privileges for trusted-base Dockerfile RUN steps")

def command_docker_proof(args: argparse.Namespace) -> None:
    validate_hosted_docker_proof(Path(args.dockerfile))

def command_context(args: argparse.Namespace) -> None:
    result = create_context(Path(args.worktree), args.base_sha, Path(args.destination),
                            Path(args.asset_root) if args.asset_root else None)
    write_outputs(Path(args.github_output) if args.github_output else None, result)

def command_scan_log(args: argparse.Namespace) -> None:
    result = scan_private_log(Path(args.log), args.forbid_canary)
    if args.perf:
        result["perf_median_p95_ms"] = parse_perf_log(Path(args.log))
    write_outputs(Path(args.github_output) if args.github_output else None, result)

def command_residue(args: argparse.Namespace) -> None:
    credential_residue(Path(args.root), dict(os.environ), Path(args.provider) if args.provider else None)

def command_make_artifact(args: argparse.Namespace) -> None:
    evidence = {
        "schema": "licensed-assets-evidence/v1", "pr_number": args.pr_number,
        "web_sha": args.web_sha, "provider_sha": args.provider_sha,
        "catalog_sha256": args.catalog_sha256, "inventory_sha256": args.inventory_sha256,
        "tree_sha256": args.tree_sha256, "asset_files": args.asset_files,
        "functional_pass": True, "hash_pass": True, "matrix_pass": True, "matrix_cases": 18,
        "sandbox_pass": True, "docker_pass": True,
        "perf_median_p95_ms": args.perf_median_p95_ms, "final_live_head_equal": True,
        "kirk_visual_review": args.kirk_visual_review, "result": "pass",
    }
    out = Path(args.output)
    require(not out.exists(), "artifact already exists")
    out.write_text(canonical_json(evidence) + "\n", encoding="utf-8")
    os.chmod(out, 0o600)
    validate_artifact(out)

def command_preflight(args: argparse.Namespace) -> None:
    validate_workflow_identity(event_name=args.event_name, repository=args.repository, actor=args.actor,
                               ref=args.ref, workflow_ref=args.workflow_ref, workflow_sha=args.workflow_sha,
                               run_sha=args.run_sha)
    pr = fetch_pr(args.pr_number, os.environ.get("GITHUB_TOKEN", ""))
    snapshot = validate_pr(pr, number=args.pr_number, expected_sha=args.expected_head_sha, actor=args.actor)
    Path(args.snapshot).write_text(canonical_json(snapshot) + "\n", encoding="utf-8")
    write_outputs(Path(args.github_output) if args.github_output else None,
                  {"validated": True, "head_sha": snapshot["head_sha"], "base_sha": snapshot["base_sha"], "head_ref": snapshot["head_ref"]})

def command_live_check(args: argparse.Namespace) -> None:
    original = {"number": args.pr_number, "head_sha": args.expected_head_sha, "head_ref": args.head_ref,
                "base_sha": args.base_sha, "base_ref": BASE_REF, "head_repo": REPOSITORY,
                "base_repo": REPOSITORY, "author": OWNER, "author_type": "User", "state": "open", "draft": False}
    pr = fetch_pr(args.pr_number, os.environ.get("GITHUB_TOKEN", ""))
    validate_pr(pr, number=args.pr_number, expected_sha=args.expected_head_sha, actor=args.actor,
                checkout_sha=args.expected_head_sha, original=original)

def command_final(args: argparse.Namespace) -> None:
    original = {"number": args.pr_number, "head_sha": args.expected_head_sha, "head_ref": args.head_ref,
                "base_sha": args.base_sha, "base_ref": BASE_REF, "head_repo": REPOSITORY,
                "base_repo": REPOSITORY, "author": OWNER, "author_type": "User", "state": "open", "draft": False}
    pr = fetch_pr(args.pr_number, os.environ.get("GITHUB_TOKEN", ""))
    live_equal = False
    try:
        validate_pr(pr, number=args.pr_number, expected_sha=args.expected_head_sha, actor=args.actor,
                    checkout_sha=args.expected_head_sha, original=original)
        live_equal = True
    finally:
        state = "success" if live_equal and args.licensed_result == "success" else "failure"
        body = canonical_json({"state": state, "context": "licensed-assets/exact-head",
                               "description": "trusted exact-head licensed gate passed" if state == "success" else "trusted exact-head licensed gate failed"}).encode()
        token = os.environ.get("GITHUB_TOKEN", "")
        request = urllib.request.Request(
            f"https://api.github.com/repos/{REPOSITORY}/statuses/{args.expected_head_sha}", data=body, method="POST",
            headers={"Accept": "application/vnd.github+json", "Authorization": f"Bearer {token}",
                     "Content-Type": "application/json", "User-Agent": "trusted-licensed-assets-bootstrap/1"})
        try:
            with urllib.request.urlopen(request, timeout=20) as response:
                require(response.status == 201, "status API did not create status")
        except urllib.error.HTTPError as exc:
            fail(f"status API failed with HTTP {exc.code}")
    require(live_equal, "final live PR equality failed")
    require(args.licensed_result == "success", "licensed job did not succeed")

def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="command", required=True)
    pre = sub.add_parser("preflight")
    for name, required in (("event-name", True), ("repository", True), ("actor", True), ("ref", True),
                           ("workflow-ref", True), ("workflow-sha", True), ("run-sha", True),
                           ("expected-head-sha", True), ("snapshot", True), ("github-output", False)):
        pre.add_argument(f"--{name}", required=required)
    pre.add_argument("--pr-number", type=int, required=True); pre.set_defaults(func=command_preflight)
    final = sub.add_parser("final")
    final.add_argument("--pr-number", type=int, required=True); final.add_argument("--expected-head-sha", required=True)
    final.add_argument("--actor", required=True); final.add_argument("--base-sha", required=True); final.add_argument("--head-ref", required=True)
    final.add_argument("--licensed-result", required=True); final.set_defaults(func=command_final)
    live = sub.add_parser("live-check")
    live.add_argument("--pr-number", type=int, required=True); live.add_argument("--expected-head-sha", required=True)
    live.add_argument("--actor", required=True); live.add_argument("--base-sha", required=True); live.add_argument("--head-ref", required=True)
    live.set_defaults(func=command_live_check)
    quarantine = sub.add_parser("quarantine")
    quarantine.add_argument("--worktree", required=True); quarantine.add_argument("--expected-head-sha", required=True)
    quarantine.add_argument("--base-sha", required=True); quarantine.add_argument("--github-output")
    quarantine.set_defaults(func=command_quarantine)
    provider = sub.add_parser("provider-stage")
    for name in ("worktree", "private-root", "provider", "stage"):
        provider.add_argument(f"--{name}", required=True)
    provider.add_argument("--github-output"); provider.set_defaults(func=command_provider_stage)
    context = sub.add_parser("create-context")
    context.add_argument("--worktree", required=True); context.add_argument("--base-sha", required=True)
    context.add_argument("--destination", required=True); context.add_argument("--asset-root")
    context.add_argument("--github-output"); context.set_defaults(func=command_context)
    docker_proof = sub.add_parser("docker-proof")
    docker_proof.add_argument("--dockerfile", required=True); docker_proof.set_defaults(func=command_docker_proof)
    scan = sub.add_parser("scan-log")
    scan.add_argument("--log", required=True); scan.add_argument("--forbid-canary", action="append", default=[])
    scan.add_argument("--perf", action="store_true"); scan.add_argument("--github-output")
    scan.set_defaults(func=command_scan_log)
    residue = sub.add_parser("residue")
    residue.add_argument("--root", required=True); residue.add_argument("--provider")
    residue.set_defaults(func=command_residue)
    artifact = sub.add_parser("make-artifact")
    artifact.add_argument("--output", required=True); artifact.add_argument("--pr-number", type=int, required=True)
    artifact.add_argument("--web-sha", required=True); artifact.add_argument("--provider-sha", required=True)
    artifact.add_argument("--catalog-sha256", required=True); artifact.add_argument("--inventory-sha256", required=True)
    artifact.add_argument("--tree-sha256", required=True); artifact.add_argument("--asset-files", type=int, required=True)
    artifact.add_argument("--perf-median-p95-ms", type=float, required=True)
    artifact.add_argument("--kirk-visual-review", choices=("external-pending", "external-pass"), default="external-pending")
    artifact.set_defaults(func=command_make_artifact)
    args = parser.parse_args(argv)
    try:
        args.func(args)
        return 0
    except (TrustError, subprocess.TimeoutExpired, json.JSONDecodeError) as exc:
        print(f"trusted gate rejected: {exc}", file=sys.stderr)
        return 1

if __name__ == "__main__":
    raise SystemExit(main())
