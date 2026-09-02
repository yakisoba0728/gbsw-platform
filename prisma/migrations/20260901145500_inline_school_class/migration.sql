-- 독립 생명주기가 없는 반 행을 Enrollment의 학년·반 스냅샷으로 내린다.
-- 첫 ALTER가 잡은 ACCESS EXCLUSIVE 잠금을 끝까지 유지하고, 마지막 유니크 인덱스
-- 생성까지 하나라도 실패하면 백필과 DROP을 모두 되돌린다.
BEGIN;

ALTER TABLE "Enrollment"
ADD COLUMN "grade" INTEGER,
ADD COLUMN "classNo" INTEGER;

UPDATE "Enrollment" AS enrollment
SET
  "grade" = school_class."grade",
  "classNo" = school_class."classNo"
FROM "SchoolClass" AS school_class
WHERE school_class."id" = enrollment."classId";

-- FK가 지키던 기존 데이터의 백필이 하나라도 빠지면 테이블을 지우지 않는다.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "Enrollment"
    WHERE "classId" IS NOT NULL
      AND ("grade" IS NULL OR "classNo" IS NULL)
  ) THEN
    RAISE EXCEPTION 'SchoolClass backfill left an Enrollment seat incomplete';
  END IF;
END $$;

ALTER TABLE "Enrollment" DROP CONSTRAINT "Enrollment_classId_fkey";
DROP INDEX "Enrollment_classId_number_key";
ALTER TABLE "Enrollment" DROP COLUMN "classId";
DROP TABLE "SchoolClass";

CREATE UNIQUE INDEX "Enrollment_year_grade_classNo_number_key"
ON "Enrollment"("year", "grade", "classNo", "number");

COMMIT;
