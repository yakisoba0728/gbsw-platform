import { lstat, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const standaloneRoot = path.join(projectRoot, ".next", "standalone");

// Next가 tracing 제외와 별개로 복사한다. 런타임 비밀은 환경으로만 주입한다.
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
