import { buttonClass } from "@/components/ui/button";

type PostAttachment = {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

function href(id: string, filename: string): string {
  return `/api/community/attachments/${id}/${encodeURIComponent(filename)}`;
}

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
      {images.map((image) => (
        // eslint-disable-next-line @next/next/no-img-element -- 첨부 인증 쿠키를 원본 요청에 전달한다.
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
  const preview = file.mimeType === "application/pdf";

  return (
    <a
      href={href(file.id, file.filename)}
      target={preview ? "_blank" : undefined}
      rel={preview ? "noopener noreferrer" : undefined}
      className={buttonClass({ variant: "secondary", size: "sm" })}
    >
      {file.filename}
      <span className="ml-1 text-mut">{formatSize(file.size)}</span>
    </a>
  );
}
