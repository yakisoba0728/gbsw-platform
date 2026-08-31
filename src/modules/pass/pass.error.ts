/**
 * 출입증 오류. 코드를 message에 담고, 화면 문구는 액션의 MESSAGES 사전이 옮긴다.
 * 서비스가 셋이라 한 곳에 둔다 — 한쪽에 두면 다른 쪽이 그 서비스를 import한다.
 *
 * 이 모듈이 쓰는 코드는 아래가 전부다. 액션의 `MESSAGES`가 이 목록을 덮어야 한다 —
 * 빠지면 「처리하지 못했습니다」로 떨어져 무엇이 잘못됐는지 아무도 모른다.
 *
 * | 코드 | 언제 |
 * |---|---|
 * | `PASS_NOT_FOUND` | 그 id의 출입증이 없다 |
 * | `NO_STUDENT_PROFILE` | 학생 계정이 아니라 신청할 자리가 없다 |
 * | `ALREADY_DECIDED` | 이미 결재·철회된 신청이다 (조건부 갱신이 0건을 냈다) |
 * | `ALREADY_CANCELLED` | 이미 취소된 출입증이다 |
 * | `CONSENT_REQUIRED` | 외박인데 보호자 확인이 아직 없다 |
 * | `CONSENT_NOT_ALLOWED` | 외출에는 보호자 확인이 없다 |
 * | `INVALID_PERIOD` | 끝나는 시각이 시작보다 빠르거나 같다 |
 * | `PERIOD_TOO_LONG` | 외박이 `MAX_OVERNIGHT_DAYS`를 넘는다 |
 * | `START_IN_PAST` | 시작이 이미 지났다 (`START_GRACE_MINUTES` 유예 뒤) |
 * | `OVERLAPPING_PASS` | 같은 기간에 살아 있는 출입증이 이미 있다 |
 * | `PASS_EXPIRED` | 종료 시각에 도달해 더는 동의·승인할 수 없다 |
 * | `STUDENT_NOT_ELIGIBLE` | 직접 부여 대상이 현재 학년도 재학생·활성 계정이 아니다 |
 * | `PASS_BUSY` | 긴 명단 트랜잭션 때문에 직접 부여가 제한 시간 안에 끝나지 않았다 |
 * | `PASS_NOT_ACTIVE` | 지금 QR을 낼 수 있는 상태·기간이 아니다 |
 */
export class PassError extends Error {}
