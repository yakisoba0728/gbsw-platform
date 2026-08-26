import "server-only";
import { encode } from "uqr";

/**
 * QR 매트릭스를 SVG `<path>`의 `d` 문자열 하나로 만든다. **서버 전용** —
 * 이 파일만 uqr을 import하므로 인코더가 클라이언트 번들에 들어가지 않는다.
 * `server-only`가 그 약속을 빌드 오류로 지킨다: 주석만으로는 언젠가 새어 나간다.
 *
 * uqr의 renderSVG는 4KB짜리 문자열을 뱉는다. 여기서는 칸을 가로로 묶어 조각 수를
 * 줄인 path 하나만 내보내고, 화면은 `<svg><path d={d}/></svg>`로 그린다 —
 * DOM 노드 하나이고 dangerouslySetInnerHTML이 필요 없다.
 */
export function matrixToPath(data: readonly (readonly boolean[])[]): string {
  let d = "";

  for (let y = 0; y < data.length; y++) {
    const row = data[y];
    let x = 0;
    while (x < row.length) {
      if (!row[x]) {
        x++;
        continue;
      }
      let run = 1;
      while (x + run < row.length && row[x + run]) run++;
      d += `M${x} ${y}h${run}v1h-${run}z`;
      x += run;
    }
  }

  return d;
}

export function toQrPath(text: string): { size: number; d: string } {
  const { size, data } = encode(text);
  return { size, d: matrixToPath(data) };
}
