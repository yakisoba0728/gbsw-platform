import { describe, expect, it, vi } from "vitest";

const { readCappedBody } = await import("@/lib/capped-body");

// readCappedBody가 쓰는 것은 request.body 하나뿐이라 스트림만 갈아 끼운다.
function requestOf(
  chunks: Uint8Array[],
  onCancel: () => void = () => {},
): Request {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
    cancel() {
      onCancel();
    },
  });
  return { body: stream } as unknown as Request;
}

describe("readCappedBody", () => {
  it("상한 안의 본문은 조각을 이어 붙여 그대로 돌려준다", async () => {
    const request = requestOf([new Uint8Array([1, 2]), new Uint8Array([3])]);

    await expect(readCappedBody(request, 16)).resolves.toEqual(
      Buffer.from([1, 2, 3]),
    );
  });

  it("상한과 같은 크기는 통과하고 한 바이트만 넘어도 거절한다", async () => {
    const exact = requestOf([new Uint8Array(4)]);
    const over = requestOf([new Uint8Array(5)]);

    await expect(readCappedBody(exact, 4)).resolves.toHaveLength(4);
    await expect(readCappedBody(over, 4)).resolves.toBeNull();
  });

  it("초과분은 모아 두지 않고 버리되 스트림을 취소하지 않는다", async () => {
    const cancel = vi.fn();
    const request = requestOf(
      [new Uint8Array(8), new Uint8Array(8), new Uint8Array(8)],
      cancel,
    );

    await expect(readCappedBody(request, 4)).resolves.toBeNull();
    // 취소하면 Node 본문 파서가 예외를 내므로 끝까지 읽어야 한다.
    expect(cancel).not.toHaveBeenCalled();
  });

  it("본문이 없는 요청은 빈 버퍼로 돌려준다", async () => {
    const request = { body: null } as unknown as Request;

    await expect(readCappedBody(request, 4)).resolves.toEqual(Buffer.alloc(0));
  });
});
