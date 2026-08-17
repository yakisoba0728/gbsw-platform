import Image from "next/image";

/** 로그인·가입이 공유하는 껍데기. 흰 바탕에 좁은 한 단만 둔다. */
export function AuthPanel({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-bg px-6 py-16">
      <div className="w-full max-w-[360px]">
        <div className="mb-12 flex items-center gap-2.5">
          <Image src="/brand/gbsw-logo.webp" alt="" width={32} height={32} />
          <span>
            <span className="block text-sm font-semibold tracking-tight text-ink">
              GBSW
            </span>
            <span className="block text-xs text-mut">통합관리시스템</span>
          </span>
        </div>

        {children}
      </div>
    </main>
  );
}
