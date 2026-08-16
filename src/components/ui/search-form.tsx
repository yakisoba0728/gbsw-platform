import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * GET으로 보내는 검색 폼. 서버 컴포넌트다 — 상태가 URL에만 있으므로
 * 클라이언트 코드가 필요 없다.
 *
 * GET인 이유: 검색 결과가 주소에 남아 새로고침·뒤로가기·링크 공유가 그대로
 * 동작한다. 두 화면(/merit의 학생 검색, /admin/merit/rules의 규정 검색)이 이미
 * 그렇게 하고 있었고, 손으로 쓴 `<input>`+`<button>`이 구조까지 똑같았다.
 *
 * **`ariaLabel`은 필수 prop이다.** 두 화면 다 라벨이 없어서 화면을 못 보는
 * 사람에게는 "편집 상자"로만 읽혔다. placeholder는 라벨이 아니다 — 글자를 넣는
 * 순간 사라지고, 애초에 접근성 이름으로 안 쳐 주는 AT가 있다. 선택 인자로 두면
 * 다음 화면에서 또 빠지므로 안 넣으면 타입 검사에서 걸리게 한다.
 */
export function SearchForm({
  name = "q",
  defaultValue,
  placeholder,
  ariaLabel,
  hidden,
  submitLabel = "검색",
  className = "flex gap-2",
}: {
  name?: string;
  defaultValue?: string;
  placeholder?: string;
  /** 검색칸의 접근성 이름. 예: "학생 이름 또는 학생코드 검색" */
  ariaLabel: string;
  /**
   * 함께 실어 보낼 쿼리 — GET 폼은 제출하면 주소를 통째로 갈아치우므로,
   * 지금 보고 있는 트랙·종류를 여기 넣지 않으면 검색과 동시에 필터가 풀린다.
   * `undefined`·`null`인 값은 넣지 않는다(고르지 않은 필터).
   */
  hidden?: Record<string, string | null | undefined>;
  submitLabel?: string;
  className?: string;
}) {
  return (
    <form method="get" className={className}>
      {Object.entries(hidden ?? {}).map(([key, value]) =>
        value == null ? null : (
          <input key={key} type="hidden" name={key} value={value} />
        ),
      )}

      <Input
        dense
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className="min-w-0 flex-1"
      />
      <Button type="submit" className="shrink-0">
        {submitLabel}
      </Button>
    </form>
  );
}
