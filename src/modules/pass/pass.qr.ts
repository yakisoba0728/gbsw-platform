import "server-only";
import { encode } from "uqr";

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
