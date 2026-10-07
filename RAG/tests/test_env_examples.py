"""Every environment variable the code reads is documented in the matching .env.example."""

import re

import pytest

from conftest import RAG_DIR

ROOT = RAG_DIR.parent
# Direct reads plus helper-style reads such as _csv_env("NAME") and env.get("NAME")
PY_READ = re.compile(r"""(?:os\.getenv|os\.environ\.get|os\.environ\[|_csv_env|\bget)\(?\s*["']([A-Z][A-Z0-9_]+)["']""")
TS_READ = re.compile(r"process\.env\.([A-Z][A-Z0-9_]+)")
# Set by the platform or by our own code, not by operators
NOT_CONFIG = {"KMP_DUPLICATE_LIB_OK", "NODE_ENV", "NEXT_RUNTIME", "SIMPLIEARN_PUBLIC_ENV_WARNED"}


def documented(example):
    return set(re.findall(r"^([A-Z][A-Z0-9_]+)=", (ROOT / example).read_text(), re.M))


def reads(paths, pattern):
    found = {}
    for path in paths:
        for name in pattern.findall(path.read_text(encoding="utf-8")):
            if name not in NOT_CONFIG:
                found.setdefault(name, path.relative_to(ROOT).as_posix())
    return found


def python_sources():
    for folder in ("RAG", "sentiment", "scripts"):
        for path in sorted((ROOT / folder).glob("*.py")):
            yield path


def frontend_sources():
    frontend = ROOT / "frontend"
    for pattern in ("*.ts", "app/**/*.ts", "app/**/*.tsx", "components/**/*.tsx", "lib/**/*.ts", "lib/**/*.tsx"):
        for path in sorted(frontend.glob(pattern)):
            if "node_modules" not in path.parts and not path.name.endswith(".d.ts"):
                yield path


def test_scanner_finds_known_reads():
    assert {"SUPABASE_URL", "GEMINI_API_KEY", "DASHBOARD_ADMIN_EMAILS"} <= set(reads(python_sources(), PY_READ))
    assert {"NEXT_PUBLIC_API_URL", "SUPABASE_SERVICE_ROLE_KEY"} <= set(reads(frontend_sources(), TS_READ))


def test_python_env_vars_are_documented():
    backend_docs = documented("RAG/.env.example") | documented("sentiment/.env.example")
    missing = {name: where for name, where in reads(python_sources(), PY_READ).items() if name not in backend_docs}
    assert not missing, f"Add to RAG/.env.example or sentiment/.env.example: {missing}"


def test_frontend_env_vars_are_documented():
    missing = {name: where for name, where in reads(frontend_sources(), TS_READ).items()
               if name not in documented("frontend/.env.example")}
    assert not missing, f"Add to frontend/.env.example: {missing}"


@pytest.mark.parametrize("example", ["RAG/.env.example", "sentiment/.env.example", "frontend/.env.example"])
def test_examples_contain_no_secrets(example):
    for line in (ROOT / example).read_text().splitlines():
        name, _, value = line.partition("=")
        if re.search(r"KEY|TOKEN|SECRET", name) and not line.startswith("#"):
            assert value == "", f"{example}: {name} must be blank"
