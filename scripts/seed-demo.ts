import { pathToFileURL } from "node:url";

const DEMO_DOMAIN = "demo.invalid";
const DEMO_PASSWORD = "demo-password-1234";
const REQUIRED_OPT_IN = "--yes-local-demo-db";

type StudentSpec = {
  name: string;
  birthDate: string;
  grade: number;
  classNo: number;
  number: number;
};

const STUDENTS: StudentSpec[] = [
  { name: "김민준", birthDate: "2009-03-02", grade: 2, classNo: 3, number: 1 },
  { name: "정하윤", birthDate: "2009-05-14", grade: 2, classNo: 3, number: 2 },
  { name: "오세훈", birthDate: "2009-01-27", grade: 2, classNo: 3, number: 3 },
  { name: "서아름", birthDate: "2009-08-09", grade: 2, classNo: 3, number: 4 },
  { name: "한지우", birthDate: "2009-11-30", grade: 2, classNo: 3, number: 5 },
  { name: "박도현", birthDate: "2010-02-18", grade: 1, classNo: 1, number: 1 },
  { name: "이서연", birthDate: "2010-06-05", grade: 1, classNo: 1, number: 2 },
  { name: "최유진", birthDate: "2010-09-21", grade: 1, classNo: 1, number: 3 },
];

const DEMO_ADMIN = { name: "시연 교사", email: `teacher@${DEMO_DOMAIN}` };

const PARENTS = [
  { childName: "김민준", parentName: "김성호" },
  { childName: "정하윤", parentName: "정미경" },
];

function databaseHost(databaseUrl: string): string {
  try {
    return new URL(databaseUrl).hostname;
  } catch {
    return "";
  }
}

function isLocalDatabaseUrl(databaseUrl: string): boolean {
  const host = databaseHost(databaseUrl);
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
}

export function assertDemoSeedAllowed({
  argv,
  env,
}: {
  argv: readonly string[];
  env: {
    DATABASE_URL?: string;
    NODE_ENV?: string;
    VERCEL?: string;
    RAILWAY_ENVIRONMENT?: string;
  };
}): void {
  if (!argv.includes(REQUIRED_OPT_IN)) {
    throw new Error(
      `시연 데이터 seed는 명시적 확인이 필요합니다: npm run seed:demo -- ${REQUIRED_OPT_IN}`,
    );
  }

  if (env.NODE_ENV === "production" || env.VERCEL || env.RAILWAY_ENVIRONMENT) {
    throw new Error("운영 환경에서는 시연 데이터 seed를 실행할 수 없습니다.");
  }

  if (!env.DATABASE_URL || !isLocalDatabaseUrl(env.DATABASE_URL)) {
    throw new Error("시연 데이터 seed는 localhost/127.0.0.1 DB에서만 실행할 수 있습니다.");
  }
}

function slug(name: string, index: number): string {
  return `demo${index + 1}-${Buffer.from(name).toString("hex").slice(0, 6)}`;
}

async function main() {
  process.loadEnvFile(".env");
  assertDemoSeedAllowed({ argv: process.argv, env: process.env });

  const { prisma } = await import("../src/core/db/client");
  const clean = process.argv.includes("--clean");

  try {
    if (clean) return await cleanUp(prisma);
    await build(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

export async function cleanUp(
  prisma: Awaited<typeof import("../src/core/db/client")>["prisma"],
) {
  const users = await prisma.user.findMany({
    where: { email: { endsWith: `@${DEMO_DOMAIN}` } },
    select: { id: true, email: true },
  });
  if (users.length === 0) {
    console.log("지울 시연 계정이 없습니다.");
    return;
  }

  const ids = users.map((u) => u.id);
  const profiles = await prisma.studentProfile.findMany({
    where: { userId: { in: ids } },
    select: { id: true },
  });
  const profileIds = profiles.map((p) => p.id);

  await prisma.meritAward.deleteMany({ where: { studentProfileId: { in: profileIds } } });
  await prisma.enrollment.deleteMany({ where: { studentProfileId: { in: profileIds } } });
  await prisma.parentStudent.deleteMany({
    where: { OR: [{ parentUserId: { in: ids } }, { studentId: { in: profileIds } }] },
  });
  await prisma.invite.deleteMany({
    where: {
      OR: [
        { createdById: { in: ids } },
        { usedById: { in: ids } },
        { studentId: { in: profileIds } },
      ],
    },
  });
  await prisma.studentProfile.deleteMany({ where: { id: { in: profileIds } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });

  console.log(`시연 계정 ${users.length}개와 딸린 데이터를 지웠습니다.`);
  console.log("감사로그는 남습니다 — 행위자 이름 스냅샷으로 누가 했는지 보존됩니다.");
}

async function build(prisma: Awaited<typeof import("../src/core/db/client")>["prisma"]) {
  const [invites, registration, verification, merit, ruleService, datetime] =
    await Promise.all([
      import("../src/modules/invites/invite.service"),
      import("../src/modules/registration/registration.service"),
      import("../src/modules/verification/verification.service"),
      import("../src/modules/merit/award.service"),
      import("../src/modules/merit/rule.service"),
      import("../src/lib/datetime"),
    ]);

  if (!verification.isMockVerification()) {
    throw new Error(
      ".env의 VERIFICATION_MOCK이 켜져 있어야 합니다 (인증코드를 받아올 수 없습니다).",
    );
  }

  const existing = await prisma.user.count({
    where: { email: { endsWith: `@${DEMO_DOMAIN}` } },
  });
  if (existing > 0) {
    console.log(
      `이미 시연 계정 ${existing}개가 있습니다. 다시 만들려면 먼저 지우세요:\n` +
        `  npm run seed:demo -- --clean ${REQUIRED_OPT_IN}`,
    );
    return;
  }

  const adminRow = await prisma.user.findFirst({
    where: { role: "ADMIN", deletedAt: null },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, email: true, status: true },
  });
  if (!adminRow) throw new Error("관리자 계정이 없습니다. 먼저 최초 관리자를 만드세요.");

  const admin = {
    id: adminRow.id,
    name: adminRow.name,
    email: adminRow.email,
    role: "ADMIN" as const,
    status: adminRow.status,
    deletedAt: null,
    mustChangePassword: false,
  };
  console.log(`행위자: ${admin.name} (${admin.email})\n`);

  const studentIds = new Map<string, string>();

  for (const [i, spec] of STUDENTS.entries()) {
    const invite = await invites.createStudentInvite(admin, {
      ...spec,
      expiresInDays: 30,
    });

    const email = `${slug(spec.name, i)}@${DEMO_DOMAIN}`;
    const phone = `010-0000-${String(1000 + i).slice(-4)}`;

    await verify(verification, invite.code, email, phone);
    await registration.completeRegistration({
      code: invite.code,
      name: spec.name,
      email,
      phone,
      password: DEMO_PASSWORD,
      confirmPassword: DEMO_PASSWORD,
      birthDate: spec.birthDate,
    });

    const profile = await prisma.studentProfile.findFirst({
      where: { user: { email } },
      select: { id: true },
    });
    studentIds.set(spec.name, profile!.id);
    console.log(
      `학생 가입: ${spec.name} (${spec.grade}학년 ${spec.classNo}반 ${spec.number}번)`,
    );
  }

  {
    const invite = await invites.createAdminInvite(admin, {
      name: DEMO_ADMIN.name,
      expiresInDays: 30,
    });
    const phone = "010-0000-3000";
    await verify(verification, invite.code, DEMO_ADMIN.email, phone);
    await registration.completeRegistration({
      code: invite.code,
      name: DEMO_ADMIN.name,
      email: DEMO_ADMIN.email,
      phone,
      password: DEMO_PASSWORD,
      confirmPassword: DEMO_PASSWORD,
    });
    console.log(`관리자 가입: ${DEMO_ADMIN.name}`);
  }

  for (const [i, link] of PARENTS.entries()) {
    const studentId = studentIds.get(link.childName)!;
    const invite = await invites.createParentInviteFor(admin, {
      studentId,
      name: link.parentName,
      expiresInDays: 30,
    });

    const email = `parent${i + 1}@${DEMO_DOMAIN}`;
    const phone = `010-0000-${String(2000 + i).slice(-4)}`;

    await verify(verification, invite.code, email, phone);
    await registration.completeRegistration({
      code: invite.code,
      name: link.parentName,
      email,
      phone,
      password: DEMO_PASSWORD,
      confirmPassword: DEMO_PASSWORD,
    });
    console.log(`학부모 가입: ${link.parentName} → ${link.childName}`);
  }

  console.log("");
  const rules = {
    school: await ruleService.listActiveRules(admin, "SCHOOL"),
    dorm: await ruleService.listActiveRules(admin, "DORM"),
  };
  const find = (track: "school" | "dorm", needle: string) => {
    const rule = rules[track].find((r) => r.label.includes(needle));
    if (!rule) throw new Error(`규정을 못 찾았습니다: ${needle}`);
    return rule.id;
  };

  const awarded: { label: string; count: number }[] = [];

  const singles: [name: string, track: "school" | "dorm", needle: string, note: string | null][] =
    [
      ["김민준", "school", "프로그램 개발을 통한", null],
      ["김민준", "school", "봉사활동으로 교내 청소", "학급 대청소"],
      ["정하윤", "school", "복장 규정을 위반한 학생(넥타이", null],
      ["정하윤", "school", "조례시간", null],
      ["오세훈", "dorm", "점호 이후 기숙사 내를", null],
      ["서아름", "school", "학교 홍보", null],
      ["한지우", "dorm", "깨끗한 호실", null],
      ["박도현", "school", "수업 시간에 바른 태도", null],
      ["이서연", "school", "전자기기", null],
    ];

  for (const [name, track, needle, note] of singles) {
    await merit.awardMerit(admin, {
      studentProfileId: studentIds.get(name)!,
      ruleId: find(track, needle),
      note,
    });
  }
  awarded.push({ label: "단건 부여", count: singles.length });

  const class2_3 = STUDENTS.filter((s) => s.grade === 2 && s.classNo === 3).map(
    (s) => studentIds.get(s.name)!,
  );
  const bulk = await merit.bulkAwardMerit(admin, {
    studentProfileIds: class2_3,
    ruleId: find("dorm", "인원 점검 시 지각"),
    note: "22시 점호",
  });
  awarded.push({ label: "일괄 부여 (2학년 3반)", count: bulk.count });

  for (const needle of ["재학 기간 중 문신", "교내·외에서 흡연"]) {
    await merit.awardMerit(admin, {
      studentProfileId: studentIds.get("정하윤")!,
      ruleId: find("school", needle),
      note: null,
    });
  }
  awarded.push({ label: "임계 확인용 벌점 (정하윤)", count: 2 });

  await merit.awardMerit(admin, {
    studentProfileId: studentIds.get("정하윤")!,
    ruleId: find("school", "선도관리위원회 징계후"),
    note: "선도관리위원회 의결",
  });
  awarded.push({ label: "상쇄점 (정하윤)", count: 1 });

  const toCancel = await prisma.meritAward.findFirst({
    where: { studentProfileId: studentIds.get("서아름")!, status: "ACTIVE" },
    select: { id: true },
  });
  if (toCancel) {
    await merit.cancelAward(admin, {
      awardId: toCancel.id,
      reason: "중복 입력으로 취소",
    });
    awarded.push({ label: "취소", count: 1 });
  }

  const all = await prisma.meritAward.findMany({
    where: { studentProfile: { user: { email: { endsWith: `@${DEMO_DOMAIN}` } } } },
    select: { id: true },
    orderBy: { id: "asc" },
  });
  const now = new Date();
  for (const [i, row] of all.entries()) {
    const monthsBack = i % 5;
    const when = new Date(now);
    when.setMonth(when.getMonth() - monthsBack);
    when.setDate(Math.min(3 + ((i * 7) % 25), 28));
    const occurred = when > now ? now : when;

    const entered = new Date(occurred);
    entered.setDate(entered.getDate() + (i % 3));

    await prisma.meritAward.update({
      where: { id: row.id },
      data: {
        occurredOn: datetime.parseDateInputKst(datetime.formatDateInput(occurred)),
        createdAt: entered > now ? now : entered,
      },
    });
  }

  console.log("상벌점:");
  for (const item of awarded) console.log(`  ${item.label} ${item.count}건`);
  console.log(`  총 ${all.length}건 (최근 5개월에 흩어 놓음)`);

  console.log("\n─────────────────────────────────────────");
  console.log(`시연 계정 비밀번호: ${DEMO_PASSWORD}`);
  console.log(`관리자: ${DEMO_ADMIN.email}`);
  console.log("학생 예: " + `${slug(STUDENTS[0].name, 0)}@${DEMO_DOMAIN}`);
  console.log("학부모 예: " + `parent1@${DEMO_DOMAIN}`);
  console.log(`지우기: npm run seed:demo -- --clean ${REQUIRED_OPT_IN}`);
}

async function verify(
  verification: typeof import("../src/modules/verification/verification.service"),
  code: string,
  email: string,
  phone: string,
) {
  for (const [channel, target] of [
    ["EMAIL", email],
    ["PHONE", phone],
  ] as const) {
    const { mockCode } = await verification.requestCode(channel, target);
    if (!mockCode) throw new Error("목업 인증코드를 못 받았습니다.");
    await verification.confirmCode(channel, target, mockCode);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
