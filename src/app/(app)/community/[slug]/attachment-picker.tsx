"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Note } from "@/components/ui/note";
import { TruncatedText } from "@/components/ui/truncated-text";

export type PickedAttachment = { id: string; filename: string; size: number };

async function errorText(res: Response): Promise<string> {
  try {
    const json = (await res.json()) as { error?: string };
    if (json.error) return json.error;
  } catch {
    // JSON이 아니다 — 아래 상태 코드로 떨어진다.
  }
  if (res.status === 413) return "파일이 너무 큽니다.";
  if (res.status === 401) return "로그인이 필요합니다. 새로고침 후 다시 시도해 주세요.";
  return "올리지 못했습니다.";
}

export function AttachmentPicker({
  slug,
  id,
  initial = [],
  max,
}: {
  slug: string;
  id?: string;
  initial?: PickedAttachment[];
  max: number;
}) {
  const [files, setFiles] = useState<PickedAttachment[]>(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function pick(list: FileList | null) {
    if (!list || list.length === 0) return;
    setError(null);
    setBusy(true);

    try {
      let current = files;
      for (const file of Array.from(list)) {
        if (current.length >= max) {
          setError(`첨부는 ${max}개까지 넣을 수 있습니다.`);
          break;
        }

        const body = new FormData();
        body.append("file", file);

        const res = await fetch(
          `/api/community/attachments?slug=${encodeURIComponent(slug)}`,
          { method: "POST", body },
        );

        if (!res.ok) {
          setError(await errorText(res));
          break;
        }

        const json = (await res.json()) as PickedAttachment;
        current = [...current, { id: json.id, filename: json.filename, size: json.size }];
        setFiles(current);
      }
    } catch {
      setError("올리지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-2">
      {files.map((file) => (
        <div key={file.id} className="flex items-center justify-between gap-3">
          <input type="hidden" name="attachmentIds" value={file.id} />
          <TruncatedText full={file.filename} outerClassName="min-w-0 flex-1">
            <span className="block truncate text-sm">{file.filename}</span>
          </TruncatedText>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setFiles((prev) => prev.filter((f) => f.id !== file.id))}
          >
            빼기
          </Button>
        </div>
      ))}

      <input
        ref={inputRef}
        id={id}
        type="file"
        multiple
        aria-label="첨부파일 고르기"
        disabled={busy || files.length >= max}
        onChange={(event) => void pick(event.target.files)}
        className="block w-full text-sm text-mut file:mr-3 file:rounded-btn file:border file:border-line-strong file:bg-surface file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-ink"
      />

      <p className="text-caption text-mut">
        파일당 20MB, {max}개까지. 이미지·PDF·한글·오피스 문서·zip을 올릴 수 있습니다.
      </p>

      {error && <Note tone="error">{error}</Note>}
    </div>
  );
}
