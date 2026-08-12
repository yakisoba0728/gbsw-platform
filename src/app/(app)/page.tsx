import { ROLE_LABELS } from "@/core/authz/roles";
import { requireAuth } from "@/core/auth/session";

export default async function DashboardPage() {
  const user = await requireAuth();

  return (
    <div className="mx-auto max-w-5xl">
      <section className="rounded-card border border-line bg-surface p-6 lg:p-8">
        <p className="text-[13px] font-semibold text-pri">
          {user.role ? ROLE_LABELS[user.role] : "역할 미지정"}
        </p>
        <h2 className="mt-1 text-xl font-extrabold tracking-[-0.01em] text-ink lg:text-2xl">
          {user.name}님, 안녕하세요.
        </h2>
        <p className="mt-2 text-sm text-mut">
          아직 연결된 업무 모듈이 없습니다. 상벌점 모듈이 첫 번째로 붙습니다.
        </p>
      </section>
    </div>
  );
}
