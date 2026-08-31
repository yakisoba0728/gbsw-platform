import { readdir, realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const standaloneRoot = path.resolve(
  process.argv[2] ?? path.join(projectRoot, ".next", "standalone"),
);

const ALLOWED_ROOT_ENTRIES = new Set([
  ".next",
  "node_modules",
  "package.json",
  "public",
  "server.js",
]);
const SENSITIVE_DOTFILES = new Set([".npmrc", ".netrc", ".pypirc"]);
const SENSITIVE_EXTENSIONS = new Set([
  ".pem",
  ".key",
  ".crt",
  ".cer",
  ".cert",
  ".der",
  ".p12",
  ".pfx",
  ".jks",
  ".keystore",
  ".sql",
  ".dump",
  ".sqlite",
  ".sqlite3",
  ".db",
  ".bak",
]);
const SENSITIVE_NAME_PATTERN =
  /(?:^|[._-])(?:credentials?|service[-_]?account|secrets?)(?:[._-]|$)/i;

function isProjectControlled(relativePath) {
  return !relativePath.split(path.sep).includes("node_modules");
}

function isSecretLookingName(name) {
  const basename = name.toLowerCase();
  const extension = path.extname(basename);

  return (
    basename.startsWith(".env") ||
    SENSITIVE_DOTFILES.has(basename) ||
    SENSITIVE_NAME_PATTERN.test(basename) ||
    SENSITIVE_EXTENSIONS.has(extension)
  );
}

function isSecretLooking(relativePath) {
  return relativePath.split(path.sep).some(isSecretLookingName);
}

async function listFiles(root, relative = "") {
  const entries = await readdir(path.join(root, relative), { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const child = path.join(relative, entry.name);
    if (entry.isDirectory()) files.push(...(await listFiles(root, child)));
    else files.push(child);
  }

  return files;
}

function isWithinRoot(root, target) {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== "..");
}

async function findUnsafeSymlinks(root, canonicalRoot, relative = "") {
  const entries = await readdir(path.join(root, relative), { withFileTypes: true });
  const unsafe = [];

  for (const entry of entries) {
    const child = path.join(relative, entry.name);
    if (entry.isDirectory()) {
      unsafe.push(...(await findUnsafeSymlinks(root, canonicalRoot, child)));
      continue;
    }
    if (!entry.isSymbolicLink()) continue;

    try {
      const target = await realpath(path.join(root, child));
      if (!isWithinRoot(canonicalRoot, target)) unsafe.push(child);
    } catch {
      // 깨진 링크도 런타임에서 해석할 수 없는 산출물이므로 거부한다.
      unsafe.push(child);
    }
  }

  return unsafe;
}

let files;
let rootEntries;
let unsafeSymlinks;
try {
  rootEntries = await readdir(standaloneRoot);
  files = await listFiles(standaloneRoot);
  unsafeSymlinks = await findUnsafeSymlinks(
    standaloneRoot,
    await realpath(standaloneRoot),
  );
} catch (error) {
  if (error && typeof error === "object" && error.code === "ENOENT") {
    console.error("[standalone] .next/standalone이 없습니다. 먼저 npm run build를 실행하세요.");
    process.exitCode = 1;
  } else {
    throw error;
  }
}

if (files) {
  const leaked = [...new Set([
    ...rootEntries.filter((entry) => !ALLOWED_ROOT_ENTRIES.has(entry)),
    ...files.filter(
      (file) => isProjectControlled(file) && isSecretLooking(file),
    ),
    ...unsafeSymlinks,
  ])].sort();
  if (leaked.length > 0) {
    console.error(
      "[standalone] 허용되지 않은 파일, 비밀 가능 파일 또는 외부 심볼릭 링크가 있습니다:",
    );
    for (const file of leaked.slice(0, 50)) console.error(`  - ${file}`);
    if (leaked.length > 50) console.error(`  - 외 ${leaked.length - 50}개`);
    process.exitCode = 1;
  } else {
    console.log(`[standalone] 검사 통과 (${files.length}개 파일)`);
  }
}
