import { readSheet } from "read-excel-file/node";
import {
  ENROLLMENT_STATUS_LABELS,
  type EnrollmentStatus,
} from "@/core/authz/enrollment-status";
import {
  CLASS_NO_RANGE_MESSAGE,
  GRADE_RANGE_MESSAGE,
  MAX_CLASS_NO,
  MAX_GRADE,
  MAX_NUMBER,
  MIN_CLASS_NO,
  MIN_GRADE,
  MIN_NUMBER,
  NUMBER_RANGE_MESSAGE,
} from "@/modules/enrollment/enrollment.schema";

/**
 * 명단 파일을 정규화된 행으로 옮긴다.
 *
 * CSV와 xlsx가 같은 곳으로 모이도록, 형식별 코드는 `string[][]`를 만드는 데까지만 하고
 * 머리글 해석과 값 검사는 normalizeRows 하나가 맡는다.
 * 순수 함수라 DB 없이 테스트한다 — 분류 규칙 다음으로 자주 바뀔 부분이다.
 */

export const ROSTER_COLUMNS = [
  "이름",
  "생년월일",
  "학년",
  "반",
  "번호",
  "학적",
] as const;

export type RosterRow = {
  /** 파일 기준 줄 번호. 머리글이 1행이므로 첫 학생은 2행이다. */
  line: number;
  name: string;
  birthDate: string;
  grade: number | null;
  classNo: number | null;
  number: number | null;
  status: EnrollmentStatus | null;
  errors: string[];
};

/** 한글 라벨 → 저장 상수. 파서만 이 방향을 안다. */
const STATUS_BY_LABEL = new Map(
  Object.entries(ENROLLMENT_STATUS_LABELS).map(([k, v]) => [v, k as EnrollmentStatus]),
);

/**
 * CSV를 표로 만든다.
 *
 * 라이브러리를 쓰지 않는다 — 필요한 건 따옴표·BOM·CRLF 처리뿐이고,
 * 그건 아래 40줄이면 된다. 의존성을 하나 줄이는 편이 낫다.
 *
 * 빈 줄도 표에 그대로 담는다 (버리지 않는다). xlsx 경로(`readSheet`)가 빈 행도
 * 그대로 돌려주는 것과 맞추기 위해서다 — 여기서 걸러버리면 그 뒤 줄들이 표에서
 * 한 칸씩 당겨져, normalizeRows가 매기는 `line`(표 안 인덱스 기반)이 실제 파일의
 * 줄 번호와 어긋난다. "전부 빈 칸인 줄은 버린다"는 처리는 normalizeRows 쪽에
 * 이미 있으므로(flatMap에서 빈 raw를 걸러냄) 여기서 중복으로 걸러낼 필요가 없다.
 */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const table: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  const endField = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    endField();
    table.push(row);
    row = [];
  };

  for (let i = 0; i < src.length; i++) {
    const c = src[i]!;

    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
      continue;
    }

    if (c === '"') quoted = true;
    else if (c === ",") endField();
    else if (c === "\n") endRow();
    else if (c !== "\r") field += c;
  }
  if (field !== "" || row.length > 0) endRow();

  return table;
}

/** 엑셀이 날짜를 어떻게 비틀어 놓든 YYYY-MM-DD로 되돌린다. */
function toDateString(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;

  const m = v.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})$/);
  if (m) {
    const [, y, mo, d] = m;
    return `${y}-${mo!.padStart(2, "0")}-${d!.padStart(2, "0")}`;
  }

  // 엑셀 날짜 일련번호 (1900-01-01 = 1, 1900 윤년 버그 보정 포함)
  if (/^\d{5}$/.test(v)) {
    const ms = (Number(v) - 25569) * 86_400_000;
    const d = new Date(ms);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }

  return null;
}

function toInt(raw: string): number | null {
  const v = raw.trim();
  if (!v) return null;
  const n = Number(v);
  return Number.isInteger(n) ? n : null;
}

export function normalizeRows(table: string[][]): RosterRow[] {
  if (table.length === 0) return [];

  const header = table[0]!.map((h) => h.trim());
  const at = (name: string) => header.indexOf(name);
  const missing = ROSTER_COLUMNS.filter((c) => at(c) === -1);

  const idx = Object.fromEntries(
    ROSTER_COLUMNS.map((c) => [c, at(c)]),
  ) as Record<(typeof ROSTER_COLUMNS)[number], number>;

  const cell = (r: string[], name: (typeof ROSTER_COLUMNS)[number]) =>
    idx[name] === -1 ? "" : (r[idx[name]] ?? "").trim();

  return table.slice(1).flatMap((raw, i) => {
    // 전부 빈 줄은 파일 끝의 잔여물이다. 오류로 세지 않는다.
    if (raw.every((c) => c.trim() === "")) return [];

    const errors: string[] = [];
    if (missing.length > 0) {
      errors.push(`머리글에 ${missing.join("·")} 열이 없습니다.`);
    }

    const name = cell(raw, "이름");
    if (!name) errors.push("이름이 비어 있습니다.");

    const birthDate = toDateString(cell(raw, "생년월일"));
    if (!birthDate) errors.push("생년월일을 읽을 수 없습니다.");

    const statusLabel = cell(raw, "학적");
    const status = STATUS_BY_LABEL.get(statusLabel) ?? null;
    if (!status) {
      errors.push(
        `학적이 올바르지 않습니다. (${[...STATUS_BY_LABEL.keys()].join("·")} 중 하나)`,
      );
    }

    const grade = toInt(cell(raw, "학년"));
    const classNo = toInt(cell(raw, "반"));
    const number = toInt(cell(raw, "번호"));

    // 반과 번호는 재학일 때만 의미가 있다. 졸업·자퇴 줄에 비어 있는 건 정상이다.
    if (status === "ENROLLED" && (grade === null || classNo === null || number === null)) {
      errors.push("재학이면 학년·반·번호가 모두 있어야 합니다.");
    }

    // 표 편집 경로(enrollment.schema.ts)와 같은 범위를 여기서도 강제한다.
    // 안 그러면 "학년 11" 같은 오타가 미리보기를 그냥 통과해 SchoolClass에
    // 그대로 저장된다 — 미리보기가 확정 전에 실수를 잡으라고 있는 것인데
    // 이 경로만 비어 있으면 그 존재 이유가 사라진다.
    if (status === "ENROLLED") {
      if (grade !== null && (grade < MIN_GRADE || grade > MAX_GRADE)) {
        errors.push(GRADE_RANGE_MESSAGE);
      }
      if (classNo !== null && (classNo < MIN_CLASS_NO || classNo > MAX_CLASS_NO)) {
        errors.push(CLASS_NO_RANGE_MESSAGE);
      }
      if (number !== null && (number < MIN_NUMBER || number > MAX_NUMBER)) {
        errors.push(NUMBER_RANGE_MESSAGE);
      }
    }

    return [{
      line: i + 2,
      name,
      birthDate: birthDate ?? "",
      grade: status === "ENROLLED" ? grade : null,
      classNo: status === "ENROLLED" ? classNo : null,
      number: status === "ENROLLED" ? number : null,
      status,
      errors,
    }];
  });
}

export async function parseRoster(input: {
  filename: string;
  buffer: Buffer;
}): Promise<RosterRow[]> {
  const isXlsx = /\.xlsx$/i.test(input.filename);

  if (!isXlsx) return normalizeRows(parseCsv(input.buffer.toString("utf8")));

  // 기본 export는 시트를 전부 돌려준다. 첫 시트만 필요하므로 readSheet를 쓴다.
  const rows = await readSheet(input.buffer);
  const table = rows.map((row) =>
    row.map((c) => {
      if (c === null || c === undefined) return "";
      // 엑셀이 날짜 서식이면 Date로 준다. KST 기준으로 잘라야 하루가 밀리지 않는다.
      if (c instanceof Date) {
        return new Intl.DateTimeFormat("en-CA", {
          timeZone: "Asia/Seoul",
        }).format(c);
      }
      return String(c);
    }),
  );
  return normalizeRows(table);
}
