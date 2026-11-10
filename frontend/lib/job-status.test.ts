import assert from "node:assert/strict";
import { test } from "node:test";

import { JOB_NOT_FOUND_ERROR, readJobStatus } from "./job-status.ts";

test("a job the API cannot find is a failure, not a finished dashboard", () => {
  assert.deepEqual(readJobStatus(404, { detail: "Job not found" } as never), { kind: "failed", error: JOB_NOT_FOUND_ERROR });
});

test("completed loads the dashboard; failed shows the job's error", () => {
  assert.deepEqual(readJobStatus(200, { status: "completed" }), { kind: "done" });
  assert.deepEqual(readJobStatus(200, { status: "failed", error: "boom" }), { kind: "failed", error: "boom" });
  assert.deepEqual(readJobStatus(200, { status: "failed", error: null }), { kind: "failed", error: "Unknown error" });
});

test("queued and running keep polling with their status", () => {
  for (const status of ["pending", "running"]) {
    assert.deepEqual(readJobStatus(200, { status }), { kind: "waiting", status });
  }
});

test("server errors and unreadable bodies are retried", () => {
  assert.deepEqual(readJobStatus(500, { status: "completed" }), { kind: "retry" });
  assert.deepEqual(readJobStatus(503, null), { kind: "retry" });
  assert.deepEqual(readJobStatus(200, null), { kind: "retry" });
});
