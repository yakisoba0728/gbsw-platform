"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Note } from "@/components/ui/note";
import { toStyledSheetData } from "@/lib/xlsx-sheet";

export type SheetResult = {
  error: string | null;
  rows: (string | number)[][];
  filename: string;
};

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
      try {
        const result = await fetchSheet();
        if (result.error) {
          setError(result.error);
          return;
        }
        const { default: writeXlsxFile } = await import("write-excel-file/browser");
        const sheetData = toStyledSheetData(result.rows, {
          titleRowCount: 1,
          keepNumbers: true,
          wrapColumns,
        });
        await writeXlsxFile(sheetData, {
          columns: widths.map((width) => ({ width })),
          stickyRowsCount: 2,
        }).toFile(result.filename);
      } catch {
        setError("내보내지 못했습니다. 잠시 후 다시 시도해 주세요.");
      }
    });
  }

  return { pending, error, download };
}

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
      {error && (
        <Note tone="error" className="mt-2">
          {error}
        </Note>
      )}
    </div>
  );
}
