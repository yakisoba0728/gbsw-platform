// 카드가 실제로 소비하는 최소 계약이다. Prisma include 모양이 바뀌어도 UI 경계는
// 이 타입에 필요한 필드만 유지하면 된다.
export type PassCardView = {
  id: string;
  type: string;
  status: string;
  startAt: Date;
  endAt: Date;
  destination: string;
  reason: string;
  decisionNote: string | null;
  consentByProxy: boolean;
  consentedByName: string | null;
  studentProfile: { user: { name: string } };
};
