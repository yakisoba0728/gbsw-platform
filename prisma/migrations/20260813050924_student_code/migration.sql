-- 학생 식별자를 도입한다.
--
-- 명단에서 학생을 알아보는 기준을 이름+생년월일에서 이 값으로 옮긴다.
-- 기존 학생에게도 같은 규칙으로 값을 만들어 넣어야 제약을 걸 수 있다.
-- 알파벳은 src/lib/student-code.ts와 같아야 한다 (0·1·I·O·L 제외, 첫 글자는 문자).

ALTER TABLE "StudentProfile" ADD COLUMN "studentCode" TEXT;

DO $$
DECLARE
  letters TEXT := 'ABCDEFGHJKMNPQRSTUVWXYZ';
  alphabet TEXT := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  r RECORD;
  candidate TEXT;
BEGIN
  FOR r IN SELECT id FROM "StudentProfile" WHERE "studentCode" IS NULL LOOP
    LOOP
      candidate := substr(letters, floor(random() * length(letters))::int + 1, 1);
      FOR i IN 2..8 LOOP
        candidate := candidate || substr(alphabet, floor(random() * length(alphabet))::int + 1, 1);
      END LOOP;
      EXIT WHEN NOT EXISTS (SELECT 1 FROM "StudentProfile" WHERE "studentCode" = candidate);
    END LOOP;
    UPDATE "StudentProfile" SET "studentCode" = candidate WHERE id = r.id;
  END LOOP;
END $$;

ALTER TABLE "StudentProfile" ALTER COLUMN "studentCode" SET NOT NULL;
CREATE UNIQUE INDEX "StudentProfile_studentCode_key" ON "StudentProfile"("studentCode");
