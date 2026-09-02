import { readSheet } from "read-excel-file/node";
import { inflateRawSync } from "node:zlib";
import {
  ENROLLMENT_STATUS_LABELS,
  type EnrollmentStatus,
} from "@/core/authz/enrollment-status";
import { isCanonicalDateInput } from "@/lib/date-input";
import { isStudentCode } from "@/lib/student-code";
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
// 내보내기는 브라우저에서도 쓰므로 서버 전용 파서를 역으로 참조하면 안 된다.
import { ROSTER_COLUMNS } from "@/modules/enrollment/roster.export";
import { MAX_ROSTER_ROWS, ROSTER_FILE_MAX_BYTES } from "./roster.schema";

export type RosterRow = {
  line: number;
  studentCode: string;
  name: string;
  birthDate: string;
  grade: number | null;
  classNo: number | null;
  number: number | null;
  status: EnrollmentStatus | null;
  errors: string[];
};

export class RosterParseError extends Error {}

const XLSX_SIGNATURES = {
  endOfCentralDirectory: 0x06054b50,
  centralDirectoryFileHeader: 0x02014b50,
  localFileHeader: 0x04034b50,
} as const;

const ZIP64_SENTINEL = 0xffffffff;
const ZIP_DATA_DESCRIPTOR_SIGNATURE = 0x08074b50;

export const XLSX_PREFLIGHT_LIMITS = {
  maxCompressedBytes: ROSTER_FILE_MAX_BYTES,
  maxUncompressedBytes: 25 * 1024 * 1024,
  maxEntryUncompressedBytes: 10 * 1024 * 1024,
  maxEntries: 500,
  maxSheetRows: MAX_ROSTER_ROWS + 1,
} as const;

type ZipEntry = {
  filename: string;
  filenameBytes: Buffer;
  flags: number;
  compressionMethod: number;
  crc32: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
};

const ZIP_FLAG_DATA_DESCRIPTOR = 0x0008;
const ZIP_FLAG_UTF8_FILENAME = 0x0800;
const SUPPORTED_ZIP_FLAGS = ZIP_FLAG_DATA_DESCRIPTOR | ZIP_FLAG_UTF8_FILENAME;

function findEndOfCentralDirectory(buffer: Buffer): number {
  if (buffer.length < 22) throw new RosterParseError("XLSX_ZIP_INVALID");

  const minOffset = Math.max(0, buffer.length - (65_535 + 22));
  for (let offset = buffer.length - 22; offset >= minOffset; offset--) {
    if (buffer.readUInt32LE(offset) === XLSX_SIGNATURES.endOfCentralDirectory) {
      return offset;
    }
  }
  throw new RosterParseError("XLSX_ZIP_INVALID");
}

function readCentralDirectory(buffer: Buffer): ZipEntry[] {
  if (buffer.length > XLSX_PREFLIGHT_LIMITS.maxCompressedBytes) {
    throw new RosterParseError("XLSX_TOO_LARGE");
  }

  const eocd = findEndOfCentralDirectory(buffer);
  const diskNumber = buffer.readUInt16LE(eocd + 4);
  const centralDirectoryDisk = buffer.readUInt16LE(eocd + 6);
  if (diskNumber !== 0 || centralDirectoryDisk !== 0) {
    throw new RosterParseError("XLSX_ZIP_INVALID");
  }

  const diskEntryCount = buffer.readUInt16LE(eocd + 8);
  const entryCount = buffer.readUInt16LE(eocd + 10);
  const centralDirectorySize = buffer.readUInt32LE(eocd + 12);
  const centralDirectoryOffset = buffer.readUInt32LE(eocd + 16);
  const commentLength = buffer.readUInt16LE(eocd + 20);
  if (
    entryCount === 0xffff ||
    centralDirectorySize === ZIP64_SENTINEL ||
    centralDirectoryOffset === ZIP64_SENTINEL ||
    diskEntryCount !== entryCount ||
    entryCount > XLSX_PREFLIGHT_LIMITS.maxEntries ||
    centralDirectoryOffset + centralDirectorySize !== eocd ||
    eocd + 22 + commentLength !== buffer.length
  ) {
    throw new RosterParseError("XLSX_ZIP_INVALID");
  }

  const entries: ZipEntry[] = [];
  const seenNames = new Set<string>();
  const seenOffsets = new Set<number>();
  let totalCompressed = 0;
  let totalUncompressed = 0;
  let offset = centralDirectoryOffset;

  for (let i = 0; i < entryCount; i++) {
    if (
      offset + 46 > buffer.length ||
      buffer.readUInt32LE(offset) !== XLSX_SIGNATURES.centralDirectoryFileHeader
    ) {
      throw new RosterParseError("XLSX_ZIP_INVALID");
    }

    const flags = buffer.readUInt16LE(offset + 8);
    const compressionMethod = buffer.readUInt16LE(offset + 10);
    const crc32 = buffer.readUInt32LE(offset + 16);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const filenameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const filenameStart = offset + 46;
    const filenameEnd = filenameStart + filenameLength;
    const nextOffset = filenameEnd + extraLength + commentLength;

    if (
      nextOffset > buffer.length ||
      filenameLength === 0 ||
      (flags & ~SUPPORTED_ZIP_FLAGS) !== 0 ||
      !isSupportedZipCompression(compressionMethod) ||
      compressedSize === ZIP64_SENTINEL ||
      uncompressedSize === ZIP64_SENTINEL ||
      localHeaderOffset === ZIP64_SENTINEL
    ) {
      throw new RosterParseError("XLSX_ZIP_INVALID");
    }

    totalCompressed += compressedSize;
    totalUncompressed += uncompressedSize;
    if (
      totalCompressed > XLSX_PREFLIGHT_LIMITS.maxCompressedBytes ||
      totalUncompressed > XLSX_PREFLIGHT_LIMITS.maxUncompressedBytes ||
      uncompressedSize > XLSX_PREFLIGHT_LIMITS.maxEntryUncompressedBytes
    ) {
      throw new RosterParseError("XLSX_ZIP_BOMB");
    }

    const filenameBytes = Buffer.from(buffer.subarray(filenameStart, filenameEnd));
    const filename = filenameBytes.toString("utf8");
    if (
      filename.includes("\0") ||
      filename.includes("\\") ||
      filename.startsWith("/") ||
      filename.split("/").includes("..") ||
      seenNames.has(filename) ||
      seenOffsets.has(localHeaderOffset)
    ) {
      throw new RosterParseError("XLSX_ZIP_INVALID");
    }
    seenNames.add(filename);
    seenOffsets.add(localHeaderOffset);

    entries.push({
      filename,
      filenameBytes,
      flags,
      compressionMethod,
      crc32,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
    });
    offset = nextOffset;
  }

  if (offset !== eocd) throw new RosterParseError("XLSX_ZIP_INVALID");
  verifyLocalEntrySequence(buffer, entries, centralDirectoryOffset);

  return entries;
}

function isSupportedZipCompression(method: number): boolean {
  return method === 0 || method === 8;
}

function verifyLocalEntrySequence(
  buffer: Buffer,
  entries: ZipEntry[],
  centralDirectoryOffset: number,
): void {
  let expectedOffset = 0;
  const entriesByOffset = [...entries].sort((a, b) => a.localHeaderOffset - b.localHeaderOffset);

  for (const entry of entriesByOffset) {
    if (entry.localHeaderOffset !== expectedOffset) {
      throw new RosterParseError("XLSX_ZIP_INVALID");
    }
    expectedOffset = readAndVerifyLocalEntry(buffer, entry);
  }

  if (expectedOffset !== centralDirectoryOffset) {
    throw new RosterParseError("XLSX_ZIP_INVALID");
  }
}

function readAndVerifyLocalEntry(buffer: Buffer, entry: ZipEntry): number {
  const offset = entry.localHeaderOffset;
  if (
    offset + 30 > buffer.length ||
    buffer.readUInt32LE(offset) !== XLSX_SIGNATURES.localFileHeader
  ) {
    throw new RosterParseError("XLSX_ZIP_INVALID");
  }

  const flags = buffer.readUInt16LE(offset + 6);
  const compressionMethod = buffer.readUInt16LE(offset + 8);
  const crc32 = buffer.readUInt32LE(offset + 14);
  const compressedSize = buffer.readUInt32LE(offset + 18);
  const uncompressedSize = buffer.readUInt32LE(offset + 22);
  const filenameLength = buffer.readUInt16LE(offset + 26);
  const extraLength = buffer.readUInt16LE(offset + 28);
  const filenameStart = offset + 30;
  const filenameEnd = filenameStart + filenameLength;
  const dataStart = filenameEnd + extraLength;
  const dataEnd = dataStart + entry.compressedSize;

  if (
    filenameEnd > buffer.length ||
    dataEnd > buffer.length ||
    filenameLength !== entry.filenameBytes.length ||
    !buffer.subarray(filenameStart, filenameEnd).equals(entry.filenameBytes) ||
    flags !== entry.flags ||
    compressionMethod !== entry.compressionMethod
  ) {
    throw new RosterParseError("XLSX_ZIP_INVALID");
  }

  if ((flags & ZIP_FLAG_DATA_DESCRIPTOR) !== 0) {
    const descriptorEnd = dataEnd + 16;
    if (
      descriptorEnd > buffer.length ||
      crc32 !== 0 ||
      compressedSize !== 0 ||
      uncompressedSize !== 0 ||
      buffer.readUInt32LE(dataEnd) !== ZIP_DATA_DESCRIPTOR_SIGNATURE ||
      buffer.readUInt32LE(dataEnd + 4) !== entry.crc32 ||
      buffer.readUInt32LE(dataEnd + 8) !== entry.compressedSize ||
      buffer.readUInt32LE(dataEnd + 12) !== entry.uncompressedSize
    ) {
      throw new RosterParseError("XLSX_ZIP_INVALID");
    }
    return descriptorEnd;
  }

  if (
    crc32 !== entry.crc32 ||
    compressedSize !== entry.compressedSize ||
    uncompressedSize !== entry.uncompressedSize
  ) {
    throw new RosterParseError("XLSX_ZIP_INVALID");
  }

  return dataEnd;
}

function inflateEntry(buffer: Buffer, entry: ZipEntry, maxOutputLength: number): Buffer {
  const offset = entry.localHeaderOffset;
  if (
    offset + 30 > buffer.length ||
    buffer.readUInt32LE(offset) !== XLSX_SIGNATURES.localFileHeader
  ) {
    throw new RosterParseError("XLSX_ZIP_INVALID");
  }

  const filenameLength = buffer.readUInt16LE(offset + 26);
  const extraLength = buffer.readUInt16LE(offset + 28);
  const dataStart = offset + 30 + filenameLength + extraLength;
  const dataEnd = dataStart + entry.compressedSize;
  if (dataEnd > buffer.length) throw new RosterParseError("XLSX_ZIP_INVALID");

  const compressed = buffer.subarray(dataStart, dataEnd);
  if (entry.compressionMethod === 0) {
    if (compressed.length > maxOutputLength) throw new RosterParseError("XLSX_ZIP_BOMB");
    return compressed;
  }
  if (entry.compressionMethod === 8) {
    try {
      return inflateRawSync(compressed, { maxOutputLength });
    } catch (error) {
      if (error instanceof RangeError) throw new RosterParseError("XLSX_ZIP_BOMB");
      throw new RosterParseError("XLSX_ZIP_INVALID");
    }
  }
  throw new RosterParseError("XLSX_ZIP_INVALID");
}

function countWorksheetRows(xml: string): number {
  let count = 0;
  const rowTag = /<row\b/g;
  while (rowTag.exec(xml)) {
    count++;
    if (count > XLSX_PREFLIGHT_LIMITS.maxSheetRows) return count;
  }
  return count;
}

/** ZIP 메타데이터뿐 아니라 실제 XML 압축 해제 크기와 행 수를 파싱 전에 제한한다. */
export function preflightXlsx(buffer: Buffer): void {
  const entries = readCentralDirectory(buffer);
  const worksheets = entries.filter((entry) =>
    /^xl\/worksheets\/sheet\d+\.xml$/u.test(entry.filename),
  );
  if (worksheets.length === 0) throw new RosterParseError("XLSX_ZIP_INVALID");

  const worksheetNames = new Set(worksheets.map((entry) => entry.filename));
  let actualUncompressedBytes = 0;

  for (const entry of entries) {
    if (!/\.xml(?:\.rels)?$/u.test(entry.filename) && !/\.rels$/u.test(entry.filename)) {
      continue;
    }

    const remainingAggregate =
      XLSX_PREFLIGHT_LIMITS.maxUncompressedBytes - actualUncompressedBytes;
    if (remainingAggregate <= 0) throw new RosterParseError("XLSX_ZIP_BOMB");

    const inflated = inflateEntry(
      buffer,
      entry,
      Math.min(XLSX_PREFLIGHT_LIMITS.maxEntryUncompressedBytes, remainingAggregate + 1),
    );
    if (
      inflated.length > XLSX_PREFLIGHT_LIMITS.maxEntryUncompressedBytes ||
      actualUncompressedBytes + inflated.length > XLSX_PREFLIGHT_LIMITS.maxUncompressedBytes
    ) {
      throw new RosterParseError("XLSX_ZIP_BOMB");
    }
    actualUncompressedBytes += inflated.length;

    if (worksheetNames.has(entry.filename)) {
      const rowCount = countWorksheetRows(inflated.toString("utf8"));
      if (rowCount > XLSX_PREFLIGHT_LIMITS.maxSheetRows) {
        throw new RosterParseError("TOO_MANY_ROWS");
      }
    }
  }
}

const STATUS_BY_LABEL = new Map(
  Object.entries(ENROLLMENT_STATUS_LABELS).map(([k, v]) => [v, k as EnrollmentStatus]),
);

// 빈 줄을 남겨야 후속 검증의 줄 번호가 원본 파일과 일치한다.
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

function toDateString(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;

  const m = v.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})$/);
  if (m) {
    const [, y, mo, d] = m;
    const date = `${y}-${mo!.padStart(2, "0")}-${d!.padStart(2, "0")}`;
    return isCanonicalDateInput(date) ? date : null;
  }

  if (/^\d{5}$/.test(v)) {
    // Excel의 1900 윤년 오류를 포함한 날짜 일련번호를 Unix 시각으로 바꾼다.
    const ms = (Number(v) - 25569) * 86_400_000;
    const d = new Date(ms);
    if (!Number.isNaN(d.getTime())) {
      const date = d.toISOString().slice(0, 10);
      return isCanonicalDateInput(date) ? date : null;
    }
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
  if (table.length > XLSX_PREFLIGHT_LIMITS.maxSheetRows) {
    throw new RosterParseError("TOO_MANY_ROWS");
  }

  const header = table[0]!.map((h) => h.trim().normalize("NFC"));
  const at = (name: string) => header.indexOf(name);
  const missing = ROSTER_COLUMNS.filter((c) => c !== "학생코드" && at(c) === -1);

  const idx = Object.fromEntries(
    ROSTER_COLUMNS.map((c) => [c, at(c)]),
  ) as Record<(typeof ROSTER_COLUMNS)[number], number>;

  const cell = (r: string[], name: (typeof ROSTER_COLUMNS)[number]) =>
    idx[name] === -1 ? "" : (r[idx[name]] ?? "").trim().normalize("NFC");

  return table.slice(1).flatMap((raw, i) => {
    if (raw.every((c) => c.trim() === "")) return [];

    const errors: string[] = [];
    if (missing.length > 0) {
      errors.push(`머리글에 ${missing.join("·")} 열이 없습니다.`);
    }

    const studentCode = cell(raw, "학생코드");
    if (studentCode && !isStudentCode(studentCode)) {
      errors.push("학생코드 형식이 올바르지 않습니다. 새 학생이면 비워 두세요.");
    }

    const name = cell(raw, "이름");
    if (!name) errors.push("이름이 비어 있습니다.");

    const birthDate = toDateString(cell(raw, "생년월일"));
    if (!birthDate) errors.push("생년월일을 읽을 수 없습니다.");

    const statusLabel = cell(raw, "학적");
    const gradeRaw = cell(raw, "학년");
    const classNoRaw = cell(raw, "반");
    const numberRaw = cell(raw, "번호");

    // 졸업생 내보내기의 빈 배정은 정상이다. 일부만 비어 있으면 아래에서 검증한다.
    const noAssignment = !statusLabel && !gradeRaw && !classNoRaw && !numberRaw;

    let status: EnrollmentStatus | null = null;
    let grade: number | null = null;
    let classNo: number | null = null;
    let number: number | null = null;

    if (!noAssignment) {
      status = STATUS_BY_LABEL.get(statusLabel) ?? null;
      if (!status) {
        errors.push(
          `학적이 올바르지 않습니다. (${[...STATUS_BY_LABEL.keys()].join("·")} 중 하나)`,
        );
      }

      grade = toInt(gradeRaw);
      classNo = toInt(classNoRaw);
      number = toInt(numberRaw);

      if (status === "ENROLLED" && (grade === null || classNo === null || number === null)) {
        errors.push("재학이면 학년·반·번호가 모두 있어야 합니다.");
      }

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
    }

    return [{
      line: i + 2,
      studentCode,
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

export function fileNotices(table: string[][]): string[] {
  if (table.length === 0) return [];

  const header = table[0]!.map((h) => h.trim().normalize("NFC"));
  const notices: string[] = [];

  if (!header.includes("학생코드")) {
    notices.push(
      "학생코드 열이 없어 전 줄을 신규로 처리합니다. " +
        "기존 학생을 이으려면 전체 명단을 내보내 고쳐 올리세요.",
    );
  }

  return notices;
}

export async function parseRoster(input: {
  filename: string;
  buffer: Buffer;
}): Promise<{ rows: RosterRow[]; notices: string[] }> {
  const isXlsx = /\.xlsx$/i.test(input.filename);

  if (!isXlsx) {
    const table = parseCsv(input.buffer.toString("utf8"));
    return { rows: normalizeRows(table), notices: fileNotices(table) };
  }

  preflightXlsx(input.buffer);
  const rows = await readSheet(input.buffer);
  const table = rows.map((row) =>
    row.map((c) => {
      if (c === null || c === undefined) return "";
      if (c instanceof Date) {
        return new Intl.DateTimeFormat("en-CA", {
          timeZone: "Asia/Seoul",
        }).format(c);
      }
      return String(c);
    }),
  );
  return { rows: normalizeRows(table), notices: fileNotices(table) };
}
