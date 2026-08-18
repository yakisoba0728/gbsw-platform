-- 묶음(batch) 개념 제거.
--
-- 일괄 부여는 여러 명에게 한 번에 주는 손짓일 뿐, 만들어지는 기록은 서로
-- 독립이다. 묶음으로 함께 취소하는 경로도 함께 사라진다 — 되돌리는 것도 한 건씩이다.
--
-- **되돌릴 수 없다.** 지금까지의 기록이 어느 묶음이었는지는 이 마이그레이션으로
-- 사라진다. 감사로그의 metadata.batchId는 append-only라 그대로 남으므로,
-- 지난 부여가 일괄이었다는 사실 자체는 로그에서 계속 읽힌다.
--
-- SQL을 손으로 적는다. `migrate dev`가 만든 SQL은 부분 유니크 인덱스
-- AcademicYear_single_current를 군더더기로 보고 DROP을 끼워 넣을 수 있다
-- (schema.prisma가 그 인덱스를 표현하지 못한다). 드롭돼도 오류는 안 나고,
-- 현재 학년도가 둘이 되어 전교 집계 범위가 요청마다 흔들린다.
DROP INDEX "MeritAward_batchId_idx";
ALTER TABLE "MeritAward" DROP COLUMN "batchId";
