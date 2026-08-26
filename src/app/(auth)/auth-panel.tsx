import Image from "next/image";

/**
 * 로그인·가입이 공유하는 카드.
 * 시안대로 왼쪽 사진 패널은 그대로 두고 오른쪽 폼만 갈아끼운다.
 */
export function AuthPanel({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-[radial-gradient(130%_90%_at_50%_0%,var(--color-pri-soft)_0%,var(--color-bg)_52%)] p-4 md:p-8">
      {/*
        높이를 고정한다. 단계가 바뀌며 필드 수가 달라져도 카드가 늘었다 줄었다 하면 안 된다.
        내용이 넘치면 카드가 커지는 대신 폼 쪽만 스크롤된다.
      */}
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
          {/*
            아래쪽 띠. 위 그라데이션은 150deg라 가장 옅은 구간(45%)이 하필 글자가
            앉는 왼쪽 아래에 온다 — 사진의 그 자리가 밝은 건물이라 흰 글자 대비가
            2.2:1까지 떨어졌다(기준은 4.5:1, 큰 글자 3:1). 대각선 인상은 그대로
            두고 글자가 앉는 높이만 덮는다. 마스크 안이라 오른쪽 폼 쪽으로는
            번지지 않는다.
          */}
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
          <p className="text-[12.5px] leading-relaxed text-white/90 [text-shadow:0_1px_10px_rgba(0,0,0,0.35)]">
            공지 · 상벌점 · 외출/외박을 한 곳에서
          </p>
        </div>

        {/*
          items-center 대신 자식의 m-auto로 가운데 정렬한다.
          align-items:center은 내용이 넘칠 때 위쪽이 잘려서 스크롤해도 못 보게 된다.
        */}
        <div className="relative z-10 flex w-full justify-center overflow-y-auto p-8 md:ml-auto md:w-1/2 md:px-11 md:py-10">
          <div className="m-auto w-full max-w-[332px]">
            {/* 모바일에서는 사진 패널이 없으니 로고를 폼 위에 둔다. */}
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
