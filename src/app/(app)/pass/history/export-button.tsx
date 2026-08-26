"use client";

import {
  SheetDownloadButton,
  useSheetDownload,
} from "@/components/ui/sheet-download";
import {
  PASS_HISTORY_SHEET_WIDTHS,
  PASS_HISTORY_SHEET_WRAP,
} from "@/modules/pass/pass.export";
import type { PassHistoryExportInput } from "@/modules/pass/pass.schema";
import { exportPassHistoryAction } from "../actions";

/**
 * 지금 고른 조건 전체를 xlsx로 받는다. 페이지 번호는 일부러 넘기지 않는다 —
 * 보고 있는 20줄이 아니라 조건에 맞는 전부가 파일이 된다.
 *
 * 저장 절차는 `components/ui/sheet-download`가 갖고 있다 (상벌점 내보내기와 같다).
 */
export function ExportPassHistoryButton(props: PassHistoryExportInput) {
  const download = useSheetDownload(
    () => exportPassHistoryAction(props),
    PASS_HISTORY_SHEET_WIDTHS,
    PASS_HISTORY_SHEET_WRAP,
  );

  return <SheetDownloadButton {...download} />;
}
