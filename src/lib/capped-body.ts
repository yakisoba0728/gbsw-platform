// 라우트 핸들러에는 서버 액션의 bodySizeLimit(next.config.ts)이 걸리지 않는다 —
// 본문을 읽는 쪽이 스스로 세어 끊어야 한다. 로그인과 첨부가 함께 쓰므로 한 벌만 둔다.
// 상한을 넘으면 null을 돌려주고, 부르는 쪽이 자기 오류 규약대로 응답한다.
export async function readCappedBody(
  request: Request,
  max: number,
): Promise<Buffer | null> {
  const body = request.body;
  if (!body) return Buffer.alloc(0);

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let seen = 0;
  let over = false;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    seen += value.byteLength;
    // 취소하면 Node 본문 파서가 예외를 내므로 초과분은 버리며 끝까지 읽는다.
    if (over) continue;
    if (seen > max) {
      over = true;
      chunks.length = 0;
      continue;
    }
    chunks.push(value);
  }

  return over ? null : Buffer.concat(chunks);
}
