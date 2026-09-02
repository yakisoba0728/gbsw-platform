import Link from "next/link";
import { buttonClass } from "@/components/ui/button";

export default function AppNotFound() {
  return (
    <div className="mx-auto max-w-[420px] py-10">
      <p className="font-mono text-caption text-mut">404</p>
      <h2 className="mt-2 text-title font-semibold text-ink">
        찾을 수 없습니다
      </h2>
      <p className="mt-2 text-caption text-mut">
        주소가 바뀌었거나 삭제된 항목입니다.
      </p>

      <Link href="/" className={buttonClass({ variant: "secondary", className: "mt-8" })}>
        대시보드
      </Link>
    </div>
  );
}
