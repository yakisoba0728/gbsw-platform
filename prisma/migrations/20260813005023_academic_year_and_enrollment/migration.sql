-- 학년도와 학년도별 소속을 도입한다.
--
-- 지금 SchoolClass는 (학년, 반)이 유일키라 "1학년 3반"이 해마다 같은 행을 재사용하고,
-- 학생 소속은 StudentProfile에 현재 값 하나만 남는다. 학생의 영구 ID에 학년도별
-- Enrollment를 쌓는 구조로 옮긴다.
--
-- 기존 소속은 버리지 않고 현재 학년도(2026) 배정으로 옮긴다.

-- 1. 학년도
CREATE TABLE "AcademicYear" (
    "year" INTEGER NOT NULL,
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AcademicYear_pkey" PRIMARY KEY ("year")
);

INSERT INTO "AcademicYear" ("year", "isCurrent") VALUES (2026, true);

-- 현재 학년도는 항상 하나뿐이다. 부분 유니크 인덱스로 DB가 직접 막는다.
CREATE UNIQUE INDEX "AcademicYear_single_current"
    ON "AcademicYear" ("isCurrent") WHERE "isCurrent";

-- 2. SchoolClass에 학년도를 붙인다
ALTER TABLE "SchoolClass" ADD COLUMN "year" INTEGER;
UPDATE "SchoolClass" SET "year" = 2026 WHERE "year" IS NULL;
ALTER TABLE "SchoolClass" ALTER COLUMN "year" SET NOT NULL;

DROP INDEX "SchoolClass_grade_classNo_key";
CREATE UNIQUE INDEX "SchoolClass_year_grade_classNo_key"
    ON "SchoolClass" ("year", "grade", "classNo");
CREATE INDEX "SchoolClass_year_idx" ON "SchoolClass" ("year");

ALTER TABLE "SchoolClass" ADD CONSTRAINT "SchoolClass_year_fkey"
    FOREIGN KEY ("year") REFERENCES "AcademicYear" ("year")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- 3. Enrollment
CREATE TABLE "Enrollment" (
    "id" TEXT NOT NULL,
    "studentProfileId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "classId" TEXT,
    "number" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'ENROLLED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Enrollment_pkey" PRIMARY KEY ("id")
);

-- 기존 소속을 2026학년도 배정으로 옮긴다. 반이 없던 학생도 재학으로 남긴다.
INSERT INTO "Enrollment" ("id", "studentProfileId", "year", "classId", "number", "status", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, sp."id", 2026, sp."classId", sp."number", 'ENROLLED', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "StudentProfile" sp;

CREATE UNIQUE INDEX "Enrollment_studentProfileId_year_key"
    ON "Enrollment" ("studentProfileId", "year");
CREATE UNIQUE INDEX "Enrollment_classId_number_key"
    ON "Enrollment" ("classId", "number");
CREATE INDEX "Enrollment_year_idx" ON "Enrollment" ("year");
CREATE INDEX "Enrollment_studentProfileId_idx" ON "Enrollment" ("studentProfileId");

ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_studentProfileId_fkey"
    FOREIGN KEY ("studentProfileId") REFERENCES "StudentProfile" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_year_fkey"
    FOREIGN KEY ("year") REFERENCES "AcademicYear" ("year")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_classId_fkey"
    FOREIGN KEY ("classId") REFERENCES "SchoolClass" ("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- 4. StudentProfile에서 소속을 걷어낸다 (Enrollment로 옮겼다)
DROP INDEX "StudentProfile_classId_idx";
ALTER TABLE "StudentProfile" DROP CONSTRAINT "StudentProfile_classId_fkey";
ALTER TABLE "StudentProfile" DROP COLUMN "classId";
ALTER TABLE "StudentProfile" DROP COLUMN "number";
