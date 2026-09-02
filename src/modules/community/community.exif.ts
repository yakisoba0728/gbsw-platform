type StripResult =
  | { ok: true; bytes: Buffer }
  | { ok: false; code: "ATTACHMENT_METADATA" };

type Range = { start: number; end: number };

const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff]);
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const EOI_MARKER = Buffer.from([0xff, 0xd9]);

export function stripImageMetadata(source: Buffer): StripResult {
  // 확장자 대신 매직 바이트를 읽고 화소를 재인코딩하지 않는다.
  if (source.subarray(0, 3).equals(JPEG_MAGIC)) return stripJpeg(source);
  if (source.subarray(0, 8).equals(PNG_MAGIC)) return stripPng(source);
  if (isWebp(source)) return stripWebp(source);
  if (isGif(source)) return { ok: true, bytes: source };
  return malformed();
}

function isGif(source: Buffer): boolean {
  const head = source.toString("latin1", 0, 6);
  return head === "GIF87a" || head === "GIF89a";
}

function isWebp(source: Buffer): boolean {
  return (
    source.length >= 12 &&
    source.toString("latin1", 0, 4) === "RIFF" &&
    source.toString("latin1", 8, 12) === "WEBP"
  );
}

function malformed(): StripResult {
  return { ok: false, code: "ATTACHMENT_METADATA" };
}

function finish(source: Buffer, keep: Range[], dropped: boolean): StripResult {
  if (!dropped) return { ok: true, bytes: source };
  return { ok: true, bytes: join(source, keep) };
}

function join(source: Buffer, keep: Range[]): Buffer {
  return Buffer.concat(keep.map((range) => source.subarray(range.start, range.end)));
}

function stripJpeg(source: Buffer): StripResult {
  const keep: Range[] = [{ start: 0, end: 2 }];
  let dropped = false;
  let pos = 2;

  while (pos < source.length) {
    if (source[pos] !== 0xff) return malformed();
    let at = pos;
    while (at < source.length && source[at] === 0xff) at += 1;
    if (at >= source.length) return malformed();
    const marker = source[at];
    at += 1;

    if (marker === 0xd9) {
      keep.push({ start: pos, end: at });
      if (at < source.length) dropped = true;
      return finish(source, keep, dropped);
    }

    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      keep.push({ start: pos, end: at });
      pos = at;
      continue;
    }

    if (at + 2 > source.length) return malformed();
    const length = source.readUInt16BE(at);
    if (length < 2) return malformed();
    const segmentEnd = at + length;
    if (segmentEnd > source.length) return malformed();

    // SOS 뒤 화소는 보존하되 EOI 뒤에 붙은 동영상·메타데이터는 버린다.
    if (marker === 0xda) {
      const eoi = source.indexOf(EOI_MARKER, segmentEnd);
      if (eoi === -1) {
        keep.push({ start: pos, end: source.length });
        return finish(source, keep, dropped);
      }
      keep.push({ start: pos, end: eoi + 2 });
      if (eoi + 2 < source.length) dropped = true;
      return finish(source, keep, dropped);
    }

    if (dropsJpegSegment(source, marker, at + 2, segmentEnd)) dropped = true;
    else keep.push({ start: pos, end: segmentEnd });
    pos = segmentEnd;
  }

  return malformed();
}

function dropsJpegSegment(
  source: Buffer,
  marker: number,
  from: number,
  to: number,
): boolean {
  if (marker === 0xfe) return true;
  if (marker < 0xe0 || marker > 0xef) return false;

  // JFIF와 ICC 색 프로필은 남기고 미리보기·촬영 정보는 제거한다.
  if (marker === 0xe0) return startsWith(source, from, to, "JFXX\0");

  if (marker === 0xe2) return !startsWith(source, from, to, "ICC_PROFILE\0");
  return true;
}

function startsWith(source: Buffer, from: number, to: number, prefix: string): boolean {
  if (to - from < prefix.length) return false;
  return source.toString("latin1", from, from + prefix.length) === prefix;
}

const PNG_DROP = new Set(["eXIf", "tEXt", "zTXt", "iTXt", "tIME"]);

function stripPng(source: Buffer): StripResult {
  const keep: Range[] = [{ start: 0, end: 8 }];
  let dropped = false;
  let pos = 8;

  while (pos + 8 <= source.length) {
    const length = source.readUInt32BE(pos);
    const type = source.toString("latin1", pos + 4, pos + 8);
    const end = pos + 12 + length;
    if (end > source.length) return malformed();

    if (PNG_DROP.has(type)) dropped = true;
    else keep.push({ start: pos, end });
    pos = end;

    if (type === "IEND") {
      if (pos < source.length) dropped = true;
      return finish(source, keep, dropped);
    }
  }

  return malformed();
}

const VP8X_EXIF = 0x08;
const VP8X_XMP = 0x04;

function stripWebp(source: Buffer): StripResult {
  const declared = source.readUInt32LE(4);
  const end = 8 + declared;
  if (end > source.length) return malformed();

  const keep: Range[] = [{ start: 0, end: 12 }];
  let dropped = end < source.length;
  let flagsAt = -1;
  let written = 12;
  let pos = 12;

  while (pos + 8 <= end) {
    const fourcc = source.toString("latin1", pos, pos + 4);
    const size = source.readUInt32LE(pos + 4);
    const next = pos + 8 + size + (size % 2);
    if (next > end) return malformed();

    if (fourcc === "EXIF" || fourcc === "XMP ") {
      dropped = true;
    } else {
      if (fourcc === "VP8X") {
        if (size < 10) return malformed();
        if ((source[pos + 8] & (VP8X_EXIF | VP8X_XMP)) !== 0) {
          dropped = true;
          flagsAt = written + 8;
        }
      }
      keep.push({ start: pos, end: next });
      written += next - pos;
    }
    pos = next;
  }
  if (pos !== end) return malformed();

  if (!dropped) return { ok: true, bytes: source };

  // 청크 삭제 후 헤더 플래그와 RIFF 길이도 맞춘다.
  const bytes = join(source, keep);
  if (flagsAt !== -1) bytes[flagsAt] &= ~(VP8X_EXIF | VP8X_XMP);
  bytes.writeUInt32LE(bytes.length - 8, 4);
  return { ok: true, bytes };
}
