import { describe, expect, it } from "vitest";
import {
  classify,
  endedMessage,
  keepWhileOffline,
} from "@/app/(app)/pass/qr/qr-refresh";

describe("classify()", () => {
  it("2xx는 새 코드를 받은 것이다", () => {
    expect(classify(200)).toBe("ok");
    expect(classify(204)).toBe("ok");
  });

  // 되물어도 답이 같다. 화면이 여기서 멈춰야 감사로그가 쌓이지 않는다.
  it.each([400, 401, 403, 404, 429, 499])("%d는 끝난 상태다", (status) => {
    expect(classify(status)).toBe("ended");
  });

  it.each([500, 502, 503, 504])("%d는 일시적이라 다시 묻는다", (status) => {
    expect(classify(status)).toBe("retry");
  });
});

describe("endedMessage()", () => {
  it("세션 만료와 재학 종료는 학생이 할 일이 달라 문구가 갈린다", () => {
    expect(endedMessage("UNAUTHORIZED")).toBe("로그인이 풀렸습니다. 다시 로그인하세요.");
    expect(endedMessage("NOT_ENROLLED")).toBe(
      "현재 학년도 재학생만 학생증을 쓸 수 있습니다.",
    );
    expect(endedMessage("UNAUTHORIZED")).not.toBe(endedMessage("NOT_ENROLLED"));
  });

  it.each([["FORBIDDEN"], ["처음 보는 코드"], [null], [undefined]])(
    "%s는 일반 문구로 떨어진다",
    (reason) => {
      expect(endedMessage(reason as string)).toBe(
        "학생증을 더 쓸 수 없습니다. 화면을 새로 고치세요.",
      );
    },
  );
});

describe("keepWhileOffline()", () => {
  const now = Date.parse("2026-09-03T00:00:20.000Z");

  it("유효 시간이 남았으면 연결이 끊겨도 코드를 남긴다", () => {
    expect(keepWhileOffline("2026-09-03T00:00:40.000Z", now)).toBe(true);
  });

  // 스캔되지 않는 코드를 띄워 두면 학생이 정문에서 그것을 내민다.
  it.each([
    ["지난 코드", "2026-09-03T00:00:00.000Z"],
    ["딱 만료된 코드", "2026-09-03T00:00:20.000Z"],
  ])("%s는 지운다", (_label, validUntil) => {
    expect(keepWhileOffline(validUntil, now)).toBe(false);
  });

  it.each([[null], [undefined], ["언제까지인지 모를 값"]])(
    "%s면 남기지 않는다",
    (validUntil) => {
      expect(keepWhileOffline(validUntil as string, now)).toBe(false);
    },
  );
});
