import { sqlite } from "./sqlite.js";

const insertAuditLog = sqlite.prepare<[string, string, string | null]>(
  "INSERT INTO audit_log (action, target, details) VALUES (?, ?, ?)"
);

export function logAction(
  action: string,
  target: string,
  details?: Record<string, unknown>
): void {
  insertAuditLog.run(action, target, details ? JSON.stringify(details) : null);
}
