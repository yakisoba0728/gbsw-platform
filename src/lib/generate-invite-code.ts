import "server-only";
import { randomInt } from "node:crypto";
import { ALPHABET, BODY_LENGTH, PREFIX } from "./invite-code";

/**
 * 초대코드 생성. 저장 형태는 하이픈 없는 `GBSWXXXXXXXX`다.
 *
 * randomInt는 모듈로 편향 없이 균등하게 뽑는다 (`% ALPHABET.length`를 쓰면 안 된다).
 * 31^8 ≈ 8.5 × 10^11 이고, 여기에 이름·생년월일 대조와 5회 실패 폐기가 더해진다.
 *
 * `node:crypto`를 무는 이 함수만 별도 파일로 뗐다 (M15) — formatInviteCode처럼
 * crypto가 필요 없는 함수들과 한 파일에 있으면, "use client" 파일(import-form.tsx)이
 * formatInviteCode만 쓰려 해도 번들러가 이 파일 전체를 분석 대상에 올린다. 지금
 * 트리셰이킹으로는 브라우저 번들에 안 들어가지만 그건 번들러 버전에 기대는
 * 우연이라, `import "server-only"`로 실수로라도 클라이언트 컴포넌트가 이 파일을
 * 끌어오면 빌드 타임에 바로 잡히게 한다.
 */
export function generateInviteCode(): string {
  let body = "";
  for (let i = 0; i < BODY_LENGTH; i += 1) {
    body += ALPHABET[randomInt(ALPHABET.length)];
  }
  return PREFIX + body;
}
