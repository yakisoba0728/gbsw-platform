"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Note } from "@/components/ui/note";
import { TruncatedText } from "@/components/ui/truncated-text";

export type PickedAttachment = { id: string; filename: string; size: number };

/**
 * 파일을 고르면 **곧바로 라우트 핸들러로 올리고** id만 폼에 싣는다.
 *
 * 서버 액션으로 파일을 보내지 않는 이유는 `next.config.ts`의
 * `serverActions.bodySizeLimit`(6mb)이 액션 전체에 걸려서다 — 첨부를 위해 그
 * 값을 올리면 명단 업로드까지 함께 커진다.
 *
 * 「빼기」는 목록에서만 뺀다. 서버 행은 남고, 글에 안 붙은 채 한 시간이 지나면
 * 다음 업로드 때 고아 정리가 지운다. 수정 화면에서 뺀 기존 첨부는 저장할 때
 * `detachFromPost`가 디스크까지 지운다.
 */
export function AttachmentPicker({
  slug,
  initial = [],
  max,
}: {
  slug: string;
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

    // 한 번에 여럿 골라도 하나씩 보낸다 — 상한과 오류가 파일마다 다르다.
    let current = files;
    for (const file of Array.from(list)) {
      if (current.length >= max) {
        setError(`첨부는 ${max}개까지 넣을 수 있습니다.`);
        break;
      }

      const body = new FormData();
      body.append("slug", slug);
      body.append("file", file);

      const res = await fetch("/api/community/attachments", { method: "POST", body });
      const json = (await res.json()) as PickedAttachment & { error?: string };
      if (!res.ok) {
        setError(json.error ?? "올리지 못했습니다.");
        break;
      }

      current = [...current, { id: json.id, filename: json.filename, size: json.size }];
      setFiles(current);
    }

    setBusy(false);
    // 같은 파일을 다시 고를 수 있게 비운다 — 안 비우면 change가 안 뜬다.
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="space-y-2">
      {files.map((file) => (
        <div key={file.id} className="flex items-center justify-between gap-3">
          {/* 폼이 서버 액션으로 보내는 것은 이 id뿐이다. */}
          <input type="hidden" name="attachmentIds" value={file.id} />
          {/* 파일 이름이 잘리면 무엇을 빼는지 모른 채 「빼기」를 누르게 된다. */}
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
        type="file"
        multiple
        aria-label="첨부파일 고르기"
        disabled={busy || files.length >= max}
        onChange={(event) => void pick(event.target.files)}
        className="block w-full text-sm text-mut file:mr-3 file:rounded-btn file:border file:border-line-strong file:bg-surface file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-ink"
      />

      <p className="text-caption text-mut">
        파일당 5MB, {max}개까지. 이미지·PDF·한글·오피스 문서·zip을 올릴 수 있습니다.
      </p>

      {error && <Note tone="error">{error}</Note>}
    </div>
  );
}
