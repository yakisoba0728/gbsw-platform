import { cp, mkdir, readdir, realpath, rename, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const standaloneRoot = path.join(projectRoot, ".next", "standalone");
const standaloneNextRoot = path.join(standaloneRoot, ".next");

function isWithinRoot(root, target) {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== "..");
}

async function materializeExternalLinks(root, canonicalRoot, relative = "") {
  const entries = await readdir(path.join(root, relative), { withFileTypes: true });
  let count = 0;

  for (const entry of entries) {
    const child = path.join(relative, entry.name);
    const source = path.join(root, child);

    if (entry.isSymbolicLink()) {
      const target = await realpath(source);
      if (isWithinRoot(canonicalRoot, target)) continue;

      const staging = `${source}.materialize-${process.pid}`;
      try {
        await rm(staging, { recursive: true, force: true });
        await cp(target, staging, { recursive: true, dereference: true });
        await rm(source, { recursive: true, force: true });
        await rename(staging, source);
      } finally {
        await rm(staging, { recursive: true, force: true });
      }
      count += 1;
      continue;
    }

    if (entry.isDirectory()) {
      count += await materializeExternalLinks(root, canonicalRoot, child);
    }
  }

  return count;
}

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

// Windows의 Next standalone 빌드는 일부 추적 패키지를 저장소 node_modules를
// 가리키는 junction으로 남긴다. 배포 산출물이 저장소 밖에 의존하지 않도록
// 실제 파일로 치환하고, 뒤의 보안 검사는 외부 링크를 계속 엄격하게 거부한다.
const materializedLinks = await materializeExternalLinks(
  standaloneRoot,
  await realpath(standaloneRoot),
);

console.log(
  `[standalone] public 및 정적 청크 준비 완료 (외부 링크 ${materializedLinks}개 실체화)`,
);
