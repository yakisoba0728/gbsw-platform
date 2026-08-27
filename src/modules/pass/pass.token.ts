import { createHmac, hkdfSync, timingSafeEqual } from "node:crypto";

/**
 * 학생증 QR의 코드. **DB도 시계도 모른다** — 학생 프로필 id에 서명을 붙인 것이
 * 전부다. 이 코드가 무엇을 뜻하는지(지금 나가도 되는가)는 verify.service가 정한다.
 *
 * **고정 코드다.** 출입증 한 건마다 20초짜리 코드를 새로 찍던 방식을 걷어냈다.
 * 학생증처럼 한 장이 계속 통하고, 그래서 잃는 것과 얻는 것이 분명하다 —
 *
 *   잃는 것: 화면을 찍어 둔 사진이 영원히 통한다. 코드만 바꿔 무효로 만들 길도
 *            없다(재발급하려면 BETTER_AUTH_SECRET을 갈아야 하고 그러면 전교가
 *            한꺼번에 바뀐다).
 *   얻는 것: 이 코드는 **허가가 아니라 신원**이다. 찍으면 「이 학생이 지금
 *            나가도 되는가」를 서버가 그 자리에서 판정하므로, 사진을 든 사람이
 *            얻는 것은 남의 이름이 뜨는 화면뿐이다 — 정문에 선 사람은 그 이름의
 *            주인이 아니다. 판독 화면 자체도 로그인을 요구한다.
 *
 * 회전이 필요하면 아래 info의 `v1`을 올린다. 그 시각 이후 모든 학생증이 갈린다.
 */

/** 서명 길이(바이트). 12바이트 = 96비트 → base64url 16글자. */
const SIG_BYTES = 12;

const PROFILE_ID = /^[a-z0-9]{10,64}$/;
const SIGNATURE = /^[A-Za-z0-9_-]{16}$/;

/**
 * 서명 키. 새 환경변수를 만들지 않고 BETTER_AUTH_SECRET에서 파생한다 —
 * 이 값이 새는 경로는 그 값이 새는 경로와 같고(같은 프로세스의 환경변수),
 * 따로 두면 관리 지점만 하나 는다.
 *
 * info가 `gbsw-student-qr-v1`이다. 옛 출입증 토큰(`gbsw-pass-qr-v1`)과 키가
 * 갈리므로, 어딘가 남아 있던 옛 QR은 서명이 아예 안 맞는다.
 */
function signingKey(): Buffer {
  const base = process.env.BETTER_AUTH_SECRET;
  if (!base) {
    throw new Error("BETTER_AUTH_SECRET 환경변수가 없습니다.");
  }
  return Buffer.from(hkdfSync("sha256", base, "", "gbsw-student-qr-v1", 32));
}

function sign(profileId: string): string {
  return createHmac("sha256", signingKey())
    .update(profileId)
    .digest()
    .subarray(0, SIG_BYTES)
    .toString("base64url");
}

export function issueStudentCode(studentProfileId: string): string {
  return `${studentProfileId}.${sign(studentProfileId)}`;
}

export type CodeResult = { studentProfileId: string } | "MALFORMED";

/**
 * 두 갈래뿐이다. 시간이 사라져 「형식은 맞는데 지났다」가 없다 — 서명이 맞으면
 * 그 학생이고, 아니면 우리 코드가 아니다. 그 프로필이 실재하는지는 서비스가 본다.
 */
export function verifyStudentCode(code: string): CodeResult {
  const dot = code.indexOf(".");
  if (dot <= 0) return "MALFORMED";

  const studentProfileId = code.slice(0, dot);
  const signature = code.slice(dot + 1);
  if (!PROFILE_ID.test(studentProfileId) || !SIGNATURE.test(signature)) {
    return "MALFORMED";
  }

  return constantTimeEquals(signature, sign(studentProfileId))
    ? { studentProfileId }
    : "MALFORMED";
}

function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
