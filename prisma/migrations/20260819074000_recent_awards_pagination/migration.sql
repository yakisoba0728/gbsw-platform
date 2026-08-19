-- 최근 부여 화면의 트랙별 입력 최신순 페이지네이션.
CREATE INDEX "MeritAward_track_createdAt_idx"
ON "MeritAward"("track", "createdAt" DESC);
