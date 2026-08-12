/**
 * 서버 부팅 훅.
 *
 * 등록된 사용자가 하나도 없으면 최초 관리자 생성용 1회성 토큰을 발급하고
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

  console.log(
    [
      "",
      line,
      " 등록된 사용자가 없습니다. 최초 관리자를 생성하세요.",
      "",
      `   ${baseUrl}/register?token=${token}`,
      "",
      " · 이 토큰은 서버를 재시작하면 새로 발급됩니다",
      " · 계정이 생성되면 즉시 무효화됩니다",
      line,
      "",
    ].join("\n"),
  );
}
