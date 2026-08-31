import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const standaloneRoot = path.join(projectRoot, ".next", "standalone");
const standaloneNextRoot = path.join(standaloneRoot, ".next");

// Next standalone 출력에는 public과 브라우저 정적 청크가 자동으로 들어가지
// 않는다. 검증 전에 두 디렉터리를 산출물 안으로 합쳐, 테스트와 Docker가
// 이후 변경되지 않은 동일한 디렉터리를 실행하게 한다.
await rm(path.join(standaloneRoot, "public"), { recursive: true, force: true });
await cp(path.join(projectRoot, "public"), path.join(standaloneRoot, "public"), {
  recursive: true,
});

await mkdir(standaloneNextRoot, { recursive: true });
await rm(path.join(standaloneNextRoot, "static"), { recursive: true, force: true });
await cp(
  path.join(projectRoot, ".next", "static"),
  path.join(standaloneNextRoot, "static"),
  { recursive: true },
);

console.log("[standalone] public 및 정적 청크 준비 완료");
