"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Note } from "@/components/ui/note";
import type { MeritTrack } from "@/core/authz/merit-track";
import { toStyledSheetData } from "@/lib/xlsx-sheet";
import {
  HISTORY_SHEET_WIDTHS,
  HISTORY_SHEET_WRAP,
  RECENT_SHEET_WIDTHS,
  RECENT_SHEET_WRAP,
  ROSTER_SHEET_WIDTHS,
} from "@/modules/merit/merit.export";
import type { RecentAwardsExportInput } from "@/modules/merit/merit.schema";
import {
  exportClassRosterAction,
  exportRecentAwardsAction,
  exportStudentHistoryAction,
} from "./actions";

type SheetResult = {
  error: string | null;
  rows: (string | number)[][];
  filename: string;
};

/**
 * 서버가 돌려준 행렬을 xlsx로 저장한다. 세 내보내기가 공유한다.
 *
 * 서버 액션은 값만 넘길 수 있어 셀 서식(`type: String` 같은 생성자)을 실어 보내지
 * 못한다 — 그래서 행렬만 받아 여기서 서식을 입힌다. 명단 내보내기
 * (`admin/students/import`)도 같은 방식이다.
 *
 * `widths`를 빠뜨리면 엑셀 기본 너비로 열려 한글이 옆 칸을 덮어쓴다. 첫 줄은
 * 조회 범위라 머리글은 둘째 줄이고(titleRowCount), 점수는 더할 수 있어야 하므로
 * 수 셀로 남긴다(keepNumbers).
 */
function useSheetDownload(
  fetchSheet: () => Promise<SheetResult>,
  widths: number[],
  wrapColumns: number[] = [],
) {
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
      const sheetData = toStyledSheetData(result.rows, {
        titleRowCount: 1,
        keepNumbers: true,
        wrapColumns,
      });
      await writeXlsxFile(sheetData, {
        columns: widths.map((width) => ({ width })),
        // 제목 줄 + 머리글 줄. 스크롤해도 어느 열인지 보인다.
        stickyRowsCount: 2,
      }).toFile(result.filename);
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
  const { pending, error, download } = useSheetDownload(
    () => exportClassRosterAction(props),
    ROSTER_SHEET_WIDTHS,
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
  const { pending, error, download } = useSheetDownload(
    () => exportStudentHistoryAction(props),
    HISTORY_SHEET_WIDTHS,
    HISTORY_SHEET_WRAP,
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

/** 최근 부여의 현재 필터 전체를 내려받는다. 페이지 번호는 일부러 받지 않는다. */
export function ExportRecentAwardsButton(props: RecentAwardsExportInput) {
  const { pending, error, download } = useSheetDownload(
    () => exportRecentAwardsAction(props),
    RECENT_SHEET_WIDTHS,
    RECENT_SHEET_WRAP,
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
