/**
 * 시연용 데이터 만들기.
 *
 *   npm run seed:demo -- --yes-local-demo-db
 *
 * **화면을 눌러보기 위한 가짜 데이터다.** 초대코드 발급 → 가입 → 학부모 연동 →
 * 상벌점 부여까지 **실제 서비스를 그대로 호출한다** — 권한 검사도 감사로그도
 * 진짜로 돈다. Prisma를 직접 건드리는 곳은 두 군데뿐이고 각각 이유를 적었다.
 *
 * 만드는 계정은 전부 `@demo.invalid`(예약 도메인이라 실제로 메일이 안 간다)이며
 * 이름 앞에 표시가 없다 — 대신 이메일로 한 번에 골라낼 수 있다. 지우려면:
 *
 *   npm run seed:demo -- --clean --yes-local-demo-db
 *
 * 실계정(admin@gbsw.hs.kr, yakihyuk0728@gmail.com)은 건드리지 않는다.
 */
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

/** 시연용 관리자. 관리자 화면(반별 목록·통계·최근 부여)을 눌러보려면 필요하다. */
const DEMO_ADMIN = { name: "시연 교사", email: `teacher@${DEMO_DOMAIN}` };

/** 학부모를 붙일 학생 (이름으로 찾는다). */
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
  return host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]";
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

async function cleanUp(prisma: Awaited<typeof import("../src/core/db/client")>["prisma"]) {
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

  // 부여 → 재적 → 프로필 → (초대) → 계정 순으로 지운다. 외래키가 이 순서를 요구한다.
  await prisma.meritAward.deleteMany({ where: { studentProfileId: { in: profileIds } } });
  await prisma.enrollment.deleteMany({ where: { studentProfileId: { in: profileIds } } });
  await prisma.parentStudent.deleteMany({
    where: { OR: [{ parentUserId: { in: ids } }, { studentId: { in: profileIds } }] },
  });
  await prisma.invite.deleteMany({
    where: { OR: [{ usedById: { in: ids } }, { studentId: { in: profileIds } }] },
  });
  await prisma.studentProfile.deleteMany({ where: { id: { in: profileIds } } });
  // 감사로그의 actorUserId는 SetNull이라 계정을 지워도 기록은 남는다 (설계대로).
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

  // 관리자 행위자. requireAuth()가 만들어 주는 것과 같은 모양이다.
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

  // ── 1. 학생 초대 + 가입 ───────────────────────────────────
  const studentIds = new Map<string, string>(); // 이름 → StudentProfile.id

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

  // ── 1-2. 시연 관리자 ──────────────────────────────────────
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

  // ── 2. 학부모 초대 + 가입 ─────────────────────────────────
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

  // ── 3. 상벌점 부여 ────────────────────────────────────────
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

  // 부여는 발생일을 요구한다. 여기서는 전부 오늘로 넣고, 아래 4단계에서 과거로
  // 흩는다 — 서비스가 "현재 학년도 안, 미래 아님"을 검사하므로 지어낸 날짜를
  // 서비스에 통과시키려면 학년도 시작일을 여기서 다시 계산해야 하고, 그건 검사
  // 규칙을 두 벌로 만드는 일이다.

  // 단건 — 여러 학생에게 서로 다른 항목
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

  // 일괄 — 2학년 3반 전원에게 벌점 (점호 지각 같은 상황)
  const class2_3 = STUDENTS.filter((s) => s.grade === 2 && s.classNo === 3).map(
    (s) => studentIds.get(s.name)!,
  );
  const bulk = await merit.bulkAwardMerit(admin, {
    studentProfileIds: class2_3,
    ruleId: find("dorm", "인원 점검 시 지각"),
    // 날짜를 메모에 적지 않는다 — 발생일 열이 생기기 전에는 그렇게 새어 나갔고,
    // 그래서 월별 추이가 엉뚱한 달을 셌다.
    note: "22시 점호",
  });
  awarded.push({ label: "일괄 부여 (2학년 3반)", count: bulk.count });

  // 벌점을 많이 쌓아 임계 강조가 보이게 한다 (정하윤)
  for (const needle of ["재학 기간 중 문신", "교내·외에서 흡연"]) {
    await merit.awardMerit(admin, {
      studentProfileId: studentIds.get("정하윤")!,
      ruleId: find("school", needle),
      note: null,
    });
  }
  awarded.push({ label: "임계 확인용 벌점 (정하윤)", count: 2 });

  // 상쇄점 — 선도관리위원회 의결
  await merit.awardMerit(admin, {
    studentProfileId: studentIds.get("정하윤")!,
    ruleId: find("school", "선도관리위원회 징계후"),
    note: "선도관리위원회 의결",
  });
  awarded.push({ label: "상쇄점 (정하윤)", count: 1 });

  // 취소 한 건 — 취소 표시와 합계 제외를 눈으로 보기 위해
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

  // ── 4. 날짜 흩뿌리기 ──────────────────────────────────────
  // 여기만 Prisma를 직접 건드린다. 위에서 전부 오늘로 넣었으므로 그대로 두면
  // 월별 추이 그래프가 한 달에 몰린다. 시연용으로 과거 달에 흩어 놓는다 —
  // 실제 운영에서는 하지 않는 일이다.
  //
  // **발생일과 입력일을 조금 어긋나게 만든다.** 세 건 중 두 건은 일어난 뒤
  // 하루·이틀 지나서 입력된 것으로 둔다 — 두 날짜를 나란히 보여주는 화면
  // (내역 표의 "입력 …", 확인서 각주)이 시연 데이터에서 실제로 보여야 한다.
  const all = await prisma.meritAward.findMany({
    where: { studentProfile: { user: { email: { endsWith: `@${DEMO_DOMAIN}` } } } },
    select: { id: true },
    orderBy: { id: "asc" },
  });
  const now = new Date();
  for (const [i, row] of all.entries()) {
    const monthsBack = i % 5; // 0~4개월 전으로 흩는다
    const when = new Date(now);
    when.setMonth(when.getMonth() - monthsBack);
    when.setDate(Math.min(3 + ((i * 7) % 25), 28));
    // 이번 달로 흩어진 건이 오늘을 넘지 않게 한다 — 미래에 일어난 기록은
    // 화면에서 바로 눈에 띄고, 있을 수 없는 상태다.
    const occurred = when > now ? now : when;

    const entered = new Date(occurred);
    entered.setDate(entered.getDate() + (i % 3)); // 0·1·2일 뒤에 입력

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

/** 이메일·휴대폰 인증을 목업 코드로 통과시킨다. */
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
