-- 전화번호를 필수로 올린다.
--
-- 휴대폰 인증을 붙이기 전에 만들어진 계정은 번호가 비어 있다. NOT NULL을 걸기
-- 전에 자리표시자로 채운다. 실제 번호를 지어낼 수는 없고, 비운 채로는 제약을
-- 걸 수 없기 때문이다. 010-0000-0000은 형식 검사는 통과하지만 실제 번호가 아니라
-- 관리자 화면에 그대로 보이므로, 해당 계정은 사용자 상세에서 고쳐야 한다.
UPDATE "user" SET phone = '010-0000-0000' WHERE phone IS NULL;

-- AlterTable
ALTER TABLE "user" ALTER COLUMN "phone" SET NOT NULL;
