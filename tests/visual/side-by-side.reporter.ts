import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Reporter, TestCase, TestResult } from "@playwright/test/reporter";

type ComparisonMeta = {
  kind: "comparison";
  viewport: string;
  role: string;
  id: string;
  label: string;
  path: string;
  baselinePath: string;
  redesignPath: string;
};

type RedirectMeta = {
  kind: "redirect";
  role: string;
  id: string;
  label: string;
  from: string;
  to: string;
  baseline: {
    httpStatus: number;
    contractStatus: number | null;
    location: string | null;
    mechanism: string;
  };
  redesign: {
    httpStatus: number;
    contractStatus: number | null;
    location: string | null;
    mechanism: string;
  };
};

type VisualMeta = ComparisonMeta | RedirectMeta;
type ReportRow = {
  meta: VisualMeta;
  status: TestResult["status"];
  error?: string;
};
type UntrackedFailure = {
  title: string;
  status: TestResult["status"];
  error?: string;
};

function escapeHtml(value: unknown): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function metaFrom(result: TestResult): VisualMeta | null {
  const attachment =
    result.attachments.find((item) => item.name === "visual-meta-result") ||
    result.attachments.find((item) => item.name === "visual-meta");
  if (!attachment?.body) return null;
  try {
    return JSON.parse(attachment.body.toString("utf8")) as VisualMeta;
  } catch {
    return null;
  }
}

function imageSource(outputFile: string, imagePath: string): string {
  const relative = path
    .relative(path.dirname(outputFile), imagePath)
    .split(path.sep)
    .join("/");
  return encodeURI(relative).replaceAll("#", "%23");
}

function statusBadge(status: TestResult["status"]): string {
  return `<span class="status status-${escapeHtml(status)}">${escapeHtml(status)}</span>`;
}

function comparisonCard(outputFile: string, row: ReportRow): string {
  const meta = row.meta as ComparisonMeta;
  const image = (label: string, imagePath: string) =>
    existsSync(imagePath)
      ? `<a href="${imageSource(outputFile, imagePath)}"><img loading="lazy" src="${imageSource(outputFile, imagePath)}" alt="${escapeHtml(meta.label)} ${escapeHtml(label)}" /></a>`
      : `<p class="missing">${escapeHtml(label)} 이미지를 만들지 못했습니다.</p>`;
  return `
    <article class="comparison" id="${escapeHtml(`${meta.viewport}-${meta.role}-${meta.id}`)}">
      <header>
        <div>
          <p class="eyebrow">${escapeHtml(meta.viewport)} · ${escapeHtml(meta.role)}</p>
          <h2>${escapeHtml(meta.label)}</h2>
          <code>${escapeHtml(meta.path)}</code>
        </div>
        ${statusBadge(row.status)}
      </header>
      ${row.error ? `<pre class="error">${escapeHtml(row.error)}</pre>` : ""}
      <div class="pair">
        <figure>
          <figcaption>main · baseline</figcaption>
          ${image("baseline", meta.baselinePath)}
        </figure>
        <figure>
          <figcaption>redesign</figcaption>
          ${image("redesign", meta.redesignPath)}
        </figure>
      </div>
    </article>`;
}

function redirectRow(row: ReportRow): string {
  const meta = row.meta as RedirectMeta;
  const observation = (value: RedirectMeta["baseline"]) =>
    `HTTP ${escapeHtml(value.httpStatus)} · ${escapeHtml(value.mechanism)} · 계약 ${escapeHtml(value.contractStatus || "-")}<br><code>${escapeHtml(value.location || "(없음)")}</code>`;
  return `<tr>
    <td>${escapeHtml(meta.role)}</td>
    <td>${escapeHtml(meta.label)}<br><code>${escapeHtml(meta.from)}</code></td>
    <td>${observation(meta.baseline)}</td>
    <td>${observation(meta.redesign)}</td>
    <td>${statusBadge(row.status)}</td>
  </tr>`;
}

class SideBySideReporter implements Reporter {
  private readonly outputFile: string;
  private readonly rows: ReportRow[] = [];
  private readonly untrackedFailures: UntrackedFailure[] = [];

  constructor(options: { outputFile: string }) {
    this.outputFile = path.resolve(options.outputFile);
  }

  printsToStdio(): boolean {
    return false;
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    const meta = metaFrom(result);
    if (!meta) {
      if (result.status !== "passed" && result.status !== "skipped") {
        this.untrackedFailures.push({
          title: test.titlePath().join(" › "),
          status: result.status,
          error: result.error?.message,
        });
      }
      return;
    }
    this.rows.push({
      meta,
      status: result.status,
      error: result.error?.message,
    });
  }

  async onEnd(): Promise<void> {
    const comparisons = this.rows
      .filter((row) => row.meta.kind === "comparison")
      .sort((a, b) => {
        const left = a.meta as ComparisonMeta;
        const right = b.meta as ComparisonMeta;
        return `${left.viewport}:${left.role}:${left.id}`.localeCompare(
          `${right.viewport}:${right.role}:${right.id}`,
        );
      });
    const redirects = this.rows
      .filter((row) => row.meta.kind === "redirect")
      .sort((a, b) => {
        const left = a.meta as RedirectMeta;
        const right = b.meta as RedirectMeta;
        return `${left.role}:${left.id}`.localeCompare(
          `${right.role}:${right.id}`,
        );
      });
    const failures =
      this.rows.filter((row) => row.status !== "passed").length +
      this.untrackedFailures.length;

    const html = `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>GBSW main ↔ redesign 비교</title>
  <style>
    :root { color-scheme: light; font-family: Pretendard, system-ui, sans-serif; background: #eef3f1; color: #15201c; }
    * { box-sizing: border-box; }
    body { margin: 0; padding: 32px; }
    main { width: min(1800px, 100%); margin: 0 auto; }
    h1, h2 { margin: 0; }
    .summary { display: flex; gap: 12px; flex-wrap: wrap; margin: 16px 0 28px; }
    .summary span, .status { border-radius: 999px; padding: 5px 10px; background: #dce8e3; font-size: 13px; font-weight: 700; }
    .status-passed { background: #d7f5e7; color: #09613d; }
    .status-failed, .status-timedOut, .status-interrupted { background: #ffe0dc; color: #9f2418; }
    .comparison { margin: 0 0 30px; border: 1px solid #cbd7d2; border-radius: 18px; background: white; overflow: hidden; box-shadow: 0 10px 30px rgb(25 55 44 / 8%); }
    .comparison > header { display: flex; justify-content: space-between; gap: 20px; align-items: start; padding: 18px 20px; border-bottom: 1px solid #dfe7e4; }
    .eyebrow { margin: 0 0 4px; color: #52645d; font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: .08em; }
    code { color: #40524b; overflow-wrap: anywhere; }
    .pair { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: start; }
    figure { min-width: 0; margin: 0; padding: 14px; }
    figure + figure { border-left: 1px solid #dfe7e4; }
    figcaption { position: sticky; top: 0; z-index: 1; margin: -14px -14px 12px; padding: 9px 14px; background: rgb(255 255 255 / 92%); border-bottom: 1px solid #edf1ef; font-weight: 800; }
    img { display: block; width: 100%; height: auto; border: 1px solid #dfe7e4; background: #fff; }
    .error { margin: 0; padding: 14px 20px; overflow: auto; color: #9f2418; background: #fff2f0; }
    .missing { margin: 0; padding: 32px; color: #9f2418; background: #fff2f0; text-align: center; }
    table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 14px; overflow: hidden; }
    th, td { padding: 12px; border-bottom: 1px solid #dfe7e4; text-align: left; vertical-align: top; }
    th { background: #e4ece9; }
    @media (max-width: 900px) { body { padding: 16px; } .pair { grid-template-columns: 1fr; } figure + figure { border-left: 0; border-top: 1px solid #dfe7e4; } }
  </style>
</head>
<body>
  <main>
    <h1>GBSW main ↔ redesign</h1>
    <div class="summary">
      <span>화면 ${comparisons.length}</span>
      <span>redirect 계약 ${redirects.length}</span>
      <span>실패 ${failures}</span>
    </div>
    ${comparisons.map((row) => comparisonCard(this.outputFile, row)).join("\n")}
    ${
      this.untrackedFailures.length > 0
        ? `<section>
      <h2>Setup/runtime 실패</h2>
      <p>화면 metadata를 만들기 전에 실패한 테스트입니다. 전체 비교 실행도 실패로 간주됩니다.</p>
      ${this.untrackedFailures
        .map(
          (failure) => `<article class="comparison">
        <header><code>${escapeHtml(failure.title)}</code>${statusBadge(failure.status)}</header>
        ${failure.error ? `<pre class="error">${escapeHtml(failure.error)}</pre>` : ""}
      </article>`,
        )
        .join("\n")}
    </section>`
        : ""
    }
    <section>
      <h2>Redirect-only 경로</h2>
      <p>이 경로들은 canonical 화면을 중복 캡처하지 않고 상태 코드와 목적지만 비교합니다.</p>
      <table>
        <thead><tr><th>역할</th><th>이전 경로</th><th>main</th><th>redesign</th><th>결과</th></tr></thead>
        <tbody>${redirects.map(redirectRow).join("\n")}</tbody>
      </table>
    </section>
  </main>
</body>
</html>`;

    await mkdir(path.dirname(this.outputFile), { recursive: true });
    await writeFile(this.outputFile, html, "utf8");
  }
}

export default SideBySideReporter;
