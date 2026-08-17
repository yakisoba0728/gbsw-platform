"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Note } from "@/components/ui/note";
import type { MeritTrack } from "@/core/authz/merit-track";
import { exportClassRosterAction, exportStudentHistoryAction } from "./actions";

type SheetResult = {
  error: string | null;
  rows: (string | number)[][];
  filename: string;
};

/** 서버가 돌려준 행렬을 xlsx로 저장한다. 반별 목록과 학생 내역이 공유한다. */
function useSheetDownload(fetchSheet: () => Promise<SheetResult>) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function download() {
    start(async () => {
      setError(null);
      const result = await fetchSheet();
      if (result.error) {
        setError(result.error);
        return;
      }
      // 브라우저 전용 진입점이라 동적 import로 가져온다 — 서버 번들에 들어가면 터진다.
      // 이 버전(4.1.1)은 fileName 옵션을 받지 않는다. 반환값의 .toFile()이 저장을 맡는다.
      const { default: writeXlsxFile } = await import("write-excel-file/browser");
      await writeXlsxFile(result.rows).toFile(result.filename);
    });
  }

  return { pending, error, download };
}

function DownloadButton({
  pending,
  error,
  onClick,
  label,
}: {
  pending: boolean;
  error: string | null;
  onClick: () => void;
  label: string;
}) {
  return (
    <div>
      <Button type="button" variant="secondary" onClick={onClick} disabled={pending}>
        {pending ? "만드는 중…" : label}
      </Button>
      {/* Note는 tone="error"면 role="alert"를 저절로 붙인다. */}
      {error && (
        <Note tone="error" className="mt-2">
          {error}
        </Note>
      )}
    </div>
  );
}

/** 반별 목록을 내보낸다. */
export function ExportButton(props: {
  grade: number;
  classNo: number;
  track: MeritTrack;
  year?: number;
}) {
  const { pending, error, download } = useSheetDownload(() =>
    exportClassRosterAction(props),
  );

  return (
    <DownloadButton
      pending={pending}
      error={error}
      onClick={download}
      label="내보내기"
    />
  );
}

/** 한 학생의 내역을 내보낸다. */
export function ExportHistoryButton(props: {
  studentProfileId: string;
  track: MeritTrack;
  year?: number;
}) {
  const { pending, error, download } = useSheetDownload(() =>
    exportStudentHistoryAction(props),
  );

  return (
    <DownloadButton
      pending={pending}
      error={error}
      onClick={download}
      label="내역 내보내기"
    />
  );
}
