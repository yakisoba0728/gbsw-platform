/**
 * 서버 부팅 훅.
 *
 * 등록된 사용자가 하나도 없으면 최초 교사 생성용 1회성 토큰을 발급하고
 * 접속 URL을 콘솔에 출력한다. 사용자가 있으면 아무것도 하지 않는다.
 */
export async function register() {
  // 이 훅은 edge 런타임에서도 호출된다. DB 접근은 Node에서만.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { describeSenders } = await import(
    "@/modules/verification/verification.sender"
  );
  console.log(`[인증 발송 경로] ${describeSenders()}`);

  const { issueBootstrapTokenIfNeeded } = await import(
    "@/modules/bootstrap/bootstrap.service"
  );

  let token: string | null = null;
  try {
    token = await issueBootstrapTokenIfNeeded();
  } catch (error) {
    // DB가 아직 안 떴을 수 있다. 서버 기동 자체를 막지는 않는다.
    console.warn(
      "[bootstrap] 사용자 수를 확인하지 못했습니다. DB 연결을 확인하세요.",
      error instanceof Error ? error.message : error,
    );
    return;
  }

  if (!token) return;

  const baseUrl = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  const line = "─".repeat(64);

  // 토큰을 완성된 클릭 가능 URL로 조립해 찍지 않는다 (M17) — /register는
  // ?token= 쿼리로만 토큰을 받으므로(입력칸은 없다) 메커니즘 자체는 그대로다.
  // 다만 로그 스트림(docker logs, 중앙 로그 수집기 등)에 남는 이 전권 비밀이
  // 완성된 링크 한 줄로 있으면 로그 뷰어의 자동 링크화·로그를 훑는 도구에
  // 그대로 걸려 한 번의 클릭으로 소진될 수 있다. 주소와 토큰 값을 다른 줄로
  // 나눠, 자동 도구가 보는 건 값이 빠진 주소뿐이게 한다 — 사람이 두 줄을
  // 보고 직접 이어 붙여야 실제 링크가 완성된다. 1회용·재시작 시 회전이라는
  // 완화는 그대로 유지된다.
  console.log(
    [
      "",
      line,
      " 등록된 사용자가 없습니다. 최초 교사 계정을 만드세요.",
      "",
      `   주소: ${baseUrl}/register?token=`,
      `   토큰: ${token}`,
      "   (주소 끝에 토큰을 이어 붙여 접속하세요)",
      "",
      " · 이 토큰은 서버를 재시작하면 새로 발급됩니다",
      " · 계정이 생성되면 즉시 무효화됩니다",
      line,
      "",
    ].join("\n"),
  );
}
