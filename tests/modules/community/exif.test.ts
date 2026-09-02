import { describe, expect, it } from "vitest";
import { stripImageMetadata } from "@/modules/community/community.exif";

function segment(marker: number, payload: Buffer | string): Buffer {
  const data = typeof payload === "string" ? Buffer.from(payload, "utf8") : payload;
  const head = Buffer.alloc(4);
  head.writeUInt8(0xff, 0);
  head.writeUInt8(marker, 1);
  head.writeUInt16BE(data.length + 2, 2);
  return Buffer.concat([head, data]);
}

const SCAN = Buffer.from([0xaa, 0xbb, 0xff, 0x00, 0xcc, 0xdd]);

function jpeg(segments: Buffer[], trailer: Buffer = Buffer.alloc(0)): Buffer {
  return Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    ...segments,
    segment(0xda, Buffer.from([0x01, 0x01, 0x00])),
    SCAN,
    Buffer.from([0xff, 0xd9]),
    trailer,
  ]);
}

const APP1_EXIF = segment(0xe1, "Exif\0\0II*\0GPSLatitude=36.11 Make=Pixel");
const APP1_XMP = segment(0xe1, "http://ns.adobe.com/xap/1.0/\0<x:xmpmeta/>");
const APP13_IPTC = segment(0xed, "Photoshop 3.0\0");
const COMMENT = segment(0xfe, "김민준의 휴대폰에서 보냄");
const APP0_JFIF = segment(0xe0, "JFIF\0\0\0\0\0\0");
const APP0_JFXX = segment(0xe0, "JFXX\0(잘라내기 전 축소 이미지)");
const APP2_ICC = segment(0xe2, "ICC_PROFILE\0\0(색 프로파일)");
const APP2_OTHER = segment(0xe2, "FPXR\0(플래시픽스)");
const DQT = segment(0xdb, Buffer.alloc(65, 7));

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function chunk(type: string, data: Buffer | string): Buffer {
  const body = typeof data === "string" ? Buffer.from(data, "utf8") : data;
  const head = Buffer.alloc(8);
  head.writeUInt32BE(body.length, 0);
  head.write(type, 4, "latin1");
  return Buffer.concat([head, body, Buffer.alloc(4)]);
}

function png(chunks: Buffer[], trailer: Buffer = Buffer.alloc(0)): Buffer {
  return Buffer.concat([PNG_SIG, ...chunks, chunk("IEND", ""), trailer]);
}

const IHDR = chunk("IHDR", Buffer.alloc(13, 1));
const IDAT = chunk("IDAT", Buffer.alloc(32, 9));
const ICCP = chunk("iCCP", "sRGB\0\0(색 프로파일)");
const PHYS = chunk("pHYs", Buffer.alloc(9, 2));

function riffChunk(fourcc: string, data: Buffer | string): Buffer {
  const body = typeof data === "string" ? Buffer.from(data, "utf8") : data;
  const head = Buffer.alloc(8);
  head.write(fourcc, 0, "latin1");
  head.writeUInt32LE(body.length, 4);
  const pad = body.length % 2 === 1 ? Buffer.alloc(1) : Buffer.alloc(0);
  return Buffer.concat([head, body, pad]);
}

function vp8x(flags: number): Buffer {
  const data = Buffer.alloc(10);
  data.writeUInt8(flags, 0);
  return riffChunk("VP8X", data);
}

function webp(chunks: Buffer[]): Buffer {
  const body = Buffer.concat([Buffer.from("WEBP", "latin1"), ...chunks]);
  const head = Buffer.alloc(8);
  head.write("RIFF", 0, "latin1");
  head.writeUInt32LE(body.length, 4);
  return Buffer.concat([head, body]);
}

const VP8_PIXELS = riffChunk("VP8 ", Buffer.alloc(5, 3));

function stripped(source: Buffer): Buffer {
  const result = stripImageMetadata(source);
  if (!result.ok) throw new Error(`벗기지 못했다: ${result.code}`);
  return result.bytes;
}

describe("stripImageMetadata — JPEG", () => {
  it("EXIF(APP1)를 들어내고 화소는 한 바이트도 안 건드린다", () => {
    const result = stripped(jpeg([APP1_EXIF, DQT]));

    expect(result.equals(jpeg([DQT]))).toBe(true);
    expect(result.includes(Buffer.from("GPS"))).toBe(false);
    expect(result.includes(SCAN)).toBe(true);
  });

  it("XMP·IPTC·주석도 함께 사라진다 — APP1만 보는 게 아니다", () => {
    const result = stripped(jpeg([APP1_XMP, APP13_IPTC, COMMENT, DQT]));

    expect(result.equals(jpeg([DQT]))).toBe(true);
    expect(result.includes(Buffer.from("김민준", "utf8"))).toBe(false);
  });

  it("JFIF는 남기고 JFXX는 버린다 — JFXX 안에 자르기 전 축소 이미지가 있다", () => {
    const result = stripped(jpeg([APP0_JFIF, APP0_JFXX, DQT]));

    expect(result.equals(jpeg([APP0_JFIF, DQT]))).toBe(true);
  });

  it("ICC 프로파일만 남는다 — 색이 틀어지지 않게, 사람 정보는 없다", () => {
    const result = stripped(jpeg([APP2_ICC, APP2_OTHER, DQT]));

    expect(result.equals(jpeg([APP2_ICC, DQT]))).toBe(true);
  });

  it("EOI 뒤에 붙은 바이트를 버린다 — 모션 포토의 동영상이 거기 있다", () => {
    const video = Buffer.from("\0\0\0ftypmp42(동영상 전체)");
    const result = stripped(jpeg([DQT], video));

    expect(result.equals(jpeg([DQT]))).toBe(true);
  });

  it("마커 앞 채움 FF가 여러 개여도 센다", () => {
    const padded = Buffer.concat([
      Buffer.from([0xff, 0xd8]),
      Buffer.from([0xff, 0xff]),
      APP1_EXIF,
      segment(0xda, Buffer.from([0x01, 0x01, 0x00])),
      SCAN,
      Buffer.from([0xff, 0xd9]),
    ]);

    expect(stripped(padded).equals(jpeg([]))).toBe(true);
  });

  it("벗길 것이 없으면 원본 버퍼를 그대로 준다 — 복사가 한 벌도 안 일어난다", () => {
    const clean = jpeg([APP0_JFIF, DQT]);
    const result = stripImageMetadata(clean);

    expect(result).toEqual({ ok: true, bytes: clean });
    expect(result.ok && result.bytes).toBe(clean);
  });
});

describe("stripImageMetadata — PNG", () => {
  it("eXIf·텍스트 청크가 사라지고 나머지는 그대로다", () => {
    const source = png([
      IHDR,
      chunk("eXIf", "II*\0GPSLatitude=36.11"),
      chunk("tEXt", "Author\0김민준"),
      chunk("iTXt", "XML:com.adobe.xmp\0"),
      chunk("zTXt", "Comment\0"),
      chunk("tIME", Buffer.alloc(7, 1)),
      ICCP,
      PHYS,
      IDAT,
    ]);

    const result = stripped(source);

    expect(result.equals(png([IHDR, ICCP, PHYS, IDAT]))).toBe(true);
    expect(result.includes(Buffer.from("GPS"))).toBe(false);
  });

  it("IEND 뒤에 붙은 바이트를 버린다", () => {
    const result = stripped(png([IHDR, IDAT], Buffer.from("(뒤에 숨긴 것)")));

    expect(result.equals(png([IHDR, IDAT]))).toBe(true);
  });

  it("벗길 것이 없으면 원본 버퍼를 그대로 준다", () => {
    const clean = png([IHDR, ICCP, IDAT]);
    const result = stripImageMetadata(clean);

    expect(result.ok && result.bytes).toBe(clean);
  });
});

describe("stripImageMetadata — WebP", () => {
  it("EXIF·XMP 청크를 들어내고 VP8X 깃발과 RIFF 크기를 함께 고친다", () => {
    const source = webp([
      vp8x(0x10 | 0x08 | 0x04),
      VP8_PIXELS,
      riffChunk("EXIF", "II*\0GPSLatitude=36.11"),
      riffChunk("XMP ", "<x:xmpmeta/>"),
    ]);

    const result = stripped(source);

    expect(result.equals(webp([vp8x(0x10), VP8_PIXELS]))).toBe(true);
    expect(result.includes(Buffer.from("GPS"))).toBe(false);
  });

  it("벗길 것이 없으면 원본 버퍼를 그대로 준다", () => {
    const clean = webp([vp8x(0x10), VP8_PIXELS]);
    const result = stripImageMetadata(clean);

    expect(result.ok && result.bytes).toBe(clean);
  });
});

describe("stripImageMetadata — 벗기지 않는 것", () => {
  it.each(["GIF87a", "GIF89a"])(
    "%s는 원본 그대로 둔다 — 규격에 EXIF 자리가 없다",
    (magic) => {
      const gif = Buffer.concat([
        Buffer.from(magic, "latin1"),
        Buffer.alloc(7, 1),
        Buffer.from([0x3b]),
      ]);

      expect(stripImageMetadata(gif)).toEqual({ ok: true, bytes: gif });
    },
  );
});

describe("stripImageMetadata — 못 알아보면 거부한다", () => {
  it.each<[string, Buffer]>([
    ["빈 파일", Buffer.alloc(0)],
    ["형식을 모르는 바이트", Buffer.from("PNG")],
    ["BMP", Buffer.concat([Buffer.from("BM"), Buffer.alloc(40)])],
    ["TIFF", Buffer.concat([Buffer.from("II*\0"), Buffer.alloc(40)])],
    [
      "세그먼트 길이가 파일을 넘는 JPEG",
      Buffer.concat([Buffer.from([0xff, 0xd8]), Buffer.from([0xff, 0xe1, 0xff, 0xfe])]),
    ],
    [
      "화소도 EOI도 없는 JPEG",
      Buffer.concat([Buffer.from([0xff, 0xd8]), APP1_EXIF]),
    ],
    [
      "세그먼트가 끝난 자리에 마커가 없는 JPEG",
      Buffer.concat([Buffer.from([0xff, 0xd8]), APP0_JFIF, Buffer.alloc(8, 0x41)]),
    ],
    ["IEND 없이 끝난 PNG", Buffer.concat([PNG_SIG, IHDR, IDAT])],
    [
      "선언한 크기보다 짧은 WebP",
      (() => {
        const short = Buffer.concat([webp([VP8_PIXELS])]);
        short.writeUInt32LE(short.length, 4);
        return short;
      })(),
    ],
    [
      "청크가 잘린 WebP",
      webp([Buffer.concat([VP8_PIXELS, Buffer.from([0x01, 0x02, 0x03])])]),
    ],
  ])("%s는 거부한다", (_label, bytes) => {
    expect(stripImageMetadata(bytes)).toEqual({
      ok: false,
      code: "ATTACHMENT_METADATA",
    });
  });
});
