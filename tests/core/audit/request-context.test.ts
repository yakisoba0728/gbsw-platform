import { beforeEach, describe, expect, it, vi } from "vitest";

const headers = vi.fn();
vi.mock("next/headers", () => ({ headers }));

const { readRequestContext } = await import("@/core/audit/request-context");

/**
 * 감사로그의 접속 정보이자, 인증코드 **IP별 발송 제한의 입력**이다.
 *
 * verification.service.ts는 IP별 20회/시간으로 알리고 잔액 소진과 학교 이름
 * 스팸을 막는다(대상별 5회/시간은 공격자가 번호를 바꾸면 우회되므로 두 번째
 * 방어선이다). 그 방어선이 서 있는 값이 여기서 나온다 — 여기가 조용히 null을
 * 돌려주면 제한이 통째로 꺼지고, 잘못된 IP를 돌려주면 엉뚱한 사람이 막힌다.
 *
 * 지금까지 audit.test.ts·verification.service.test.ts는 이 함수를 **목으로
 * 대체**했다. 목이 돌려주던 값이 실제로 나오는 값인지는 아무도 보지 않았다.
 */

/** 실제 Headers를 넘긴다 — get()의 대소문자 무시 동작까지 그대로 태운다. */
function requestWith(init: Record<string, string>) {
  headers.mockResolvedValue(new Headers(init));
}

describe("readRequestContext() — IP", () => {
  beforeEach(() => {
    headers.mockReset();
  });

  it("리버스 프록시 뒤에서는 x-forwarded-for의 첫 항목이 원 IP다 — 뒤 항목은 프록시 자신이라 그걸 쓰면 전교생이 한 버킷에 들어간다", async () => {
    requestWith({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" });
    await expect(readRequestContext()).resolves.toMatchObject({ ip: "1.2.3.4" });
  });

  it("첫 항목의 앞뒤 공백을 지운다 — 공백이 붙으면 같은 IP가 다른 버킷으로 세어진다", async () => {
    requestWith({ "x-forwarded-for": "  1.2.3.4  , 5.6.7.8" });
    await expect(readRequestContext()).resolves.toMatchObject({ ip: "1.2.3.4" });
  });

  it("항목이 하나뿐이어도 그대로 읽는다", async () => {
    requestWith({ "x-forwarded-for": "203.0.113.9" });
    await expect(readRequestContext()).resolves.toMatchObject({ ip: "203.0.113.9" });
  });

  it("IPv6도 그대로 통과시킨다 — 자르거나 정규화하지 않는다", async () => {
    requestWith({ "x-forwarded-for": "2001:db8::1, 5.6.7.8" });
    await expect(readRequestContext()).resolves.toMatchObject({ ip: "2001:db8::1" });
  });

  it("헤더 이름의 대소문자를 가리지 않는다", async () => {
    requestWith({ "X-Forwarded-For": "1.2.3.4" });
    await expect(readRequestContext()).resolves.toMatchObject({ ip: "1.2.3.4" });
  });

  it("x-forwarded-for가 없으면 x-real-ip로 떨어진다 — 프록시를 안 쓰는 배치에서도 제한이 살아 있어야 한다", async () => {
    requestWith({ "x-real-ip": "198.51.100.7" });
    await expect(readRequestContext()).resolves.toMatchObject({ ip: "198.51.100.7" });
  });

  it("x-forwarded-for가 있으면 x-real-ip보다 우선한다", async () => {
    requestWith({ "x-forwarded-for": "1.2.3.4", "x-real-ip": "9.9.9.9" });
    await expect(readRequestContext()).resolves.toMatchObject({ ip: "1.2.3.4" });
  });

  it("x-forwarded-for가 비어 있으면 x-real-ip로 떨어진다", async () => {
    requestWith({ "x-forwarded-for": "", "x-real-ip": "198.51.100.7" });
    await expect(readRequestContext()).resolves.toMatchObject({ ip: "198.51.100.7" });
  });

  it("첫 항목만 비어 있어도 두 번째 항목으로 넘어가지 않고 x-real-ip로 떨어진다 — 뒤 항목은 프록시 주소라 원 IP가 아니다", async () => {
    requestWith({ "x-forwarded-for": " , 5.6.7.8", "x-real-ip": "198.51.100.7" });
    await expect(readRequestContext()).resolves.toMatchObject({ ip: "198.51.100.7" });
  });

  it("x-real-ip의 공백도 지운다", async () => {
    requestWith({ "x-real-ip": "  198.51.100.7  " });
    await expect(readRequestContext()).resolves.toMatchObject({ ip: "198.51.100.7" });
  });

  it("아무 헤더도 없으면 ip는 null이다 — 빈 문자열이면 안 된다. verification.service는 `if (ip)`로 IP별 제한을 건너뛰므로, ''도 null과 같이 건너뛰어야 하고 실제로 null로 정규화된다", async () => {
    requestWith({});
    await expect(readRequestContext()).resolves.toEqual({ ip: null, userAgent: null });
  });

  it("두 헤더 모두 공백뿐이면 null이다 — 공백 문자열이 새어 나가면 서로 다른 요청들이 한 버킷에 묶여 남의 한도를 갉아먹는다", async () => {
    requestWith({ "x-forwarded-for": "   ", "x-real-ip": "  " });
    await expect(readRequestContext()).resolves.toMatchObject({ ip: null });
  });
});

describe("readRequestContext() — User-Agent", () => {
  beforeEach(() => {
    headers.mockReset();
  });

  it("그대로 읽는다", async () => {
    requestWith({ "user-agent": "Mozilla/5.0" });
    await expect(readRequestContext()).resolves.toMatchObject({ userAgent: "Mozilla/5.0" });
  });

  it("헤더가 없으면 null이다", async () => {
    requestWith({ "x-real-ip": "1.2.3.4" });
    await expect(readRequestContext()).resolves.toMatchObject({ userAgent: null });
  });

  it.each([199, 200])("%d자는 자르지 않는다 — 경계 바로 아래·위에서 한 글자씩 밀리지 않게", async (length) => {
    const ua = "U".repeat(length);
    requestWith({ "user-agent": ua });
    const { userAgent } = await readRequestContext();
    expect(userAgent).toBe(ua);
    expect(userAgent).toHaveLength(length);
  });

  it("201자는 200자로 자른다 — DB 컬럼과 감사로그 열람 화면이 감당할 길이다", async () => {
    requestWith({ "user-agent": `${"U".repeat(200)}X` });
    const { userAgent } = await readRequestContext();
    expect(userAgent).toHaveLength(200);
    expect(userAgent).toBe("U".repeat(200));
  });

  it("아주 긴 UA도 정확히 200자로 자른다 — 잘린 값은 앞부분이다", async () => {
    const ua = `Mozilla/5.0 ${"x".repeat(5000)}`;
    requestWith({ "user-agent": ua });
    const { userAgent } = await readRequestContext();
    expect(userAgent).toHaveLength(200);
    expect(userAgent).toBe(ua.slice(0, 200));
  });

  it("빈 문자열 UA는 null이 아니라 빈 문자열 그대로다 (현재 동작)", async () => {
    requestWith({ "user-agent": "" });
    await expect(readRequestContext()).resolves.toMatchObject({ userAgent: "" });
  });
});

describe("readRequestContext() — 요청 밖에서 불렀을 때", () => {
  beforeEach(() => {
    headers.mockReset();
  });

  /**
   * 가장 중요한 케이스다. recordAudit()이 매번 이 함수를 부르므로, 여기서 예외가
   * 밖으로 나가면 감사 기록 실패가 본 동작(상벌점 부여·계정 수정)을 되돌린다 —
   * "감사 실패가 본 동작을 되돌리면 안 된다"(core/audit/audit.ts)는 규약이
   * 이 try/catch에 걸려 있다. instrumentation 훅·시드 스크립트가 실제 경로다.
   */
  it("headers()가 던지면 예외를 밖으로 내보내지 않고 빈 컨텍스트로 떨어진다", async () => {
    headers.mockImplementation(() => {
      throw new Error("`headers` was called outside a request scope.");
    });

    await expect(readRequestContext()).resolves.toEqual({ ip: null, userAgent: null });
  });

  it("headers()가 거부(reject)해도 마찬가지다 — 비동기 API라 던지는 방식이 두 갈래다", async () => {
    headers.mockRejectedValue(new Error("`headers` was called outside a request scope."));

    await expect(readRequestContext()).resolves.toEqual({ ip: null, userAgent: null });
  });

  it("헤더 객체가 망가져 get()이 던져도 빈 컨텍스트로 떨어진다", async () => {
    headers.mockResolvedValue({
      get() {
        throw new TypeError("not a Headers");
      },
    });

    await expect(readRequestContext()).resolves.toEqual({ ip: null, userAgent: null });
  });

  it("빈 컨텍스트의 ip가 null이므로 verification.service의 IP별 제한은 건너뛴다 — null을 한 버킷으로 묶으면 스크립트·프록시 미설정 요청들이 서로의 한도를 갉아먹는다 (verification.service.ts의 `if (ip)`)", async () => {
    headers.mockRejectedValue(new Error("outside request scope"));

    const { ip } = await readRequestContext();
    expect(ip).toBeNull();
  });
});
