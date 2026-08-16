export type ClassValue = string | false | null | undefined;

/**
 * 조건부 className을 이어붙이는 최소 유틸.
 *
 * **tailwind-merge가 아니다 — 충돌을 해소하지 않는다.** 문자열 순서는 CSS에
 * 아무 영향이 없고, 같은 특정성이면 스타일시트에 **나중에 정의된 쪽**이 이긴다.
 * 그래서 `<Input className="w-20" />`처럼 프리미티브의 기본 클래스와 같은
 * 갈래를 덮으려는 시도는 **조용히 무시된다** — Input의 `w-full`이 생성된 CSS에서
 * `w-20`보다 뒤에 있어서, 둘 다 붙어 있어도 전폭으로 그려진다. 타입 검사도
 * lint도 브라우저 경고도 없다.
 *
 * 폭·여백처럼 프리미티브가 이미 정한 것을 바꿔야 하면 **바깥 요소에 준다**:
 *
 * ```tsx
 * <div className="w-20">
 *   <Input dense />
 * </div>
 * ```
 *
 * tailwind-merge를 들이면 이 제약이 사라지지만, 이 프로젝트는 `@theme`로 만든
 * 이름들(`rounded-btn`·`text-ink`·`bg-pri` …)을 쓴다. tailwind-merge는 자기가
 * 아는 갈래로 클래스를 분류하므로, 그 이름들을 잘못 묶으면 화면 전체에서
 * 조용히 스타일이 사라질 수 있다. 도입한다면 전 화면 대조가 함께 필요하다.
 */
export function cn(...values: ClassValue[]): string {
  return values.filter(Boolean).join(" ");
}
