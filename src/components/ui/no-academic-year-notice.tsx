import { cardClass } from "./card";
import Link from "next/link";

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
