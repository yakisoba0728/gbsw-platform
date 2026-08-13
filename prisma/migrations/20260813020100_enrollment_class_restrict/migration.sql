-- Enrollment.classId의 onDelete를 SetNull에서 Restrict로 바꾼다.
--
-- SetNull이면 SchoolClass 행 하나가 지워질 때 그 반을 거쳐간 "모든 학년도"의
-- Enrollment에서 반 정보가 조용히 사라진다. 설계서의 "기록은 지우지 않는다"와
-- 어긋나고, 같은 모델의 academicYear 관계는 이미 Restrict다 — 반도 맞춘다.
-- 반을 지우려면 먼저 그 반을 참조하는 Enrollment를 정리해야 한다 (조용히 사라지는
-- 대신 명시적으로 막는다).
ALTER TABLE "Enrollment" DROP CONSTRAINT "Enrollment_classId_fkey";
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_classId_fkey"
    FOREIGN KEY ("classId") REFERENCES "SchoolClass" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
