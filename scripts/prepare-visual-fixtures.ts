import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { Pool, type PoolClient } from "pg";
import {
  loadVisualFileEnvironment,
  resolveVisualDatabaseUrls,
} from "../playwright.visual.env";
import type { VisualFixtureManifest } from "../tests/visual/visual.manifest";
import { resolveVisualRuntime } from "../tests/visual/visual.runtime";

const REQUIRED_OPT_IN = "--yes-local-visual-db";
const COMMUNITY_ID = "visual-community-all-roles";
const COMMUNITY_SLUG = "visual-all-roles";
const POSTS = {
  teacher: "visual-post-teacher",
  student: "visual-post-student",
  parent: "visual-post-parent",
} as const;
const DETAIL_PASS_ID = "visual-pass-approved-current";

type Environment = Record<string, string | undefined>;
type Actor = {
  id: string;
  name: string;
  role: string;
  studentProfileId: string | null;
};
type Actors = { teacher: Actor; student: Actor; parent: Actor };

function mergedEnvironment(fileEnvironment: Environment): Environment {
  return { ...fileEnvironment, ...process.env };
}

async function loadActors(
  client: PoolClient,
  emails: { teacher: string; student: string; parent: string },
): Promise<Actors> {
  const result = await client.query<{
    id: string;
    name: string;
    email: string;
    role: string;
    studentProfileId: string | null;
  }>(
    `SELECT
       u."id",
       u."name",
       u."email",
       u."role",
       sp."id" AS "studentProfileId"
     FROM "user" u
     LEFT JOIN "StudentProfile" sp ON sp."userId" = u."id"
     WHERE u."email" = ANY($1::text[])
       AND u."status" = 'ACTIVE'
       AND u."deletedAt" IS NULL`,
    [[emails.teacher, emails.student, emails.parent]],
  );

  const byEmail = new Map(result.rows.map((row) => [row.email, row]));
  const teacher = byEmail.get(emails.teacher);
  const student = byEmail.get(emails.student);
  const parent = byEmail.get(emails.parent);
  if (!teacher || !student || !parent) {
    throw new Error(
      "visual 계정이 부족합니다. 동일 template에서 demo 교사·학생·학부모를 만든 뒤 두 DB를 clone하세요.",
    );
  }
  if (
    teacher.role !== "ADMIN" ||
    student.role !== "STUDENT" ||
    parent.role !== "PARENT"
  ) {
    throw new Error(
      "visual 계정의 역할이 ADMIN/STUDENT/PARENT와 일치하지 않습니다.",
    );
  }
  if (!student.studentProfileId)
    throw new Error("visual 학생에게 StudentProfile이 없습니다.");

  const link = await client.query(
    `SELECT 1
     FROM "ParentStudent"
     WHERE "parentUserId" = $1 AND "studentId" = $2`,
    [parent.id, student.studentProfileId],
  );
  if (link.rowCount !== 1)
    throw new Error("visual 학부모가 visual 학생과 연결되어 있지 않습니다.");

  return { teacher, student, parent };
}

function assertSameActors(baseline: Actors, redesign: Actors): void {
  for (const role of ["teacher", "student", "parent"] as const) {
    const left = baseline[role];
    const right = redesign[role];
    if (
      left.id !== right.id ||
      left.role !== right.role ||
      left.studentProfileId !== right.studentProfileId
    ) {
      throw new Error(
        `baseline/redesign의 ${role} ID가 다릅니다. 한 template을 seed한 뒤 두 DB를 clone해야 합니다.`,
      );
    }
  }
}

function offset(now: Date, hours: number): Date {
  return new Date(now.getTime() + hours * 60 * 60 * 1000);
}

async function upsertCommunity(
  client: PoolClient,
  actors: Actors,
  now: Date,
): Promise<void> {
  await client.query(
    `INSERT INTO "Community"
       ("id", "slug", "name", "description", "readRoles", "writeRoles",
        "anonymous", "allowAttachments", "sortOrder", "active", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, $5::text[], $6::text[], false, true, -100, true, $7, $7)
     ON CONFLICT ("id") DO UPDATE SET
       "slug" = EXCLUDED."slug",
       "name" = EXCLUDED."name",
       "description" = EXCLUDED."description",
       "readRoles" = EXCLUDED."readRoles",
       "writeRoles" = EXCLUDED."writeRoles",
       "anonymous" = EXCLUDED."anonymous",
       "allowAttachments" = EXCLUDED."allowAttachments",
       "sortOrder" = EXCLUDED."sortOrder",
       "active" = EXCLUDED."active",
       "createdAt" = EXCLUDED."createdAt",
       "updatedAt" = EXCLUDED."updatedAt"`,
    [
      COMMUNITY_ID,
      COMMUNITY_SLUG,
      "비주얼 비교 게시판",
      "교사·학생·학부모 화면을 같은 데이터로 비교하는 전용 게시판입니다.",
      ["STUDENT", "PARENT"],
      ["STUDENT", "PARENT"],
      now,
    ],
  );

  const postSpecs = [
    {
      id: POSTS.teacher,
      actor: actors.teacher,
      title: "교사가 작성한 안내",
      body: "비주얼 비교용 안내입니다.\n\n- 첫 번째 항목\n- 두 번째 항목",
      createdAt: offset(now, -3),
    },
    {
      id: POSTS.student,
      actor: actors.student,
      title: "학생이 작성한 글",
      body: "학생 작성·수정 화면을 확인하기 위한 내용입니다.",
      createdAt: offset(now, -2),
    },
    {
      id: POSTS.parent,
      actor: actors.parent,
      title: "학부모가 작성한 글",
      body: "학부모 작성·수정 화면을 확인하기 위한 내용입니다.",
      createdAt: offset(now, -1),
    },
  ];

  for (const spec of postSpecs) {
    await client.query(
      `INSERT INTO "CommunityPost"
         ("id", "communityId", "title", "body", "authorUserId", "authorName",
          "authorRole", "deletedAt", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, NULL, $8, $8)
       ON CONFLICT ("id") DO UPDATE SET
         "communityId" = EXCLUDED."communityId",
         "title" = EXCLUDED."title",
         "body" = EXCLUDED."body",
         "authorUserId" = EXCLUDED."authorUserId",
         "authorName" = EXCLUDED."authorName",
         "authorRole" = EXCLUDED."authorRole",
         "deletedAt" = NULL,
         "deletedByUserId" = NULL,
         "deletedReason" = NULL,
         "createdAt" = EXCLUDED."createdAt",
         "updatedAt" = EXCLUDED."updatedAt"`,
      [
        spec.id,
        COMMUNITY_ID,
        spec.title,
        spec.body,
        spec.actor.id,
        spec.actor.name,
        spec.actor.role,
        spec.createdAt,
      ],
    );
  }

  for (const [index, actor] of [
    actors.teacher,
    actors.student,
    actors.parent,
  ].entries()) {
    await client.query(
      `INSERT INTO "CommunityComment"
         ("id", "postId", "body", "authorUserId", "authorName", "authorRole",
          "deletedAt", "createdAt")
       VALUES ($1, $2, $3, $4, $5, $6, NULL, $7)
       ON CONFLICT ("id") DO UPDATE SET
         "postId" = EXCLUDED."postId",
         "body" = EXCLUDED."body",
         "authorUserId" = EXCLUDED."authorUserId",
         "authorName" = EXCLUDED."authorName",
         "authorRole" = EXCLUDED."authorRole",
         "deletedAt" = NULL,
         "deletedByUserId" = NULL,
         "deletedReason" = NULL,
         "createdAt" = EXCLUDED."createdAt"`,
      [
        `visual-comment-${index + 1}`,
        POSTS.teacher,
        `${actor.name}의 비교용 댓글입니다.`,
        actor.id,
        actor.name,
        actor.role,
        offset(now, -0.5 + index * 0.1),
      ],
    );
  }
}

async function upsertPasses(
  client: PoolClient,
  actors: Actors,
  now: Date,
): Promise<void> {
  const studentProfileId = actors.student.studentProfileId!;
  const pass = (
    id: string,
    type: "OUTING" | "OVERNIGHT",
    status: string,
    startHours: number,
    endHours: number,
    extra: Record<string, unknown> = {},
  ) => ({
    id,
    studentProfileId,
    type,
    status,
    startAt: offset(now, startHours).toISOString(),
    endAt: offset(now, endHours).toISOString(),
    destination: type === "OUTING" ? "구미 시내 병원" : "보호자 자택",
    reason: type === "OUTING" ? "정기 진료" : "가족 행사",
    requestedByUserId: actors.student.id,
    requestedByName: actors.student.name,
    consentedByUserId: null,
    consentedByName: null,
    consentedAt: null,
    consentByProxy: false,
    consentNote: null,
    decidedByUserId: null,
    decidedByName: null,
    decidedAt: null,
    decisionNote: null,
    cancelledByUserId: null,
    cancelledByName: null,
    cancelledAt: null,
    cancelReason: null,
    createdAt: offset(now, -24).toISOString(),
    updatedAt: now.toISOString(),
    ...extra,
  });
  const consent = {
    consentedByUserId: actors.parent.id,
    consentedByName: actors.parent.name,
    consentedAt: offset(now, -12).toISOString(),
  };
  const approval = {
    decidedByUserId: actors.teacher.id,
    decidedByName: actors.teacher.name,
    decidedAt: offset(now, -6).toISOString(),
  };
  const passes = [
    pass("visual-pass-requested", "OUTING", "REQUESTED", 5, 10),
    pass("visual-pass-consented", "OVERNIGHT", "CONSENTED", 24, 48, consent),
    pass(DETAIL_PASS_ID, "OUTING", "APPROVED", -1, 5, approval),
    pass("visual-pass-approved-future", "OVERNIGHT", "APPROVED", 72, 120, {
      ...consent,
      ...approval,
    }),
    pass(
      "visual-pass-approved-past",
      "OUTING",
      "APPROVED",
      -168,
      -160,
      approval,
    ),
    pass("visual-pass-rejected", "OUTING", "REJECTED", 48, 54, {
      ...approval,
      decisionNote: "일정 확인이 필요합니다.",
    }),
    pass("visual-pass-cancelled", "OUTING", "CANCELLED", 24, 30, {
      cancelledByUserId: actors.student.id,
      cancelledByName: actors.student.name,
      cancelledAt: offset(now, -2).toISOString(),
      cancelReason: "일정이 변경되었습니다.",
    }),
  ];

  await client.query(
    `INSERT INTO "Pass" (
       "id", "studentProfileId", "type", "status", "startAt", "endAt",
       "destination", "reason", "requestedByUserId", "requestedByName",
       "consentedByUserId", "consentedByName", "consentedAt", "consentByProxy", "consentNote",
       "decidedByUserId", "decidedByName", "decidedAt", "decisionNote",
       "cancelledByUserId", "cancelledByName", "cancelledAt", "cancelReason",
       "createdAt", "updatedAt"
     )
     SELECT
       x."id", x."studentProfileId", x."type", x."status", x."startAt", x."endAt",
       x."destination", x."reason", x."requestedByUserId", x."requestedByName",
       x."consentedByUserId", x."consentedByName", x."consentedAt", x."consentByProxy", x."consentNote",
       x."decidedByUserId", x."decidedByName", x."decidedAt", x."decisionNote",
       x."cancelledByUserId", x."cancelledByName", x."cancelledAt", x."cancelReason",
       x."createdAt", x."updatedAt"
     FROM jsonb_to_recordset($1::jsonb) AS x(
       "id" text, "studentProfileId" text, "type" text, "status" text,
       "startAt" timestamp, "endAt" timestamp, "destination" text, "reason" text,
       "requestedByUserId" text, "requestedByName" text,
       "consentedByUserId" text, "consentedByName" text, "consentedAt" timestamp,
       "consentByProxy" boolean, "consentNote" text,
       "decidedByUserId" text, "decidedByName" text, "decidedAt" timestamp, "decisionNote" text,
       "cancelledByUserId" text, "cancelledByName" text, "cancelledAt" timestamp, "cancelReason" text,
       "createdAt" timestamp, "updatedAt" timestamp
     )
     ON CONFLICT ("id") DO UPDATE SET
       "studentProfileId" = EXCLUDED."studentProfileId",
       "type" = EXCLUDED."type", "status" = EXCLUDED."status",
       "startAt" = EXCLUDED."startAt", "endAt" = EXCLUDED."endAt",
       "destination" = EXCLUDED."destination", "reason" = EXCLUDED."reason",
       "requestedByUserId" = EXCLUDED."requestedByUserId", "requestedByName" = EXCLUDED."requestedByName",
       "consentedByUserId" = EXCLUDED."consentedByUserId", "consentedByName" = EXCLUDED."consentedByName",
       "consentedAt" = EXCLUDED."consentedAt", "consentByProxy" = EXCLUDED."consentByProxy",
       "consentNote" = EXCLUDED."consentNote",
       "decidedByUserId" = EXCLUDED."decidedByUserId", "decidedByName" = EXCLUDED."decidedByName",
       "decidedAt" = EXCLUDED."decidedAt", "decisionNote" = EXCLUDED."decisionNote",
       "cancelledByUserId" = EXCLUDED."cancelledByUserId", "cancelledByName" = EXCLUDED."cancelledByName",
       "cancelledAt" = EXCLUDED."cancelledAt", "cancelReason" = EXCLUDED."cancelReason",
       "createdAt" = EXCLUDED."createdAt", "updatedAt" = EXCLUDED."updatedAt"`,
    [JSON.stringify(passes)],
  );
}

async function seedTarget(
  pool: Pool,
  actors: Actors,
  now: Date,
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await upsertCommunity(client, actors, now);
    await upsertPasses(client, actors, now);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function main(): Promise<void> {
  if (!process.argv.includes(REQUIRED_OPT_IN)) {
    throw new Error(
      `명시적 확인이 필요합니다: npm run visual:fixtures -- ${REQUIRED_OPT_IN}`,
    );
  }

  const fileEnvironment = loadVisualFileEnvironment();
  const environment = mergedEnvironment(fileEnvironment);
  const databases = resolveVisualDatabaseUrls(environment, fileEnvironment);
  const runtime = resolveVisualRuntime(environment, process.cwd(), {
    requireBuilds: false,
  });
  if (runtime.dryRun)
    throw new Error(
      "fixture 준비는 VISUAL_COMPARE_DRY_RUN에서 실행할 수 없습니다.",
    );

  const emails = {
    teacher: environment.VISUAL_TEACHER_EMAIL || "teacher@demo.invalid",
    student: environment.VISUAL_STUDENT_EMAIL || "demo1-eab980@demo.invalid",
    parent: environment.VISUAL_PARENT_EMAIL || "parent1@demo.invalid",
  };
  const pools = {
    baseline: new Pool({ connectionString: databases.baseline, max: 1 }),
    redesign: new Pool({ connectionString: databases.redesign, max: 1 }),
  };

  try {
    const [baselineActors, redesignActors] = await Promise.all([
      pools.baseline.connect().then(async (client) => {
        try {
          return await loadActors(client, emails);
        } finally {
          client.release();
        }
      }),
      pools.redesign.connect().then(async (client) => {
        try {
          return await loadActors(client, emails);
        } finally {
          client.release();
        }
      }),
    ]);
    assertSameActors(baselineActors, redesignActors);

    const now = new Date();
    await seedTarget(pools.baseline, baselineActors, now);
    await seedTarget(pools.redesign, redesignActors, now);

    const manifest: VisualFixtureManifest = {
      studentProfileId: baselineActors.student.studentProfileId!,
      studentUserId: baselineActors.student.id,
      passId: DETAIL_PASS_ID,
      communityId: COMMUNITY_ID,
      communitySlug: COMMUNITY_SLUG,
      postId: POSTS.teacher,
      editablePostIds: POSTS,
    };
    await mkdir(path.dirname(runtime.fixtureManifestPath), { recursive: true });
    await writeFile(
      runtime.fixtureManifestPath,
      `${JSON.stringify(manifest, null, 2)}\n`,
      "utf8",
    );
    console.log(`visual fixture 준비 완료: ${runtime.fixtureManifestPath}`);
  } finally {
    await Promise.all([pools.baseline.end(), pools.redesign.end()]);
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
