import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const standaloneRoot = path.join(projectRoot, ".next", "standalone");
const standaloneNextRoot = path.join(standaloneRoot, ".next");

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
