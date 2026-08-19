import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * GET으로 보내는 검색 폼. 검색 결과가 주소에 남아 새로고침·뒤로가기·링크 공유가
 * 그대로 동작한다. 상태가 URL에만 있어 클라이언트 코드가 필요 없다.
 */
export function SearchForm({
  name = "q",
  defaultValue,
  placeholder,
  ariaLabel,
  maxLength,
  hidden,
  submitLabel = "검색",
  className = "flex gap-2",
}: {
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
        maxLength={maxLength}
        className="min-w-0 flex-1"
      />
      <Button type="submit" variant="secondary" className="shrink-0">
        {submitLabel}
      </Button>
    </form>
  );
}
