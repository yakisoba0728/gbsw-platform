import Link from "next/link";

/**
 * getCurrentYear()가 AcademicYearError(NO_CURRENT_YEAR)를 던졌을 때 화면이
 * 공통으로 보여줄 안내 (M7).
 *
 * 전에는 /admin/students만 이 오류를 잡아 화면을 살렸고 /admin/invites·
 * /admin/users는 500으로 떨어졌다 — 셋 다 같은 화면(500 대신 안내 + 다음 행동)을
 * 보여주도록 통일한다. 학년도를 만들 수 있는 유일한 화면(/admin/students)으로
 * 안내한다.
 *
 * `title`은 대시보드용이다. 거기서는 이 안내가 화면 전체가 아니라 **여러 카드 중
 * 한 칸**을 대신하므로, 무엇에 대한 안내인지("상벌점")를 적어 주지 않으면 옆
 * 카드들 사이에서 맥락을 잃는다. 그 화면이 같은 문구를 자기 안에 따로 만들어
 * 두고 있었는데(NoYearCard), 모양까지 갈라져서 같은 사정이 화면마다 다르게
 * 보였다 — 통일하려고 만든 컴포넌트가 정작 통일을 못 시키고 있었다.
 */
export function NoAcademicYearNotice({ title }: { title?: string }) {
  return (
    <div className="rounded-card border border-line bg-surface p-8 text-center">
      {title && (
        <h3 className="mb-1.5 text-base font-extrabold text-ink">{title}</h3>
      )}
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
