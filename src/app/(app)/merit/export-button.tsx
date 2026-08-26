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

/*
 * 상벌점의 세 내보내기. 저장 절차는 `components/ui/sheet-download`가 갖고 있고,
 * 여기는 어느 액션을 부르고 어떤 열 너비를 쓰는지만 정한다.
 */

/** 반별 목록을 내보낸다. */
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

/** 한 학생의 내역을 내보낸다. */
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

/** 최근 부여의 현재 필터 전체를 내려받는다. 페이지 번호는 일부러 받지 않는다. */
export function ExportRecentAwardsButton(props: RecentAwardsExportInput) {
  const download = useSheetDownload(
    () => exportRecentAwardsAction(props),
    RECENT_SHEET_WIDTHS,
    RECENT_SHEET_WRAP,
  );

  return <SheetDownloadButton {...download} />;
}
