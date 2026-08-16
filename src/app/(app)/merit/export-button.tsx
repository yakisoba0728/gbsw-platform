"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import type { MeritTrack } from "@/core/authz/merit-track";
import { exportClassRosterAction, exportStudentHistoryAction } from "./actions";

type SheetResult = {
  error: string | null;
  rows: (string | number)[][];
  filename: string;
};

/**
 * 서버가 돌려준 행렬을 xlsx로 저장한다. 반별 목록과 학생 내역이 공유한다 —
 * 다른 것은 어느 액션을 부르는가뿐이다.
 */
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
      const { default: writeXlsxFile } = await import("write-excel-file/browser");
      // 이 라이브러리 버전(4.1.1)의 writeXlsxFile은 fileName 옵션을 받지 않는다 —
      // 반환값의 .toFile()이 저장을 맡는다 (명단 내보내기 import-form.tsx와 같은 방식).
      // 셀 값을 그대로 넘긴다 — 문자열은 String, 숫자는 Number로 추론되어 상점·벌점·
      // 순점수가 엑셀에서 숫자 셀로 나간다(toStyledSheetData처럼 강제로 문자열화하지 않는다).
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
      {error && <p className="mt-2 text-[13px] text-rose">{error}</p>}
    </div>
  );
}

/** 반별 목록을 내려받는다. */
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
      label="엑셀로 내려받기"
    />
  );
}

/** 한 학생의 내역을 내려받는다 — 생활기록부 근거처럼 한 명분이 필요할 때. */
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
      label="내역 내려받기"
    />
  );
}
