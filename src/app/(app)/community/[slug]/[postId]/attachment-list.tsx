import { buttonClass } from "@/components/ui/button";

export type PostAttachment = {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
};

/** 사람이 읽는 크기. 소수 한 자리면 충분하다. */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

/**
 * 내려받기 주소. **파일 이름을 뒤에 붙인다** — 브라우저가 탭 제목과 저장 이름을
 * 주소의 마지막 조각에서 가져오므로, id만 있으면 PDF를 열었을 때 제목이
 * 무작위 문자열이 된다. 라우트는 이름을 읽지 않는다.
 */
function href(id: string, filename: string): string {
  return `/api/community/attachments/${id}/${encodeURIComponent(filename)}`;
}

/**
 * 첨부 목록. **누르면 내려받는 것이 아니라 보이는 것을 원칙으로 한다.**
 *
 * - 이미지는 글 안에 바로 그린다.
 * - PDF는 브라우저 내장 뷰어로 새 탭에서 연다 (라우트가 `Content-Disposition:
 *   inline`을 준다). 글 안에 `<iframe>`으로 박지 않는 이유는 폰에서 세로를
 *   600px씩 잡아먹고 스크롤이 안쪽과 바깥쪽으로 갈리기 때문이다.
 * - 나머지(한글 문서 포함)는 내려받는다.
 *
 * `download` 속성을 붙이지 않는다 — 라우트의 `Content-Disposition`이 이미
 * 정한다. 둘이 어긋나면 어느 쪽이 이기는지가 브라우저마다 다르다.
 */
export function AttachmentList({
  attachments,
}: {
  attachments: readonly PostAttachment[];
}) {
  if (attachments.length === 0) return null;

  const images = attachments.filter((a) => a.mimeType.startsWith("image/"));
  const rest = attachments.filter((a) => !a.mimeType.startsWith("image/"));

  return (
    <div className="mt-6 space-y-3 border-t border-line2 pt-4">
      {/*
        `next/image`를 쓰지 않는다 — 최적화 서버가 이 주소를 세션 없이 가져오는데
        첨부 라우트는 로그인과 게시판 읽기 권한을 확인하므로 404로 떨어진다.
        원본을 그대로 거는 것이 이 자리에서는 유일하게 동작하는 방법이다.
      */}
      {images.map((image) => (
        // eslint-disable-next-line @next/next/no-img-element -- 위 주석 참고
        <img
          key={image.id}
          src={href(image.id, image.filename)}
          alt={image.filename}
          className="max-w-full rounded-card border border-line"
        />
      ))}

      {rest.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {rest.map((file) => (
            <li key={file.id}>
              <AttachmentLink file={file} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AttachmentLink({ file }: { file: PostAttachment }) {
  const size = <span className="ml-1 text-mut">{formatSize(file.size)}</span>;
  const className = buttonClass({ variant: "secondary", size: "sm" });

  if (file.mimeType === "application/pdf") {
    // 새 탭에서 연다 — 같은 탭이면 뷰어가 글을 덮어 뒤로가기로만 돌아온다.
    return (
      <a
        href={href(file.id, file.filename)}
        target="_blank"
        rel="noopener noreferrer"
        className={className}
      >
        {file.filename}
        {size}
      </a>
    );
  }

  return (
    <a href={href(file.id, file.filename)} className={className}>
      {file.filename}
      {size}
    </a>
  );
}
