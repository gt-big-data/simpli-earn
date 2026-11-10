/** What a dashboard job-status poll means for the page: load the dashboard, show an error, or keep polling. */
export type JobPoll =
  | { kind: "done" }
  | { kind: "failed"; error: string }
  | { kind: "waiting"; status: string }
  | { kind: "retry" };

export const JOB_NOT_FOUND_ERROR =
  "This processing job could not be found (the server may have restarted). Submit the link again to retry.";

export function readJobStatus(httpStatus: number, body: { status?: string; error?: string | null } | null): JobPoll {
  // An unknown job never finishes; loading the dashboard now would show data that does not exist yet
  if (httpStatus === 404) return { kind: "failed", error: JOB_NOT_FOUND_ERROR };
  if (httpStatus < 200 || httpStatus >= 300 || !body?.status) return { kind: "retry" };
  if (body.status === "completed") return { kind: "done" };
  if (body.status === "failed") return { kind: "failed", error: body.error || "Unknown error" };
  return { kind: "waiting", status: body.status };
}
