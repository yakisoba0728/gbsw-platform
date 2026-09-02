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

export function ExportPassHistoryButton(props: PassHistoryExportInput) {
  const download = useSheetDownload(
    () => exportPassHistoryAction(props),
    PASS_HISTORY_SHEET_WIDTHS,
    PASS_HISTORY_SHEET_WRAP,
  );

  return <SheetDownloadButton {...download} />;
}
