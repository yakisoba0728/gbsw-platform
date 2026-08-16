-- 상벌점에 "발생일"(occurredOn)을 붙인다. createdAt은 그대로 남는다 —
-- 그쪽은 "언제 입력됐나"라는 감사 사실이고, 이 열은 "언제 일어났나"다.
--
-- 세 단계로 나눈다. 기존 18줄에 값이 없어서 NOT NULL을 한 번에 붙일 수 없다.

-- 1) 우선 비워 둘 수 있게 넣는다.
ALTER TABLE "MeritAward" ADD COLUMN "occurredOn" TIMESTAMP(3);

-- 2) 기존 기록은 입력 시각의 **KST 날짜**로 채운다. 그때 알 수 있는 유일한
--    날짜가 그것이고, 실제로도 대부분은 같은 날 입력된다.
--
--    KST 자정으로 맞추는 것이 핵심이다 (StudentProfile.birthDate와 같은 규약,
--    src/lib/datetime.ts의 parseDateInputKst). UTC 자정으로 잘라 넣으면 화면엔
--    같은 날로 보이지만 저장된 순간이 9시간 어긋나, 앞으로 화면에서 들어올
--    값과 섞이는 순간 비교가 조용히 틀어진다.
--
--    변환 순서: 저장된 UTC 벽시각 → 실제 순간 → KST 벽시각 → 그 날 자정 →
--    다시 UTC 벽시각. 세션 타임존에 기대지 않도록 전부 명시한다.
UPDATE "MeritAward"
SET "occurredOn" =
  (date_trunc('day', "createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Seoul')
    AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'UTC';

-- 3) 이제부터는 필수다. 발생일 없는 상벌점은 만들 수 없다 —
--    비워 둘 수 있게 하면 "안 적은 것"과 "그날 일어난 것"이 구분되지 않는다.
ALTER TABLE "MeritAward" ALTER COLUMN "occurredOn" SET NOT NULL;
