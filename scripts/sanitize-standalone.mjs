import { lstat, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const standaloneRoot = path.join(projectRoot, ".next", "standalone");

// Next 16.3은 outputFileTracingExcludes와 무관하게, 빌드 때 읽은 이 두 파일을
// standalone에 별도로 복사한다(next/dist/build/index.js). 운영 컨테이너는
// compose가 환경변수를 직접 주입하므로 로컬 비밀 파일은 런타임에 필요 없다.
const copiedEnvFiles = [".env", ".env.production"];

const present = [];
for (const filename of copiedEnvFiles) {
  const target = path.join(standaloneRoot, filename);
  try {
    await lstat(target);
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") continue;
    throw error;
  }

  await rm(target, { force: true });
  present.push(filename);
}

if (present.length > 0) {
  console.log(`[standalone] 환경 파일 제거: ${present.join(", ")}`);
} else {
  console.log("[standalone] 제거할 환경 파일 없음");
}
