#!/usr/bin/env node
/**
 * Cross-platform local launcher: RAG (8000) + Sentiment (8001) + Frontend (3000).
 * Usage (from repo root): npm run dev
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import concurrently from "concurrently";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const isWin = process.platform === "win32";

const venvPython = isWin
  ? path.join(root, "venv", "Scripts", "python.exe")
  : path.join(root, "venv", "bin", "python");

function fail(message) {
  console.error(`❌ ${message}`);
  process.exit(1);
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
  // Quote paths with spaces for Windows shells
  const py = `"${venvPython}"`;
  return `${py} -m uvicorn ${appModule} --reload --host 0.0.0.0 --port ${port}`;
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

console.log("Starting SimpliEarn locally...");
if (!only) {
  console.log("  RAG API       → http://127.0.0.1:8000");
  console.log("  Sentiment API → http://127.0.0.1:8001");
  console.log("  Frontend      → http://localhost:3000");
  console.log("Ctrl+C stops all services.\n");
}

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
  }
);

try {
  await result;
} catch {
  process.exit(1);
}
