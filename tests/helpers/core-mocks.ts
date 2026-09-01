import { vi } from "vitest";

export function coreMocks<const Tag extends string>(tag: Tag) {
  const recordAudit = vi.fn();
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
    txClient,
    prewiredWithTransaction,
    bareWithTransaction,
  };
}
