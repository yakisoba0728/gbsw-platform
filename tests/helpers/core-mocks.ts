import { vi } from "vitest";

type AuditEntry = {
  action: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
};

export function coreMocks<const Tag extends string>(tag: Tag) {
  const recordAudit = vi.fn();
  const auditEntries = (): AuditEntry[] =>
    recordAudit.mock.calls.map(([entry]) => entry as AuditEntry);
  const txClient = { tx: tag };
  const prewiredWithTransaction = vi.fn(
    async <Result>(
      fn: (tx: typeof txClient) => Promise<Result> | Result,
      _options?: unknown,
    ): Promise<Result> => {
      void _options;
      return fn(txClient);
    },
  );
  const bareWithTransaction = vi.fn();

  return {
    recordAudit,
    auditEntries,
    txClient,
    prewiredWithTransaction,
    bareWithTransaction,
  };
}
