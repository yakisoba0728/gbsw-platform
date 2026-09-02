"use client";

import {
  SheetDownloadButton,
  useSheetDownload,
} from "@/components/ui/sheet-download";
import type { MeritTrack } from "@/core/authz/merit-track";
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

export function ExportButton(props: {
  grade: number;
  classNo: number;
  track: MeritTrack;
  year?: number;
}) {
  const download = useSheetDownload(
    () => exportClassRosterAction(props),
    ROSTER_SHEET_WIDTHS,
  );

  return <SheetDownloadButton {...download} />;
}

export function ExportHistoryButton(props: {
  studentProfileId: string;
  track: MeritTrack;
  year?: number;
}) {
  const download = useSheetDownload(
    () => exportStudentHistoryAction(props),
    HISTORY_SHEET_WIDTHS,
    HISTORY_SHEET_WRAP,
  );

  return <SheetDownloadButton {...download} label="내역 내보내기" />;
}

export function ExportRecentAwardsButton(props: RecentAwardsExportInput) {
  const download = useSheetDownload(
    () => exportRecentAwardsAction(props),
    RECENT_SHEET_WIDTHS,
    RECENT_SHEET_WRAP,
  );

  return <SheetDownloadButton {...download} />;
}
