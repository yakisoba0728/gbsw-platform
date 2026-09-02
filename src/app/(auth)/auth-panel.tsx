import Image from "next/image";

export function AuthPanel({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-[radial-gradient(130%_90%_at_50%_0%,var(--color-pri-soft)_0%,var(--color-bg)_52%)] p-4 md:p-8">
      <div className="relative flex w-full max-w-[940px] overflow-hidden rounded-3xl bg-surface shadow-[0_30px_70px_rgba(12,42,34,0.16),0_6px_18px_rgba(20,24,33,0.06)] md:h-[580px]">
        <div
          className="absolute inset-0 hidden bg-[#0c2a22] md:block"
          style={{
            maskImage:
              "linear-gradient(to right, #000 0%, #000 20%, transparent 58%)",
            WebkitMaskImage:
              "linear-gradient(to right, #000 0%, #000 20%, transparent 58%)",
          }}
          aria-hidden
        >
          <Image
            src="/brand/school.png"
            alt=""
            fill
            priority
            sizes="(min-width: 768px) 940px, 0px"
            className="object-cover"
          />
          <div className="absolute inset-0 bg-[linear-gradient(150deg,rgba(0,55,44,0.38)_0%,rgba(0,40,32,0.12)_45%,rgba(8,22,18,0.66)_100%)]" />
          <div className="absolute inset-0 bg-[linear-gradient(to_top,rgba(4,18,14,0.90)_0%,rgba(4,18,14,0.78)_18%,rgba(4,18,14,0.52)_30%,rgba(4,18,14,0.18)_42%,transparent_56%)]" />
        </div>

        <div className="absolute bottom-0 left-0 z-10 hidden w-[46%] p-8 text-white md:block">
          <div className="mb-4 flex items-center gap-2.5">
            <span className="flex size-[42px] items-center justify-center rounded-xl bg-white shadow-[0_6px_18px_rgba(0,0,0,0.25)]">
              <Image src="/brand/gbsw-logo.webp" alt="" width={31} height={31} />
            </span>
            <span>
              <span className="block text-sm font-extrabold">GBSW</span>
              <span className="block text-[11px] opacity-90">통합관리시스템</span>
            </span>
          </div>
          <h2 className="mb-2 text-2xl leading-[1.28] font-extrabold tracking-[-0.02em] [text-shadow:0_2px_14px_rgba(0,0,0,0.35)]">
            경북소프트웨어
            <br />
            마이스터고등학교
          </h2>
        </div>

        <div className="relative z-10 flex w-full justify-center overflow-y-auto p-8 md:ml-auto md:w-1/2 md:px-11 md:py-10">
          <div className="m-auto w-full max-w-[332px]">
            <div className="mb-7 flex items-center gap-2.5 md:hidden">
              <Image src="/brand/gbsw-logo.webp" alt="" width={36} height={36} />
              <span>
                <span className="block text-sm font-extrabold text-ink">GBSW</span>
                <span className="block text-[11px] text-mut">통합관리시스템</span>
              </span>
            </div>

            {children}
          </div>
        </div>
      </div>
    </main>
  );
}
