export async function register() {
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
    console.warn(
      "[bootstrap] 사용자 수를 확인하지 못했습니다. DB 연결을 확인하세요.",
      error instanceof Error ? error.message : error,
    );
    return;
  }

  if (!token) return;

  const baseUrl = process.env.BETTER_AUTH_URL || "http://localhost:3000";
  const line = "─".repeat(64);

  // 로그 뷰어가 토큰 포함 링크를 자동 방문하지 않도록 주소와 토큰을 나눈다.
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
