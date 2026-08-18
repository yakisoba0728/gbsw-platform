import { kstHour } from "./datetime";

/**
 * 시간대 인사. 경계는 KST 기준이다 (`kstHour`).
 *
 * 새벽과 밤을 한 문구로 묶지 않는다 — 이 시스템은 사감이 점호를 넣는 시간에도
 * 돌아가고, 새벽 3시에 "좋은 아침입니다"가 뜨면 시스템이 시각을 모른다는 뜻이 된다.
 */
export function greetingFor(now: Date): string {
  const hour = kstHour(now);
  if (hour < 6) return "이른 시간입니다";
  if (hour < 12) return "좋은 아침입니다";
  if (hour < 18) return "좋은 오후입니다";
  if (hour < 22) return "좋은 저녁입니다";
  return "늦은 시간입니다";
}
