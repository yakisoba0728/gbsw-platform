import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { VisualRole, VisualTarget, VisualViewport } from "./visual.manifest";
import type { VisualFixtureManifest } from "./visual.manifest";

type Environment = Readonly<Record<string, string | undefined>>;

export type VisualCredential = Readonly<{
  email: string;
  password: string;
  expectedRole: "ADMIN" | "STUDENT" | "PARENT";
}>;

export type VisualRuntime = Readonly<{
  dryRun: boolean;
  repoRoot: string;
  baselineRoot: string;
  redesignRoot: string;
  artifactRoot: string;
  fixtureManifestPath: string;
  ports: Readonly<Record<VisualTarget, number>>;
  browserTime: string;
}>;

const DRY_RUN_FIXTURES: VisualFixtureManifest = {
  studentProfileId: "dry-student-profile",
  studentUserId: "dry-student-user",
  passId: "dry-pass",
  communityId: "dry-community",
  communitySlug: "dry-community",
  postId: "dry-post",
  editablePostIds: {
    teacher: "dry-teacher-post",
    student: "dry-student-post",
    parent: "dry-parent-post",
  },
};

function parsePort(value: string | undefined, fallback: number, name: string): number {
  const port = value ? Number(value) : fallback;
  if (!Number.isInteger(port) || port < 1024 || port > 65_535) {
    throw new Error(`${name}은 1024~65535 사이의 포트여야 합니다.`);
  }
  return port;
}

function isInside(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function assertLocalArtifactPath(repoRoot: string, target: string, label: string): void {
  const devLocal = path.join(repoRoot, "dev-local");
  const testResults = path.join(repoRoot, "test-results");
  if (!isInside(devLocal, target) && !isInside(testResults, target)) {
    throw new Error(`${label}은 dev-local 또는 test-results 안에 있어야 합니다.`);
  }
}

function assertBuiltWorktree(root: string, label: string): void {
  if (!existsSync(path.join(root, "package.json"))) {
    throw new Error(`${label} worktree에 package.json이 없습니다: ${root}`);
  }
  if (!existsSync(path.join(root, ".next", "standalone", "server.js"))) {
    throw new Error(`${label} worktree의 production standalone 빌드가 없습니다: ${root}`);
  }
}

export function resolveVisualRuntime(
  environment: Environment = process.env,
  cwd: string = process.cwd(),
  options: Readonly<{ requireBuilds?: boolean }> = {},
): VisualRuntime {
  const repoRoot = path.resolve(cwd);
  const dryRun = environment.VISUAL_COMPARE_DRY_RUN === "1";
  const baselineRoot = path.resolve(
    repoRoot,
    environment.VISUAL_BASELINE_ROOT || "dev-local/ui-baseline-b81abf7",
  );
  const redesignRoot = path.resolve(repoRoot, environment.VISUAL_REDESIGN_ROOT || ".");
  const artifactRoot = path.resolve(
    repoRoot,
    environment.VISUAL_ARTIFACT_ROOT || "test-results/visual-compare",
  );
  const fixtureManifestPath = path.resolve(
    repoRoot,
    environment.VISUAL_FIXTURE_MANIFEST || "dev-local/visual-fixtures.json",
  );
  const ports = {
    baseline: parsePort(environment.VISUAL_BASELINE_PORT, 3200, "VISUAL_BASELINE_PORT"),
    redesign: parsePort(environment.VISUAL_REDESIGN_PORT, 3201, "VISUAL_REDESIGN_PORT"),
  } as const;

  if (baselineRoot === redesignRoot) {
    throw new Error("baseline과 redesign worktree는 서로 달라야 합니다.");
  }
  if (ports.baseline === ports.redesign) {
    throw new Error("baseline과 redesign 포트는 서로 달라야 합니다.");
  }

  assertLocalArtifactPath(repoRoot, baselineRoot, "VISUAL_BASELINE_ROOT");
  assertLocalArtifactPath(repoRoot, artifactRoot, "VISUAL_ARTIFACT_ROOT");
  assertLocalArtifactPath(repoRoot, fixtureManifestPath, "VISUAL_FIXTURE_MANIFEST");

  if (!dryRun && options.requireBuilds !== false) {
    assertBuiltWorktree(baselineRoot, "baseline");
    assertBuiltWorktree(redesignRoot, "redesign");
  }

  const browserTime = environment.VISUAL_BROWSER_TIME || "2026-08-31T03:00:00.000Z";
  if (Number.isNaN(new Date(browserTime).valueOf())) {
    throw new Error("VISUAL_BROWSER_TIME이 올바른 날짜가 아닙니다.");
  }

  return {
    dryRun,
    repoRoot,
    baselineRoot,
    redesignRoot,
    artifactRoot,
    fixtureManifestPath,
    ports,
    browserTime,
  };
}

function required(environment: Environment, key: string, dryRun: boolean): string {
  const value = environment[key];
  if (value) return value;
  if (dryRun) return `${key.toLowerCase()}@dry.invalid`;
  throw new Error(`${key}이 필요합니다.`);
}

export function resolveVisualCredentials(
  environment: Environment = process.env,
): Readonly<Record<VisualRole, VisualCredential>> {
  const dryRun = environment.VISUAL_COMPARE_DRY_RUN === "1";
  const teacherEmail = required(environment, "VISUAL_TEACHER_EMAIL", dryRun);
  const teacherPassword = required(environment, "VISUAL_TEACHER_PASSWORD", dryRun);

  return {
    teacher: {
      email: teacherEmail,
      password: teacherPassword,
      expectedRole: "ADMIN",
    },
    admin: {
      email: environment.VISUAL_ADMIN_EMAIL || teacherEmail,
      password: environment.VISUAL_ADMIN_PASSWORD || teacherPassword,
      expectedRole: "ADMIN",
    },
    student: {
      email: required(environment, "VISUAL_STUDENT_EMAIL", dryRun),
      password: required(environment, "VISUAL_STUDENT_PASSWORD", dryRun),
      expectedRole: "STUDENT",
    },
    parent: {
      email: required(environment, "VISUAL_PARENT_EMAIL", dryRun),
      password: required(environment, "VISUAL_PARENT_PASSWORD", dryRun),
      expectedRole: "PARENT",
    },
  };
}

function stringField(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`visual fixture manifest의 ${name}이 비어 있습니다.`);
  }
  return value;
}

export function loadVisualFixtureManifest(runtime: VisualRuntime): VisualFixtureManifest {
  if (runtime.dryRun) return DRY_RUN_FIXTURES;
  if (!existsSync(runtime.fixtureManifestPath)) {
    throw new Error(`visual fixture manifest가 없습니다: ${runtime.fixtureManifestPath}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(runtime.fixtureManifestPath, "utf8"));
  } catch {
    throw new Error(`visual fixture manifest를 읽을 수 없습니다: ${runtime.fixtureManifestPath}`);
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("visual fixture manifest는 JSON 객체여야 합니다.");
  }
  const row = parsed as Record<string, unknown>;
  const editable = row.editablePostIds;
  if (!editable || typeof editable !== "object") {
    throw new Error("visual fixture manifest의 editablePostIds가 없습니다.");
  }
  const posts = editable as Record<string, unknown>;

  return {
    studentProfileId: stringField(row.studentProfileId, "studentProfileId"),
    studentUserId: stringField(row.studentUserId, "studentUserId"),
    passId: stringField(row.passId, "passId"),
    communityId: stringField(row.communityId, "communityId"),
    communitySlug: stringField(row.communitySlug, "communitySlug"),
    postId: stringField(row.postId, "postId"),
    editablePostIds: {
      teacher: stringField(posts.teacher, "editablePostIds.teacher"),
      student: stringField(posts.student, "editablePostIds.student"),
      parent: stringField(posts.parent, "editablePostIds.parent"),
    },
  };
}

export function visualStorageStatePath(
  runtime: VisualRuntime,
  target: VisualTarget,
  role: VisualRole,
): string {
  return path.join(runtime.artifactRoot, "auth", `${target}-${role}.json`);
}

export function visualScreenshotPath(
  runtime: VisualRuntime,
  viewport: VisualViewport,
  role: VisualRole,
  routeId: string,
  target: VisualTarget,
): string {
  return path.join(runtime.artifactRoot, "screenshots", viewport, role, routeId, `${target}.png`);
}
