import Link from "next/link";
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
 * 첨부 목록. 이미지는 그 자리에 보이고 나머지는 링크다.
 *
 * `download` 속성을 붙이지 않는다 — 라우트가 `Content-Disposition`으로 이미
 * 정한다. 둘이 어긋나면 어느 쪽이 이기는지가 브라우저마다 다르다.
 */
export function AttachmentList({
  attachments,
}: {
  attachments: readonly PostAttachment[];
}) {
  if (attachments.length === 0) return null;

  const images = attachments.filter((a) => a.mimeType.startsWith("image/"));
  const files = attachments.filter((a) => !a.mimeType.startsWith("image/"));

  return (
    <div className="mt-6 space-y-3 border-t border-line2 pt-4">
      {images.map((image) => (
        // eslint-disable-next-line @next/next/no-img-element -- 권한이 붙은
        // 라우트에서 오는 파일이라 next/image의 최적화 경로를 못 태운다.
        <img
          key={image.id}
          src={`/api/community/attachments/${image.id}`}
          alt={image.filename}
          className="max-w-full rounded-card border border-line"
        />
      ))}

      {files.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {files.map((file) => (
            <li key={file.id}>
              <Link
                href={`/api/community/attachments/${file.id}`}
                className={buttonClass({ variant: "secondary", size: "sm" })}
              >
                {file.filename}
                <span className="ml-1 text-mut">{formatSize(file.size)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
