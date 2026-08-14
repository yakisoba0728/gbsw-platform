import Link from "next/link";

/**
 * getCurrentYear()가 AcademicYearError(NO_CURRENT_YEAR)를 던졌을 때 관리자
 * 화면이 공통으로 보여줄 안내 (M7).
 *
 * 전에는 /admin/students만 이 오류를 잡아 화면을 살렸고 /admin/invites·
 * /admin/users는 500으로 떨어졌다 — 셋 다 같은 화면(500 대신 안내 + 다음 행동)을
 * 보여주도록 통일한다. 학년도를 만들 수 있는 유일한 화면(/admin/students)으로
 * 안내한다.
 */
export function NoAcademicYearNotice() {
  return (
    <div className="rounded-card border border-line bg-surface p-8 text-center">
      <p className="text-sm font-semibold text-ink">
        현재 학년도가 설정되어 있지 않습니다.
      </p>
      <p className="mt-1.5 text-[12.5px] text-mut">
        <Link
          href="/admin/students"
          className="font-semibold text-pri hover:underline"
        >
          학생 관리
        </Link>
        에서 학년도를 먼저 만들어 주세요.
      </p>
    </div>
  );
}
