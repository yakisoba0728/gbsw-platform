import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const checkerPath = path.resolve("scripts/check-standalone.mjs");
const temporaryRoots: string[] = [];

async function createStandaloneFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "gbsw-standalone-"));
  temporaryRoots.push(root);

  await mkdir(path.join(root, ".next"), { recursive: true });
  await mkdir(path.join(root, "node_modules"), { recursive: true });
  await mkdir(path.join(root, "public"), { recursive: true });
  await writeFile(path.join(root, "package.json"), "{}\n");
  await writeFile(path.join(root, "server.js"), "// fixture\n");

  return root;
}

function runChecker(root: string) {
  return spawnSync(process.execPath, [checkerPath, root], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("standalone artifact checker CLI", () => {
  it("accepts the allowlisted standalone layout", async () => {
    const root = await createStandaloneFixture();
    await mkdir(path.join(root, ".next", "server", "chunks"), { recursive: true });
    await writeFile(path.join(root, ".next", "server", "runtime.js"), "// runtime\n");
    await symlink(
      path.join("..", "runtime.js"),
      path.join(root, ".next", "server", "chunks", "runtime-link.js"),
    );

    const result = runChecker(root);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("검사 통과");
  });

  it("ignores dependency-owned filenames below node_modules", async () => {
    const root = await createStandaloneFixture();
    const dependencyRoot = path.join(root, ".next", "server", "node_modules", "fixture");
    await mkdir(dependencyRoot, { recursive: true });
    await writeFile(path.join(dependencyRoot, "private.key"), "dependency fixture\n");
    await writeFile(path.join(dependencyRoot, ".npmrc"), "dependency fixture\n");

    const result = runChecker(root);

    expect(result.status).toBe(0);
  });

  it("rejects an unexpected root entry", async () => {
    const root = await createStandaloneFixture();
    await writeFile(path.join(root, ".npmrc"), "//registry.example.test/:_authToken=secret\n");

    const result = runChecker(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(".npmrc");
  });

  it("rejects a nested secret-looking filename outside node_modules", async () => {
    const root = await createStandaloneFixture();
    await mkdir(path.join(root, "public", "backup"), { recursive: true });
    await writeFile(
      path.join(root, "public", "backup", "credentials.json"),
      '{"token":"secret"}\n',
    );

    const result = runChecker(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(path.join("public", "backup", "credentials.json"));
  });

  it("rejects a sensitive directory name anywhere in the relative path", async () => {
    const root = await createStandaloneFixture();
    const sensitiveDirectory = path.join(root, "public", ".env.production");
    await mkdir(sensitiveDirectory, { recursive: true });
    await writeFile(path.join(sensitiveDirectory, "index.txt"), "secret\n");

    const result = runChecker(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(path.join("public", ".env.production", "index.txt"));
  });

  it.each([
    ".env",
    ".env.production",
    ".envrc",
    ".npmrc",
    ".netrc",
    ".pypirc",
    "service-account-production.json",
    "secrets.yaml",
    "private.pem",
    "private.key",
    "certificate.crt",
    "snapshot.sql",
    "snapshot.dump",
    "database.sqlite",
    "database.db",
    "database.bak",
  ])("rejects nested sensitive artifact %s", async (filename) => {
    const root = await createStandaloneFixture();
    const nestedRoot = path.join(root, ".next", "server", "assets");
    await mkdir(nestedRoot, { recursive: true });
    await writeFile(path.join(nestedRoot, filename), "secret\n");

    const result = runChecker(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(filename);
  });

  it("rejects a symlink that escapes the standalone root", async () => {
    const root = await createStandaloneFixture();
    const outsideRoot = await mkdtemp(path.join(os.tmpdir(), "gbsw-outside-"));
    temporaryRoots.push(outsideRoot);
    const linkRoot = path.join(root, ".next", "server");
    await mkdir(linkRoot, { recursive: true });
    await writeFile(path.join(outsideRoot, "runtime.js"), "// outside\n");
    await symlink(
      path.join(outsideRoot, "runtime.js"),
      path.join(linkRoot, "runtime-link.js"),
    );

    const result = runChecker(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(path.join(".next", "server", "runtime-link.js"));
  });
});
