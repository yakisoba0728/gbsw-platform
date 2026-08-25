import Link from "next/link";
import { buttonClass } from "@/components/ui/button";

/**
 * `notFound()`가 떨어지는 자리. `(app)/layout.tsx` 안쪽이라 앱 셸이 그대로 남는다 —
 * 이 파일이 없으면 Next의 영문 기본 404가 셸 없이 대신 나온다. 같은 경계의
 * error.tsx와 짝을 이루므로 구성도 같다.
 */
export default function AppNotFound() {
  return (
    <div className="mx-auto max-w-[420px] py-10">
      <p className="font-mono text-caption text-mut">404</p>
      <h2 className="mt-2 text-title font-semibold text-ink">
        찾을 수 없습니다
      </h2>
      {/* 없는 것인지 볼 수 없는 것인지 가리지 않는다 — 있다는 사실 자체가 정보다. */}
      <p className="mt-2 text-caption text-mut">
        주소가 바뀌었거나 삭제된 항목입니다.
      </p>

      <Link href="/" className={buttonClass({ variant: "secondary", className: "mt-8" })}>
        대시보드
      </Link>
    </div>
  );
}
