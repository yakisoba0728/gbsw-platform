-- 계정 상세의 관련 감사로그 조회가 actorUserId OR targetId로 훑는다.
-- targetId 쪽에 인덱스가 없어 OR의 둘째 갈래가 안 좁혀졌다.
CREATE INDEX "AuditLog_targetId_idx" ON "AuditLog"("targetId");
