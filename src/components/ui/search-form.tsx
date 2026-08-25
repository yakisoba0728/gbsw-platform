import Form from "next/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * GET으로 보내는 검색 폼. 검색 결과가 주소에 남아 새로고침·뒤로가기·링크 공유가
 * 그대로 동작한다. 상태가 URL에만 있어 클라이언트 코드가 필요 없다.
 *
 * `next/form`을 쓴다. 맨 `<form method="get">`은 브라우저가 문서를 통째로 다시
 * 받아 화면이 하얗게 깜빡이고, 그 사이 Next의 `loading.tsx`(스켈레톤)는 아예 뜨지
 * 않는다 — 클라이언트 라우팅을 거치지 않기 때문이다. 이쪽은 폼이 보이는 순간
 * 대상 경로의 로딩 UI를 미리 받아 두고 제출 때 클라이언트 이동을 한다.
 * JS가 없으면 평범한 GET 폼으로 그대로 동작한다.
 */
export function SearchForm({
  action,
  name = "q",
  defaultValue,
  placeholder,
  ariaLabel,
  maxLength,
  hidden,
  submitLabel = "검색",
  className = "flex gap-2",
}: {
  /** 검색 결과를 그릴 경로. `next/form`은 문자열 action일 때만 클라이언트 이동을 한다. */
  action: string;
  name?: string;
  defaultValue?: string;
  placeholder?: string;
  /** placeholder는 라벨이 아니다. 글자를 넣는 순간 사라진다. 그래서 필수다. */
  ariaLabel: string;
  maxLength?: number;
  /**
   * 함께 실어 보낼 쿼리. GET 폼은 주소를 통째로 갈아치우므로 지금 보고 있는
   * 트랙·종류를 넣지 않으면 검색과 동시에 필터가 풀린다.
   */
  hidden?: Record<string, string | null | undefined>;
  submitLabel?: string;
  className?: string;
}) {
  return (
    <Form action={action} className={className}>
      {Object.entries(hidden ?? {}).map(([key, value]) =>
        value == null ? null : (
          <input key={key} type="hidden" name={key} value={value} />
        ),
      )}

      {/* 옆의 검색 버튼과 같은 md다. 표 안의 즉석 필터와 달리 이 칸은 화면의
          주된 조회 수단이라, 데스크톱에서 32px로 줄이면 버튼만 커 보인다. */}
      <Input
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        aria-label={ariaLabel}
        maxLength={maxLength}
        className="min-w-0 flex-1"
      />
      <Button type="submit" variant="secondary" className="shrink-0">
        {submitLabel}
      </Button>
    </Form>
  );
}
