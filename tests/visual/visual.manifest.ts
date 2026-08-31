export const VISUAL_TARGETS = ["baseline", "redesign"] as const;
export type VisualTarget = (typeof VISUAL_TARGETS)[number];

export const VISUAL_ROLES = ["teacher", "admin", "student", "parent"] as const;
export type VisualRole = (typeof VISUAL_ROLES)[number];

export const VISUAL_VIEWPORTS = {
  desktop: { width: 1440, height: 1000 },
  mobile: { width: 390, height: 844 },
} as const;
export type VisualViewport = keyof typeof VISUAL_VIEWPORTS;

const TARGET_HOST_SEGMENT: Record<VisualTarget, string> = {
  baseline: "main",
  redesign: "redesign",
};

export type VisualPorts = Readonly<Record<VisualTarget, number>>;

/**
 * 역할과 버전을 hostname에 함께 둔다. 쿠키는 포트를 구분하지 않으므로
 * teacher.localhost:3200/3201만 쓰면 한 BrowserContext 안에서 서로 덮어쓴다.
 */
export function visualHost(target: VisualTarget, role: VisualRole): string {
  return `${role}.${TARGET_HOST_SEGMENT[target]}.localhost`;
}

export function visualOrigin(
  target: VisualTarget,
  role: VisualRole,
  ports: VisualPorts,
): string {
  return `http://${visualHost(target, role)}:${ports[target]}`;
}

export type VisualFixtureManifest = Readonly<{
  studentProfileId: string;
  studentUserId: string;
  passId: string;
  communityId: string;
  communitySlug: string;
  postId: string;
  editablePostIds: Readonly<Record<"teacher" | "student" | "parent", string>>;
}>;

export type VisualRoute = Readonly<{
  id: string;
  label: string;
  role: VisualRole;
  path: string;
  session?: "authenticated" | "anonymous";
  readySelector?: string;
  maskSelectors?: readonly string[];
  expectedVisibleHeadings?: number | Readonly<Partial<Record<VisualTarget, number>>>;
}>;

export type VisualRedirectContract = Readonly<{
  id: string;
  label: string;
  role: VisualRole;
  from: string;
  to: string;
  permanent: boolean;
}>;

function route(
  role: VisualRole,
  id: string,
  label: string,
  path: string,
  options: Pick<
    VisualRoute,
    "session" | "readySelector" | "maskSelectors" | "expectedVisibleHeadings"
  > = {},
): VisualRoute {
  return { id, label, role, path, ...options };
}

function segment(value: string, name: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "." || trimmed === ".." || trimmed.includes("/")) {
    throw new Error(`visual fixture ${name}이 안전한 URL segment가 아닙니다.`);
  }
  return encodeURIComponent(trimmed);
}

/**
 * 한 목록이 인증 setup, 두 버전 URL, 두 viewport와 HTML 목차를 모두 구동한다.
 * legacy redirect는 화면이 아니라 별도 계약이므로 canonical route만 둔다.
 */
export function buildVisualRoutes(fixtures: VisualFixtureManifest): readonly VisualRoute[] {
  const studentId = segment(fixtures.studentProfileId, "studentProfileId");
  const studentUserId = segment(fixtures.studentUserId, "studentUserId");
  const passId = segment(fixtures.passId, "passId");
  const communityId = segment(fixtures.communityId, "communityId");
  const communitySlug = segment(fixtures.communitySlug, "communitySlug");
  const postId = segment(fixtures.postId, "postId");
  const teacherPostId = segment(fixtures.editablePostIds.teacher, "editablePostIds.teacher");
  const studentPostId = segment(fixtures.editablePostIds.student, "editablePostIds.student");
  const parentPostId = segment(fixtures.editablePostIds.parent, "editablePostIds.parent");

  return [
    // 앱 셸 밖의 canonical 화면도 목록에 남긴다. login/register/forbidden만
    // 무세션 context를 쓰고, change-password는 로그인 유지 상태를 그대로 검증한다.
    route("teacher", "login", "로그인", "/login", { session: "anonymous" }),
    route("teacher", "register", "가입", "/register", { session: "anonymous" }),
    route("teacher", "forbidden", "접근 권한 없음", "/forbidden", {
      session: "anonymous",
    }),
    route(
      "teacher",
      "change-password",
      "비밀번호 변경 · 일반 로그인 상태",
      "/change-password",
    ),

    // 교사 공통 업무 화면. 시스템 관리 화면은 같은 ADMIN 권한의 admin host로 나눈다.
    route("teacher", "dashboard", "대시보드", "/"),
    route("teacher", "merit-award", "상벌점 부여", "/merit"),
    route("teacher", "merit-recent", "최근 부여", "/merit/recent"),
    route("teacher", "merit-stats-overview", "상벌점 통계 · 개요", "/merit/stats?view=overview"),
    route("teacher", "merit-stats-ranking", "상벌점 통계 · 순위", "/merit/stats?view=ranking"),
    route("teacher", "merit-stats-teachers", "상벌점 통계 · 교사별", "/merit/stats?view=teachers"),
    route("teacher", "merit-stats-rules", "상벌점 통계 · 규정별", "/merit/stats?view=rules"),
    route("teacher", "merit-rules-read", "상벌점 규정 · 읽기", "/merit/rules"),
    route("teacher", "pass", "출입증 결재", "/pass"),
    route("teacher", "pass-history", "출입증 전체 내역", "/pass/history"),
    route("teacher", "pass-detail", "출입증 상세", `/pass/${passId}`),
    route("teacher", "scan", "학생증 확인", "/scan", {
      readySelector: "main",
    }),
    route("teacher", "community", "커뮤니티", "/community"),
    route("teacher", "community-board", "게시판", `/community/${communitySlug}`),
    route("teacher", "community-post", "게시글", `/community/${communitySlug}/${postId}`),
    route("teacher", "community-new", "새 게시글", `/community/${communitySlug}/new`),
    route(
      "teacher",
      "community-edit",
      "게시글 수정",
      `/community/${communitySlug}/${teacherPostId}/edit`,
    ),
    route("teacher", "student-merit", "학생 상세 · 상벌점", `/students/${studentId}?tab=merit`),
    route("teacher", "student-pass", "학생 상세 · 출입증", `/students/${studentId}?tab=pass`),
    route("teacher", "student-profile", "학생 상세 · 기본 정보", `/students/${studentId}?tab=profile`),
    route("teacher", "student-print", "학생 상벌점 확인서", `/students/${studentId}/print?track=SCHOOL`, {
      maskSelectors: ["text=출력 시각"],
      expectedVisibleHeadings: { baseline: 2, redesign: 1 },
    }),

    // 코드상 teacher와 같은 ADMIN이지만 비교 목차와 쿠키 경계를 관리 업무로 분리한다.
    route("admin", "users-accounts", "계정 관리 · 계정", "/admin/users?tab=accounts"),
    route("admin", "users-invites", "계정 관리 · 초대", "/admin/users?tab=invites"),
    route("admin", "users-students", "계정 관리 · 학생", "/admin/users?tab=students"),
    route("admin", "user-detail", "계정 상세", `/admin/users/${studentUserId}`),
    route("admin", "students-import", "학생 명단 가져오기", "/admin/students/import"),
    route("admin", "logs", "감사로그", "/admin/logs"),
    route("admin", "settings", "설정", "/admin/settings"),
    route("admin", "merit-rules-manage", "상벌점 규정 관리", "/admin/merit/rules"),
    route("admin", "community-manage", "커뮤니티 관리", "/admin/community"),
    route("admin", "community-detail", "커뮤니티 설정", `/admin/community/${communityId}`),

    route("student", "dashboard", "학생 대시보드", "/"),
    route("student", "merit", "내 상벌점", "/merit"),
    route("student", "merit-rules", "상벌점 규정", "/merit/rules"),
    route("student", "pass", "내 출입증", "/pass"),
    route("student", "pass-new", "출입증 신청", "/pass/new"),
    route("student", "pass-detail", "출입증 상세", `/pass/${passId}`),
    route("student", "pass-qr", "학생증 QR", "/pass/qr", {
      maskSelectors: ['[aria-label="학생증 QR 코드"]'],
    }),
    route("student", "parent-invite", "학부모 초대", "/parent-invite"),
    route("student", "community", "학생 커뮤니티", "/community"),
    route("student", "community-board", "학생 게시판", `/community/${communitySlug}`),
    route("student", "community-post", "학생 게시글", `/community/${communitySlug}/${postId}`),
    route("student", "community-new", "학생 새 게시글", `/community/${communitySlug}/new`),
    route(
      "student",
      "community-edit",
      "학생 게시글 수정",
      `/community/${communitySlug}/${studentPostId}/edit`,
    ),
    route("parent", "dashboard", "학부모 대시보드", "/"),
    route("parent", "merit", "자녀 상벌점", "/merit"),
    route("parent", "merit-rules", "상벌점 규정", "/merit/rules"),
    route("parent", "pass", "자녀 출입증", "/pass"),
    route("parent", "pass-detail", "자녀 출입증 상세", `/pass/${passId}`),
    route("parent", "community", "학부모 커뮤니티", "/community"),
    route("parent", "community-board", "학부모 게시판", `/community/${communitySlug}`),
    route("parent", "community-post", "학부모 게시글", `/community/${communitySlug}/${postId}`),
    route("parent", "community-new", "학부모 새 게시글", `/community/${communitySlug}/new`),
    route(
      "parent",
      "community-edit",
      "학부모 게시글 수정",
      `/community/${communitySlug}/${parentPostId}/edit`,
    ),
  ];
}

export function buildVisualRedirectContracts(
  fixtures: VisualFixtureManifest,
): readonly VisualRedirectContract[] {
  const studentId = segment(fixtures.studentProfileId, "studentProfileId");
  return [
    {
      id: "admin-invites",
      label: "이전 초대 관리 주소",
      role: "admin",
      from: "/admin/invites",
      to: "/admin/users?tab=invites",
      permanent: false,
    },
    {
      id: "admin-students",
      label: "이전 학생 관리 주소",
      role: "admin",
      from: "/admin/students",
      to: "/admin/users?tab=students",
      permanent: false,
    },
    {
      id: "merit-ranking",
      label: "이전 상벌점 순위 주소",
      role: "teacher",
      from: "/merit/stats/ranking?track=SCHOOL",
      to: "/merit/stats?track=SCHOOL&view=ranking",
      permanent: false,
    },
    {
      id: "merit-teachers",
      label: "이전 교사별 통계 주소",
      role: "teacher",
      from: "/merit/stats/teachers?track=SCHOOL",
      to: "/merit/stats?track=SCHOOL&view=teachers",
      permanent: false,
    },
    {
      id: "merit-rules",
      label: "이전 규정별 통계 주소",
      role: "teacher",
      from: "/merit/stats/rules?track=SCHOOL",
      to: "/merit/stats?track=SCHOOL&view=rules",
      permanent: false,
    },
    {
      id: "merit-student",
      label: "이전 학생 상벌점 주소",
      role: "teacher",
      from: `/merit/students/${studentId}?track=SCHOOL`,
      to: `/students/${studentId}?track=SCHOOL&tab=merit`,
      permanent: true,
    },
    {
      id: "merit-student-print",
      label: "이전 학생 확인서 주소",
      role: "teacher",
      from: `/merit/students/${studentId}/print?track=SCHOOL`,
      to: `/students/${studentId}/print?track=SCHOOL`,
      permanent: true,
    },
  ];
}

export function assertUniqueVisualRoutes(routes: readonly VisualRoute[]): void {
  const seen = new Set<string>();
  for (const item of routes) {
    const key = `${item.role}:${item.id}`;
    if (seen.has(key)) throw new Error(`visual route key가 중복됩니다: ${key}`);
    seen.add(key);
  }
}
