"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Note } from "@/components/ui/note";
import { toStyledSheetData } from "@/lib/xlsx-sheet";

/** 서버 액션이 돌려주는 것. 서식이 아니라 값만 온다. */
export type SheetResult = {
  error: string | null;
  rows: (string | number)[][];
  filename: string;
};

/**
 * 서버가 돌려준 행렬을 xlsx로 저장한다. **내보내기 버튼이 전부 이걸 쓴다.**
 *
 * 서버 액션은 값만 넘길 수 있어 셀 서식(`type: String` 같은 생성자)을 실어 보내지
 * 못한다 — 그래서 행렬만 받아 여기서 서식을 입힌다.
 *
 * `widths`를 빠뜨리면 엑셀 기본 너비로 열려 한글이 옆 칸을 덮어쓴다. 첫 줄은
 * 조회 범위라 머리글은 둘째 줄이고(titleRowCount), 숫자는 더할 수 있어야 하므로
 * 수 셀로 남긴다(keepNumbers).
 */
export function useSheetDownload(
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

/**
 * 내보내기 버튼 한 벌. `useSheetDownload`가 돌려준 것을 그대로 펼쳐 넣는다.
 *
 * ```tsx
 * const download = useSheetDownload(() => exportAction(props), WIDTHS, WRAP);
 * return <SheetDownloadButton {...download} label="내보내기" />;
 * ```
 */
export function SheetDownloadButton({
  pending,
  error,
  download,
  label = "내보내기",
  size,
}: {
  pending: boolean;
  error: string | null;
  download: () => void;
  label?: string;
  size?: "sm" | "md";
}) {
  return (
    <div>
      <Button
        type="button"
        variant="secondary"
        size={size}
        onClick={download}
        disabled={pending}
      >
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
