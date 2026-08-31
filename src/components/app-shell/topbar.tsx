"use client";

import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import { TruncatedText } from "@/components/ui/truncated-text";
import type { Role } from "@/core/authz/roles";
import { honorificName, honorificSuffix } from "@/core/authz/roles";
import { formatClock } from "@/lib/datetime";
import { MobileNav } from "./mobile-nav";
import { SignOutButton } from "./sign-out-button";
import { titleForPath } from "./nav";

/** 시계가 자리를 잡아 두는 글자. `formatClock`이 내는 것과 폭이 같아야 한다. */
const CLOCK_PLACEHOLDER = "오후 00:00:00";

/**
 * 흐르는 시각은 React 바깥의 것이다 — 브라우저 시계가 스스로 가고 화면은 구독만
 * 한다. 그래서 `useEffect` + `setState`가 아니라 `useSyncExternalStore`다
 * (React 컴파일러 린트도 효과 안의 동기 `setState`를 이 훅으로 가라고 잡는다).
 *
 * 스냅숏은 **에포크 초**다. `Date` 객체를 그대로 두면 매번 다른 참조라 React가
 * 「바뀌었다」로 보고 무한히 다시 그린다. 초 단위 정수는 같은 초 안에서 같은 값이다.
 */
let clockTick: number | null = null;

function subscribeToClock(onStoreChange: () => void): () => void {
  const read = () => {
    const next = Math.floor(Date.now() / 1000);
    if (next === clockTick) return;
    clockTick = next;
    onStoreChange();
  };

  read();
  /**
   * 250ms마다 들여다보고 **초가 실제로 넘어간 순간에만** 알린다. 1000ms 간격은
   * 시계의 초 경계와 어긋난 채로 흐르고 그 어긋남이 쌓여서, 화면이 한 초를
   * 건너뛰거나 같은 초를 두 번 보여준다 — 초를 세라고 띄운 시계가 초를 흘린다.
   */
  const id = setInterval(read, 250);
  return () => clearInterval(id);
}

function getClockTick(): number | null {
  return clockTick;
}

/**
 * 서버에는 시계를 두지 않는다. 서버가 그린 초와 클라이언트가 넘겨받는 초는 같을
 * 수 없어 하이드레이션이 어긋나고, React 19는 그것을 콘솔 오류로 낸다. `null`을
 * 주면 서버 HTML과 하이드레이션 첫 렌더가 둘 다 자리표시자라 어긋날 것이 없다.
 */
function getServerClockTick(): number | null {
  return null;
}

/**
 * 한국 시간 시계. 초까지 적고 1초마다 다시 그린다.
 *
 * **Topbar가 아니라 이 컴포넌트가 구독한다.** 같은 파일에 있어도 상관없다 —
 * 훅이 Topbar에 있으면 초마다 제목·이름·로그아웃 단추까지 전부 다시 그려지고,
 * 여기 있으면 이 `<time>` 하나만 다시 그려진다.
 *
 * **첫 렌더에는 시각 대신 같은 폭의 글자를 `invisible`로 세운다.** 자리를 미리
 * 잡아야 시각이 나타나는 순간 옆 것이 밀리지 않고, `visibility: hidden`이라
 * 낭독기도 읽지 않는다.
 *
 * **낭독기에 매초 읽히지 않는다.** `aria-live`를 걸지 않으면 글자가 바뀌어도
 * 낭독기는 알리지 않는다 — 초마다 읽어 주면 다른 것을 들을 수 없다. 대신
 * 「현재 시각」을 `sr-only`로 붙여, 찾아서 읽었을 때 이 숫자가 무엇인지 알게 한다.
 *
 * **시각만 적고 날짜는 적지 않는다.** 이 줄이 답하는 것은 「지금 몇 시인가」뿐이고,
 * 날짜는 목록과 상세가 저마다 이미 적는다. 상단바에 날짜까지 늘리면 그만큼
 * 제목이 잘린다.
 *
 * **폰에서는 숨긴다(`lg` 미만).** 390px 폭에는 메뉴 단추·제목·이름·로그아웃이
 * 이미 차 있고, 폰은 상태 표시줄이 늘 시각을 보여준다. 시계가 필요한 쪽은
 * 하루 종일 창을 띄워 두는 데스크톱이다. CSS로만 숨기므로 폰에서도 마운트돼
 * 초마다 돈다 — `<time>` 하나 다시 그리는 값이고, `matchMedia`로 가르면
 * 하이드레이션이 다시 어긋난다.
 *
 * **데스크톱 상단바에서 시각은 이제 오른쪽의 유일한 것이다.** 계정이 사이드바
 * 바닥으로 내려가면서 이 줄은 「어디인가 · 몇 시인가」 둘만 답한다.
 */
function Clock() {
  const tick = useSyncExternalStore(
    subscribeToClock,
    getClockTick,
    getServerClockTick,
  );
  const now = tick === null ? null : new Date(tick * 1000);

  return (
    <time
      // 구독 전에는 값이 없다 — 속성 자체가 붙지 않는다.
      dateTime={now?.toISOString()}
      className="hidden shrink-0 text-caption tabular-nums text-mut lg:block"
    >
      {now ? (
        <>
          <span className="sr-only">현재 시각 </span>
          {formatClock(now)}
        </>
      ) : (
        <span className="invisible">{CLOCK_PLACEHOLDER}</span>
      )}
    </time>
  );
}

export function Topbar({ name, role }: { name: string; role: Role | null }) {
  const pathname = usePathname();
  const title = titleForPath(pathname);

  return (
    // print:hidden — 확인서 화면이 자기 <h1>을 그린다. 빼지 않으면 제목이 둘 찍힌다.
    <header className="workspace-topbar sticky top-0 z-30 flex h-16 flex-none items-center justify-between gap-3 border-b border-line px-4 sm:px-5 lg:h-[4.5rem] lg:px-8 xl:px-10 print:hidden">
      <div className="flex min-w-0 items-center gap-2.5">
        {/* 390px 폭에 로고와 메뉴 버튼을 둘 다 두면 제목이 잘린다. */}
        <MobileNav role={role} />
        {/* 이 줄은 내비게이션의 현재 위치다. 업무 화면의 유일한 h1은 PageScaffold가
            맡는다. `min-w-0`이 있어야 긴 위치 이름이 오른쪽 계정·시계를 화면 밖으로
            밀지 않고 TruncatedText 안에서 줄어든다. */}
        <div className="min-w-0" aria-label={`현재 위치: ${title}`}>
          <span className="hidden text-[11px] font-medium tracking-[0.14em] text-mut2 uppercase lg:block">
            Workspace
          </span>
          <p className="min-w-0 text-base font-semibold tracking-tight text-ink lg:text-lg">
            <TruncatedText full={title}>{title}</TruncatedText>
          </p>
        </div>
      </div>

      {/*
       * 오른쪽은 폭에 따라 답하는 것이 다르다.
       *
       * **데스크톱** — 시각만 적는다. 「지금 누구인가」는 사이드바 바닥이 늘
       * 답하고 있으므로 여기서 되풀이하면 같은 이름이 한 화면에 둘이 된다.
       * 시각이 여기 남는 이유는 출입증이다: 외출 마감과 복귀 시각을 눈으로
       * 대조하는 화면이 여럿이고, 그때 필요한 것은 「지금 몇 시인가」다.
       *
       * **폰** — 사이드바가 없다. 계정과 나가기를 이 줄이 대신 진다.
       */}
      <div className="flex min-w-0 items-center">
        <span className="hidden items-center rounded-full border border-line bg-surface px-3 py-1.5 shadow-sm lg:flex">
          <Clock />
        </span>

        <TruncatedText
          full={honorificName(name, role)}
          className="text-caption lg:hidden"
        >
          <span className="font-medium text-ink">{name}</span>
          <span className="text-mut">{honorificSuffix(role)}</span>
        </TruncatedText>

        <span className="mx-2 h-4 w-px shrink-0 bg-line lg:hidden" aria-hidden />

        <SignOutButton className="shrink-0 lg:hidden" />
      </div>
    </header>
  );
}
