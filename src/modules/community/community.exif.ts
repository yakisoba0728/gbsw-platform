/**
 * 사진에 붙어 오는 메타데이터를 바이트 수준에서 벗긴다. **DB도 디스크도 모른다** —
 * 들어오는 것이 바이트, 나가는 것도 바이트다 (`community.access.ts`가 판정만 알고
 * `community.storage.ts`가 경로만 아는 것과 같은 자리).
 *
 * 왜 필요한가: 폰으로 찍은 사진은 촬영 위치(GPS)·기기·시각을 EXIF에 달고 다닌다.
 * 익명 게시판에 그대로 올라가면 글쓴이가 어디 사는 누구인지가 첨부에서 새고, 그
 * 순간 `community.view.ts`가 이름을 가리는 일이 무의미해진다. **부르는 자리는
 * 익명 게시판의 업로드 하나뿐이다** — 실명 게시판은 원본 바이트를 그대로 저장한다.
 *
 * **재인코딩하지 않는다.** 픽셀은 한 비트도 건드리지 않고 메타데이터를 담는 구간만
 * 도려낸다 — 화질 손실이 없고, 20MB짜리 이미지를 디코딩하느라 앱 컨테이너
 * (mem_limit 512m)의 메모리를 쓰지도 않는다. 비용은 버릴 것이 있을 때 버퍼 한 벌
 * 복사뿐이고, 버릴 것이 없으면 원본 참조를 그대로 돌려준다.
 *
 * **벗기지 않는 것을 분명히 적어 둔다.**
 * - **GIF**: 규격에 EXIF 자리가 없다. 카메라가 GIF를 만들지 않으므로 이 함수가
 *   막으려는 유출 경로가 아니다. 응용 확장 블록에 XMP를 넣는 데스크톱 도구가 있긴
 *   하나, 그것을 걷어내려면 LZW 데이터 블록까지 걸어야 하고 그 걸음의 주된 실패
 *   양상은 움직이는 GIF를 깨뜨리는 것이다(반복 횟수를 담은 NETSCAPE2.0 확장을
 *   함께 날린다). 얻는 것보다 잃는 것이 커서 원본 그대로 둔다.
 * - **문서(pdf·hwp·docx…)**: 만든 사람 이름이 문서 속성에 남는다. EXIF보다 큰
 *   유출이지만 zip·PDF 컨테이너를 다시 쓰는 일이라 여기서 다루지 않는다.
 * - **확장자를 속여 올리는 것**(사진을 `.txt`로): 형식 판정이 확장자로 이뤄져
 *   (`classifyUpload`) 이 함수까지 오지 않는다. 스스로 자기 익명을 벗는 일이고
 *   글 본문에 이름을 적는 것과 같은 갈래라 쫓지 않는다.
 */

export type StripResult =
  | { ok: true; bytes: Buffer }
  | { ok: false; code: "ATTACHMENT_METADATA" };

/** 남길 구간. 원본을 가리키는 [시작, 끝)이고 복사는 마지막에 한 번만 한다. */
type Range = { start: number; end: number };

const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff]);
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const EOI_MARKER = Buffer.from([0xff, 0xd9]);

/**
 * 벗긴 바이트를 준다. **형식을 못 알아보면 거부한다** — 원본을 그대로 저장하면
 * 벗겼는지 아닌지 아무도 모르는 채로 익명 게시판에 사진이 올라간다. 이 함수가
 * 있는 이유가 바로 그 결과를 막는 것이라, 조용히 통과시키는 길을 두지 않는다.
 */
export function stripImageMetadata(source: Buffer): StripResult {
  // **형식은 바이트가 정한다.** 확장자는 올리는 쪽이 적는 값이라, 그것으로 갈래를
  // 고르면 `.png`라고 이름 붙인 JPEG의 EXIF가 그대로 지나간다.
  if (source.subarray(0, 3).equals(JPEG_MAGIC)) return stripJpeg(source);
  if (source.subarray(0, 8).equals(PNG_MAGIC)) return stripPng(source);
  if (isWebp(source)) return stripWebp(source);
  if (isGif(source)) return { ok: true, bytes: source }; // 맨 위 「벗기지 않는 것」 참고
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

/** 버릴 것이 없으면 **원본을 그대로 돌려준다** — 복사가 한 벌도 안 일어난다. */
function finish(source: Buffer, keep: Range[], dropped: boolean): StripResult {
  if (!dropped) return { ok: true, bytes: source };
  return { ok: true, bytes: join(source, keep) };
}

/** `subarray`는 원본을 가리키는 창이라 여기서 일어나는 복사가 전부 한 벌이다. */
function join(source: Buffer, keep: Range[]): Buffer {
  return Buffer.concat(keep.map((range) => source.subarray(range.start, range.end)));
}

/**
 * JPEG. `FFD8` 뒤로 `FF<마커>` 세그먼트가 줄지어 있고 EXIF는 그중 APP1이다.
 * 세그먼트를 통째로 들어내면 나머지 바이트는 그대로다 — 디코더는 모르는
 * 세그먼트를 건너뛰게 만들어져 있어, 없어도 그림이 똑같이 나온다.
 */
function stripJpeg(source: Buffer): StripResult {
  const keep: Range[] = [{ start: 0, end: 2 }];
  let dropped = false;
  let pos = 2;

  while (pos < source.length) {
    if (source[pos] !== 0xff) return malformed();
    // 마커 앞에 FF가 여러 개 올 수 있다(채움 바이트).
    let at = pos;
    while (at < source.length && source[at] === 0xff) at += 1;
    if (at >= source.length) return malformed();
    const marker = source[at];
    at += 1;

    // EOI. **뒤에 붙은 바이트는 버린다** — 요즘 폰이 사진 뒤에 동영상을 통째로
    // 이어 붙인다(모션 포토). EXIF보다 큰 유출이고, 디코더는 EOI에서 읽기를
    // 멈추므로 버려도 그림에 영향이 없다.
    if (marker === 0xd9) {
      keep.push({ start: pos, end: at });
      if (at < source.length) dropped = true;
      return finish(source, keep, dropped);
    }

    // 길이가 없는 마커. 스캔 앞에는 거의 안 나오지만 나와도 그냥 넘긴다.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      keep.push({ start: pos, end: at });
      pos = at;
      continue;
    }

    if (at + 2 > source.length) return malformed();
    const length = source.readUInt16BE(at);
    // 길이 칸(2바이트)이 길이에 포함되므로 2보다 작을 수 없다.
    if (length < 2) return malformed();
    const segmentEnd = at + length;
    if (segmentEnd > source.length) return malformed();

    // SOS = 압축된 화소가 시작되는 자리. 여기부터 EOI까지는 세그먼트 구조가
    // 아니라 **그대로 옮긴다.** 화소 안에서 FF는 반드시 `FF00`으로 채워지고
    // 재시작 마커는 `FFD0`~`FFD7`이라, `FFD9`가 화소 데이터에 나타날 수 없다.
    if (marker === 0xda) {
      const eoi = source.indexOf(EOI_MARKER, segmentEnd);
      if (eoi === -1) {
        // EOI가 없는 파일. 거부하지 않고 끝까지 옮긴다 — 그림은 대개 멀쩡하고,
        // 막아야 할 메타데이터는 스캔 앞에서 이미 다 걸렀다.
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

  // SOS도 EOI도 없이 끝났다 — 그림이 들어 있지 않은 파일이다.
  return malformed();
}

/**
 * 이 세그먼트를 버릴 것인가. **APPn과 주석만 본다** — 나머지(양자화표·허프만
 * 표·프레임 헤더)는 그림을 그리는 데 필요해 손대지 않는다.
 */
function dropsJpegSegment(
  source: Buffer,
  marker: number,
  from: number,
  to: number,
): boolean {
  // 주석(COM). 어떤 도구가 무엇을 적어 뒀는지 알 수 없다.
  if (marker === 0xfe) return true;
  if (marker < 0xe0 || marker > 0xef) return false;

  // APP0. JFIF 헤더(화면 비율)는 남기고 **JFXX는 버린다** — 그 안에 축소
  // 이미지가 들어 있어, 얼굴을 잘라낸 사진의 자르기 전 모습이 거기 남는다.
  if (marker === 0xe0) return startsWith(source, from, to, "JFXX\0");

  // APP2의 ICC 프로파일만 남긴다 — 색이 틀어지지 않게 하는 값이고 사람에 관한
  // 정보가 없다. 그 밖의 APP1~APP15는 전부 버린다(APP1이 EXIF와 XMP,
  // APP13이 IPTC다).
  if (marker === 0xe2) return !startsWith(source, from, to, "ICC_PROFILE\0");
  return true;
}

function startsWith(source: Buffer, from: number, to: number, prefix: string): boolean {
  if (to - from < prefix.length) return false;
  return source.toString("latin1", from, from + prefix.length) === prefix;
}

/**
 * 버릴 PNG 청크. **남기는 청크는 바이트 그대로 옮기므로 CRC를 다시 셀 일이 없다.**
 * `iCCP`(색)·`pHYs`(해상도)·APNG 청크는 남는다.
 */
const PNG_DROP = new Set(["eXIf", "tEXt", "zTXt", "iTXt", "tIME"]);

/** PNG. `길이(4) 종류(4) 데이터 CRC(4)` 청크가 줄지어 있고 EXIF는 `eXIf`다. */
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
      // IEND 뒤의 바이트는 규격에 없는 것이다. JPEG의 EOI 뒤와 같은 이유로 버린다.
      if (pos < source.length) dropped = true;
      return finish(source, keep, dropped);
    }
  }

  // IEND 없이 끝났다 — 잘린 파일이다.
  return malformed();
}

/** VP8X 깃발 바이트의 「EXIF 있음」·「XMP 있음」 비트. */
const VP8X_EXIF = 0x08;
const VP8X_XMP = 0x04;

/**
 * WebP는 RIFF 상자다 — `RIFF <크기> WEBP` 뒤에 `<이름 4자><크기 4바이트><데이터>`가
 * 줄지어 있고 EXIF·XMP가 각각 청크 하나다. 다만 둘을 들어내는 것으로 끝나지 않아
 * **이 갈래만 바이트를 두 군데 고쳐 쓴다.**
 *   ① 맨 앞 VP8X 청크의 깃발에서 두 비트를 내린다 — 안 내리면 디코더가 없는
 *      청크를 찾는다.
 *   ② RIFF 크기를 줄어든 만큼 다시 적는다.
 */
function stripWebp(source: Buffer): StripResult {
  const declared = source.readUInt32LE(4);
  const end = 8 + declared;
  // 선언한 것보다 파일이 짧으면 잘린 것이다. 길면 뒤에 덧붙은 바이트라 버린다.
  if (end > source.length) return malformed();

  const keep: Range[] = [{ start: 0, end: 12 }];
  let dropped = end < source.length;
  /** 출력에서 VP8X 깃발 바이트가 앉을 자리. 고칠 것이 없으면 -1. */
  let flagsAt = -1;
  let written = 12;
  let pos = 12;

  while (pos + 8 <= end) {
    const fourcc = source.toString("latin1", pos, pos + 4);
    const size = source.readUInt32LE(pos + 4);
    // 청크는 짝수 경계에 맞춘다 — 홀수면 채움 바이트가 하나 붙는다.
    const next = pos + 8 + size + (size % 2);
    if (next > end) return malformed();

    if (fourcc === "EXIF" || fourcc === "XMP ") {
      dropped = true;
    } else {
      if (fourcc === "VP8X") {
        // 규격상 10바이트다. 짧으면 깃발을 고칠 자리조차 없는 깨진 파일이다.
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
  // 8바이트도 안 되는 꼬리가 남았으면 청크 구조가 깨진 것이다.
  if (pos !== end) return malformed();

  if (!dropped) return { ok: true, bytes: source };

  const bytes = join(source, keep);
  if (flagsAt !== -1) bytes[flagsAt] &= ~(VP8X_EXIF | VP8X_XMP);
  bytes.writeUInt32LE(bytes.length - 8, 4);
  return { ok: true, bytes };
}
