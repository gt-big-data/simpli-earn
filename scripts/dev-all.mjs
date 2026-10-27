#!/usr/bin/env node
/**
 * Cross-platform local launcher: RAG (8000) + Sentiment (8001) + Frontend (3000).
 *
 *   npm run dev          — quiet backends + clear URL banner
 *   npm run dev:verbose  — full logs from all services
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import concurrently from "concurrently";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const isWin = process.platform === "win32";
const verbose = process.argv.includes("--verbose");

const venvPython = isWin
  ? path.join(root, "venv", "Scripts", "python.exe")
  : path.join(root, "venv", "bin", "python");

const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;

function fail(message) {
  console.error(`❌ ${message}`);
  process.exit(1);
}

function printBanner() {
  const line = "═".repeat(48);
  console.log("");
  console.log(green(bold(line)));
  console.log(green(bold("  SimpliEarn")));
  console.log(green(bold(`  App → http://localhost:3000`)));
  console.log(dim("  RAG        http://127.0.0.1:8000"));
  console.log(dim("  Sentiment  http://127.0.0.1:8001"));
  console.log(green(bold(line)));
  console.log(dim("  Ctrl+C stops all services"));
  if (!verbose) {
    console.log(dim("  Quiet mode (backends hidden). Full logs: npm run dev:verbose"));
  } else {
    console.log(dim("  Verbose mode — showing all service logs"));
  }
  console.log("");
}

if (!fs.existsSync(venvPython)) {
  fail(
    [
      "Python venv not found at ./venv",
      "Create it first:",
      "  python3 -m venv venv",
      isWin
        ? "  venv\\Scripts\\pip install -r RAG\\requirements.txt -r sentiment\\requirements.txt"
        : "  source venv/bin/activate && pip install -r RAG/requirements.txt -r sentiment/requirements.txt",
    ].join("\n")
  );
}

const frontendDir = path.join(root, "frontend");
if (!fs.existsSync(path.join(frontendDir, "node_modules"))) {
  console.warn(
    "⚠️  frontend/node_modules missing — run: cd frontend && npm install"
  );
}

const only = process.argv.includes("--only")
  ? process.argv[process.argv.indexOf("--only") + 1]
  : null;

function uvicornCmd(appModule, port) {
  const py = `"${venvPython}"`;
  const logLevel = verbose ? "info" : "warning";
  return `${py} -m uvicorn ${appModule} --reload --host 0.0.0.0 --port ${port} --log-level ${logLevel}`;
}

const services = [
  {
    id: "rag",
    name: "rag",
    prefixColor: "blue",
    command: uvicornCmd("api_chatbot:app", 8000),
    cwd: path.join(root, "RAG"),
  },
  {
    id: "sentiment",
    name: "sentiment",
    prefixColor: "magenta",
    command: uvicornCmd("api:app", 8001),
    cwd: path.join(root, "sentiment"),
  },
  {
    id: "frontend",
    name: "web",
    prefixColor: "green",
    command: "npm run dev",
    cwd: frontendDir,
  },
];

const selected = only
  ? services.filter((s) => s.id === only)
  : services;

if (only && selected.length === 0) {
  fail(`Unknown service "${only}". Use: rag | sentiment | frontend`);
}

printBanner();

// In quiet mode, hide backend prefixes so the Next.js "Local:" line is easy to spot.
const hide =
  !verbose && !only
    ? selected.filter((s) => s.id !== "frontend").map((s) => s.name)
    : [];

const { result } = concurrently(
  selected.map(({ name, prefixColor, command, cwd }) => ({
    name,
    prefixColor,
    command,
    cwd,
  })),
  {
    killOthersOn: ["failure", "success"],
    restartTries: 0,
    cwd: root,
    hide,
  }
);

try {
  await result;
} catch {
  process.exit(1);
}
