export type PostDraft = {
  title: string;
  body: string;
  nonce: string;
  savedAt: number;
};

/** 오래된 글이 몇 달 뒤 갑자기 되살아나지 않게 일주일만 보관한다. */
export const POST_DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const POST_DRAFT_NONCE_PATTERN = /^[a-f0-9]{32}$/;

export function postDraftKey(userId: string, slug: string): string {
  // 사용자까지 묶는다 — 같은 브라우저에서 로그아웃 뒤 다른 사람이 로그인해도
  // 앞사람의 작성 중 내용을 보여 주지 않는다.
  return `gbsw:community:new-post:${userId}:${slug}`;
}

export function serializePostDraft(
  values: Pick<PostDraft, "title" | "body" | "nonce">,
  now = Date.now(),
): string {
  return JSON.stringify({ ...values, savedAt: now } satisfies PostDraft);
}

export function createPostDraftNonce(): string {
  return crypto.randomUUID().replaceAll("-", "");
}

/** 제출 뒤 입력에는 새 난수를 붙여 이전 제출의 성공 cleanup과 갈라 놓는다. */
export function postDraftNonceAfterSubmission(
  currentNonce: string,
  submittedNonce: string | null,
  createNonce: () => string = createPostDraftNonce,
): string {
  return currentNonce === submittedNonce ? createNonce() : currentNonce;
}

/** 실패 응답이 돌려준 값보다 제출 뒤 따로 저장된 초안이 최신인지 판별한다. */
export function postDraftIsNewerThanSubmission(
  draftNonce: string,
  submittedNonce: string | null,
): boolean {
  return submittedNonce !== null && draftNonce !== submittedNonce;
}

/** 저장 지연 중인 값은 sessionStorage에 남은 이전 값보다 항상 최신이다. */
export function postDraftForRestore(
  storedDraft: PostDraft | null,
  pendingDraft: Pick<PostDraft, "title" | "body" | "nonce"> | null,
  now = Date.now(),
): PostDraft | null {
  return pendingDraft ? { ...pendingDraft, savedAt: now } : storedDraft;
}

export function parsePostDraftNonce(value: unknown): string | null {
  return typeof value === "string" && POST_DRAFT_NONCE_PATTERN.test(value)
    ? value
    : null;
}

export function postDraftCompletionHash(nonce: string): string {
  return `#created=${nonce}`;
}

export function postDraftNonceFromHash(hash: string): string | null {
  return hash.startsWith("#created=")
    ? parsePostDraftNonce(hash.slice("#created=".length))
    : null;
}

export function parsePostDraft(
  raw: string,
  now = Date.now(),
): PostDraft | null {
  try {
    const candidate: unknown = JSON.parse(raw);
    if (!candidate || typeof candidate !== "object") return null;

    const { title, body, nonce, savedAt } = candidate as Partial<PostDraft>;
    const parsedNonce = parsePostDraftNonce(nonce);
    if (
      typeof title !== "string" ||
      typeof body !== "string" ||
      parsedNonce === null ||
      typeof savedAt !== "number" ||
      !Number.isFinite(savedAt) ||
      savedAt > now ||
      now - savedAt > POST_DRAFT_MAX_AGE_MS ||
      title.length > 200 ||
      body.length > 20_000
    ) {
      return null;
    }

    return { title, body, nonce: parsedNonce, savedAt };
  } catch {
    return null;
  }
}

/** 성공 redirect의 난수와 현재 브라우저 초안이 같은 제출에서 왔는지 확인한다. */
export function postDraftMatchesCompletion(
  rawDraft: string,
  hash: string,
  now = Date.now(),
): boolean {
  const nonce = postDraftNonceFromHash(hash);
  if (!nonce) return false;
  return parsePostDraft(rawDraft, now)?.nonce === nonce;
}
