import { cardClass } from "./card";
import Link from "next/link";

/**
 * getCurrentYear()가 NO_CURRENT_YEAR를 던진 화면이 500 대신 보여줄 안내.
 * `title`은 대시보드처럼 이 안내가 여러 카드 중 한 칸을 대신할 때 쓴다.
 */
export function NoAcademicYearNotice({ title }: { title?: string }) {
  return (
    <div className={cardClass("flush", "px-5 py-10 text-center")}>
      {title && (
        <h3 className="mb-1.5 text-lg font-semibold text-ink">{title}</h3>
      )}
      <p className="text-sm text-ink">현재 학년도가 없습니다.</p>
      <p className="mt-1.5 text-caption text-mut">
        <Link
          href="/admin/students"
          className="text-ink underline decoration-line-strong underline-offset-2 hover:decoration-ink"
        >
          학생 관리
        </Link>
        에서 학년도를 먼저 만드세요.
      </p>
    </div>
  );
}
