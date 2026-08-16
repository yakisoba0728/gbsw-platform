import type { MeritKind, MeritTrack } from "@/core/authz/merit-track";

/**
 * 경북소프트웨어마이스터고 상벌점 규정 원본.
 *
 * **학교가 준 표를 그대로 옮긴 것이다.** 문구를 다듬거나 오탈자를 고치지 않는다 —
 * 학생에게 적용되는 공식 규정이므로 시스템이 임의로 바꾸면 근거가 어긋난다.
 * (예: 기숙사 벌점의 "리숙사"는 원본 그대로다.)
 *
 * 점수는 항상 양수로 적고 부호는 kind가 정한다 (MeritRule.points 규약).
 * 원본의 벌점은 −표기지만 여기서는 절댓값이다.
 *
 * **범위 점수(2~5점 등)는 최솟값이 아니라 1점으로 넣고 범위를 설명에 적는다.**
 * 부여 화면이 점수를 고르게 만들면 규정 카탈로그가 "정해진 점수"라는 성질을
 * 잃는다. 대신 여러 번 부여해 조절한다 — 그래야 각 건이 감사로그에 따로 남는다.
 */
export type SeedRule = {
  track: MeritTrack;
  kind: MeritKind;
  category: string;
  label: string;
  points: number;
  description: string | null;
};

/** 범위 점수 항목의 설명을 만든다. 부여자가 화면에서 바로 알아볼 수 있어야 한다. */
function range(min: number, max: number, note?: string): string {
  const base = `${min}~${max}점 범위 — 1점씩 여러 번 부여해 조절한다`;
  return note ? `${base}. ${note}` : base;
}

/** 교내 상벌점(그린마일리지). 매 학년도 합계가 새로 시작한다. */
export const SCHOOL_RULES: SeedRule[] = [
  // ── 상점 ────────────────────────────────────────────────────
  { track: "SCHOOL", kind: "MERIT", category: "교내 환경", points: 2, description: null,
    label: "봉사활동으로 교내 청소를 열심히 한 학생" },
  { track: "SCHOOL", kind: "MERIT", category: "교내 환경", points: 2, description: null,
    label: "솔선수범하여 학급 청소를 하거나, 학급 비품 관리, 쓰레기 분리수거 등을 잘한 학생" },
  { track: "SCHOOL", kind: "MERIT", category: "교내 환경", points: 2, description: null,
    label: "솔선수범하여 바닥에 떨어진 쓰레기를 자주 줍는 학생" },

  { track: "SCHOOL", kind: "MERIT", category: "명예 표창", points: 5, description: null,
    label: "학교 홍보에 열심히 참여한 학생" },
  { track: "SCHOOL", kind: "MERIT", category: "명예 표창", points: 10, description: null,
    label: "프로그램 개발을 통한 학교 발전 및 학생 생활에 도움을 준 학생" },

  { track: "SCHOOL", kind: "MERIT", category: "선행 질서", points: 2, description: null,
    label: "분실된 교구, 분실물을 습득 및 신고를 하여 타의 모범이 된 학생" },
  { track: "SCHOOL", kind: "MERIT", category: "선행 질서", points: 2, description: null,
    label: "벌점 규정 항목 대상 학생을 신고한 학생" },
  { track: "SCHOOL", kind: "MERIT", category: "선행 질서", points: 5, description: null,
    label: "어려운 상황에 처한 친구를 제보하여 위험을 모면하게 도와준 학생" },
  { track: "SCHOOL", kind: "MERIT", category: "선행 질서", points: 10, description: null,
    label: "선행, 효행, 단체 활동, 불우이웃돕기, 일손 돕기 등의 봉사활동을 하여 공인된 외부기관에서 모범 표창을 받은 경우" },
  { track: "SCHOOL", kind: "MERIT", category: "선행 질서", points: 3, description: null,
    label: "타인을 위해 희생, 봉사적 활동을 한 학생" },

  { track: "SCHOOL", kind: "MERIT", category: "수업 관련", points: 2, description: null,
    label: "학습활동과 기본생활 영역에서 모범이 되는 행동을 하여 추천을 받은 학생" },
  { track: "SCHOOL", kind: "MERIT", category: "수업 관련", points: 2, description: null,
    label: "수업 시간에 바른 태도로 타의 모범이 된 학생" },
  { track: "SCHOOL", kind: "MERIT", category: "수업 관련", points: 2, description: null,
    label: "수업에서 교재, 교구, 기자재 관리 및 안전 관리에 모범적인 행동을 한 학생" },
  { track: "SCHOOL", kind: "MERIT", category: "수업 관련", points: 2, description: null,
    label: "학습 준비물을 철저히 준비하여 수업 보조 도구로 활용되도록 한 학생" },

  { track: "SCHOOL", kind: "MERIT", category: "학교 활동", points: 1, description: null,
    label: "교사의 교육활동에 도움을 주는 학생" },
  { track: "SCHOOL", kind: "MERIT", category: "학교 활동", points: 2, description: null,
    label: "행사도우미, 학교행사 활동 등 교사의 교육활동에 적극적으로 도움을 주는 학생" },
  { track: "SCHOOL", kind: "MERIT", category: "학교 활동", points: 3, description: null,
    label: "특별실 관리 또는 학교, 학급 활동에 모범이 되어 담당 교사의 추천을 받은 학생" },
  { track: "SCHOOL", kind: "MERIT", category: "학교 활동", points: 10, description: null,
    label: "학교 행사 후 청소 및 정리정돈에 솔선수범하여 참여한 학생" },

  // ── 상쇄점 ──────────────────────────────────────────────────
  // 원본 표에서 "상쇄점"으로 분류된 유일한 항목이다. 상점이 아니다 —
  // 잘한 일에 주는 점수가 아니라 위원회가 의결로 벌점을 덜어내는 행정 조치다.
  // 상점에 섞으면 상점 총합이 부풀어 표창 기준이 흔들린다.
  { track: "SCHOOL", kind: "OFFSET", category: "선도관리 위원회", points: 60,
    description: "선도관리위원회 의결로만 부여한다. 순점수에서 벌점을 덜어낸다.",
    label: "선도관리위원회 징계후 벌점 상쇄" },

  // ── 벌점: 교내 생활 ─────────────────────────────────────────
  { track: "SCHOOL", kind: "DEMERIT", category: "교내 생활", points: 1, description: null,
    label: "가벼운 교육적 지시 사항을 어긴 학생" },
  { track: "SCHOOL", kind: "DEMERIT", category: "교내 생활", points: 10, description: null,
    label: "교사의 교육적인 지시 내용을 지속적으로 불이행한 학생" },
  { track: "SCHOOL", kind: "DEMERIT", category: "교내 생활", points: 2, description: null,
    label: "소란행위를 한 학생 (고성, 괴성, 음악 크게 틀기, 복도에서 달리기 등)" },
  { track: "SCHOOL", kind: "DEMERIT", category: "교내 생활", points: 2, description: null,
    label: "쓰레기(음식물 포함)등을 교내 아무 곳에나 버리는 학생" },
  { track: "SCHOOL", kind: "DEMERIT", category: "교내 생활", points: 2, description: null,
    label: "교내에서 껌이나 침을 아무데나 뱉거나 버리는 학생" },
  { track: "SCHOOL", kind: "DEMERIT", category: "교내 생활", points: 2, description: null,
    label: "급식실에서 질서를 지키지 않고 새치기를 하는 학생" },
  { track: "SCHOOL", kind: "DEMERIT", category: "교내 생활", points: 2, description: null,
    label: "책·걸상, 학교 벽 등 학교 시설에 낙서를 한 학생" },
  { track: "SCHOOL", kind: "DEMERIT", category: "교내 생활", points: 2, description: null,
    label: "청소 활동에 이유 없이 불참한 학생" },
  { track: "SCHOOL", kind: "DEMERIT", category: "교내 생활", points: 2, description: null,
    label: "상습적으로 욕설 및 폭언, 음담패설 등을 하여 주변에 피해를 주는 학생" },
  { track: "SCHOOL", kind: "DEMERIT", category: "교내 생활", points: 5, description: null,
    label: "교내,외에서 이성 간 풍기 문란한 행동을 한 학생" },
  { track: "SCHOOL", kind: "DEMERIT", category: "교내 생활", points: 10, description: null,
    label: "고데기 등 화재 위험성이 있는 전열기 소지 및 사용한 학생" },
  { track: "SCHOOL", kind: "DEMERIT", category: "교내 생활", points: 20, description: null,
    label: "불법사이트(토토 등), 화투, 카드 등을 이용하여 도박을 한 학생" },
  { track: "SCHOOL", kind: "DEMERIT", category: "교내 생활", points: 10, description: null,
    label: "원동기나 차량을 운전해서 등·하교한 학생" },
  { track: "SCHOOL", kind: "DEMERIT", category: "교내 생활", points: 20, description: null,
    label: "교내 외 시설물, 차량 또는 물품을 고의로 파손한 학생" },
  { track: "SCHOOL", kind: "DEMERIT", category: "교내 생활", points: 3, description: null,
    label: "본인의 교실 외 타학년 및 타교실에 들어간 학생" },
  { track: "SCHOOL", kind: "DEMERIT", category: "교내 생활", points: 3, description: null,
    label: "급식실 외 공간(교실, 실습실, 복도)에서 간식 먹는 학생" },
  { track: "SCHOOL", kind: "DEMERIT", category: "교내 생활", points: 3, description: null,
    label: "체육관 음식물 반입 금지를 어긴 학생" },
  { track: "SCHOOL", kind: "DEMERIT", category: "교내 생활", points: 3, description: null,
    label: "교실 내 개인 물품이나 택배 상자 등을 방치하여 다른 학생에게 피해를 주는 학생" },
  { track: "SCHOOL", kind: "DEMERIT", category: "교내 생활", points: 2, description: null,
    label: "허락없이 교내 엘리베이터를 탑승하다 적발된 학생" },
  { track: "SCHOOL", kind: "DEMERIT", category: "교내 생활", points: 3, description: null,
    label: "학생증을 분실한 학생" },

  // ── 벌점: 교외 생활 ─────────────────────────────────────────
  { track: "SCHOOL", kind: "DEMERIT", category: "교외 생활", points: 20, description: null,
    label: "출입이 금지된 구역(유흥업소 등)에 출입을 한 학생" },
  { track: "SCHOOL", kind: "DEMERIT", category: "교외 생활", points: 10, description: null,
    label: "지역 주민, 경찰서 등으로부터 신고를 받은 학생" },
  { track: "SCHOOL", kind: "DEMERIT", category: "교외 생활", points: 20, description: null,
    label: "무면허 운전(자동차, 원동기 등)신고접수 및 적발된 학생" },
  { track: "SCHOOL", kind: "DEMERIT", category: "교외 생활", points: 20, description: null,
    label: "불미스러운 행동으로 학교의 명예를 훼손한 학생" },

  // ── 벌점: 스쿨 캠핑장 ───────────────────────────────────────
  { track: "SCHOOL", kind: "DEMERIT", category: "스쿨 캠핑장", points: 3, description: null,
    label: "스쿨 캠핑장 이용 시 기구 및 장소 청소 등 정리 정돈을 제대로 하지 않은 학생" },
  { track: "SCHOOL", kind: "DEMERIT", category: "스쿨 캠핑장", points: 5, description: null,
    label: "스쿨 캠핑장 물품을 파손한 학생" },
  { track: "SCHOOL", kind: "DEMERIT", category: "스쿨 캠핑장", points: 5, description: null,
    label: "스쿨 캠핑장 이용 신청 외 학생이 이용할 경우" },

  // ── 벌점: 야간 자습 시간 ────────────────────────────────────
  { track: "SCHOOL", kind: "DEMERIT", category: "야간 자습 시간", points: 5, description: null,
    label: "야간 자습 시간에 핸드폰, 노트북 등을 사용하여 게임을 하는 학생" },
  { track: "SCHOOL", kind: "DEMERIT", category: "야간 자습 시간", points: 5, description: null,
    label: "야간 자습 시간에 학습 활동 외 활동(음악 크게 틀어서 듣기, 영상보며 떠들기, 잡담, 욕설 등)으로 주변 사람에게 피해를 주는 학생" },
  { track: "SCHOOL", kind: "DEMERIT", category: "야간 자습 시간", points: 3, description: null,
    label: "야간 자습 시간에 허락 없이 돌아다니는 학생" },
  { track: "SCHOOL", kind: "DEMERIT", category: "야간 자습 시간", points: 3, description: null,
    label: "야간 자습 시간에 지정된 공부 장소 외 공간에 허락 없이 있는 학생" },
  { track: "SCHOOL", kind: "DEMERIT", category: "야간 자습 시간", points: 2, description: null,
    label: "야간 자습 시간에 음식물을 취식하는 학생" },
  { track: "SCHOOL", kind: "DEMERIT", category: "야간 자습 시간", points: 2, description: null,
    label: "야간 자습 시간 시작 후(19:10) 늦게 교실에 입실하는 학생" },
  { track: "SCHOOL", kind: "DEMERIT", category: "야간 자습 시간", points: 2, description: null,
    label: "야간 자습 시간에 허락 없이 자리를 바꿔 앉는 학생" },

  // ── 벌점: 용의복장 ──────────────────────────────────────────
  { track: "SCHOOL", kind: "DEMERIT", category: "용의복장", points: 1, description: null,
    label: "복장 규정을 위반한 학생(넥타이 미착용)" },
  { track: "SCHOOL", kind: "DEMERIT", category: "용의복장", points: 2, description: null,
    label: "액세서리(귀걸이)를 착용한 학생 (투명, 단순 귀걸이 허용)" },
  { track: "SCHOOL", kind: "DEMERIT", category: "용의복장", points: 5, description: null,
    label: "용의 규정을 위반한 학생(염색)" },
  { track: "SCHOOL", kind: "DEMERIT", category: "용의복장", points: 5, description: null,
    label: "문신을 가리지 않은 학생" },
  { track: "SCHOOL", kind: "DEMERIT", category: "용의복장", points: 30, description: null,
    label: "재학 기간 중 문신을 한 학생" },
  { track: "SCHOOL", kind: "DEMERIT", category: "용의복장", points: 2, description: null,
    label: "복장 규정을 위반한 학생(셔츠, 바지 미착용)" },

  // ── 벌점: 출결 수업 ─────────────────────────────────────────
  { track: "SCHOOL", kind: "DEMERIT", category: "출결 수업", points: 3, description: null,
    label: "정규/방과 후 수업 중 태도 불량 학생(수면)" },
  { track: "SCHOOL", kind: "DEMERIT", category: "출결 수업", points: 5, description: null,
    label: "정규/방과 후 수업 중 태도 불량 학생(교과서, 준비물 미지참, 과제 불이행)" },
  { track: "SCHOOL", kind: "DEMERIT", category: "출결 수업", points: 5, description: null,
    label: "정규/방과 후 수업 중 태도 불량 학생(잡담, 욕설, 수업 방해)" },
  { track: "SCHOOL", kind: "DEMERIT", category: "출결 수업", points: 4, description: null,
    label: "정규/방과 후 수업 시간 중 음식물을 취식한 학생" },
  { track: "SCHOOL", kind: "DEMERIT", category: "출결 수업", points: 5, description: null,
    label: "정규/방과 후 수업 시간 중 화장행위를 한 학생" },
  { track: "SCHOOL", kind: "DEMERIT", category: "출결 수업", points: 10, description: null,
    label: "정규/방과 후 수업 시간 중 전자기기(핸드폰, 노트북, 웨어러블기기)를 사용 및 미제출한 학생" },
  { track: "SCHOOL", kind: "DEMERIT", category: "출결 수업", points: 4, description: null,
    label: "정규/방과 후 수업 종료 전 퇴실한 학생" },
  { track: "SCHOOL", kind: "DEMERIT", category: "출결 수업", points: 3, description: null,
    label: "정규/방과 후 수업 미인정 외출, 지각(5분 이상), 화장실(10분 이상), 결과를 한 학생" },
  { track: "SCHOOL", kind: "DEMERIT", category: "출결 수업", points: 5, description: null,
    label: "정규/방과 후 수업 미인정 결석 및 조퇴를 한 학생" },
  { track: "SCHOOL", kind: "DEMERIT", category: "출결 수업", points: 3, description: null,
    label: "정규/방과 후 수업 시간 중 SNS(카카오 등)를 이용하여 대화를 주고 받는 것을 적발당한 학생" },
  { track: "SCHOOL", kind: "DEMERIT", category: "출결 수업", points: 2, description: null,
    label: "조례시간(08:30~08:40)에 지각한 학생" },

  // ── 벌점: 흡연 음주 약물 ────────────────────────────────────
  { track: "SCHOOL", kind: "DEMERIT", category: "흡연 음주 약물", points: 10, description: null,
    label: "담배, 라이터, 음란물 등 소지 금지 물품을 소지한 학생" },
  { track: "SCHOOL", kind: "DEMERIT", category: "흡연 음주 약물", points: 20, description: null,
    label: "교내·외에서 흡연이나 음주를 한 학생" },
  { track: "SCHOOL", kind: "DEMERIT", category: "흡연 음주 약물", points: 20, description: null,
    label: "의학적 목적이 아닌 약물을 소지하거나 복용 및 흉기를 소지한 학생" },
];

/** 기숙사(정심관) 상벌점. 입학부터 졸업까지 누적된다. */
export const DORM_RULES: SeedRule[] = [
  // ── 상점: 기숙사 생활 ───────────────────────────────────────
  { track: "DORM", kind: "MERIT", category: "기숙사 생활", points: 3, description: null,
    label: "깨끗한 호실을 유지하는 호실 학생 전원(생활관 지도부장 확인 후 부여)" },
  { track: "DORM", kind: "MERIT", category: "기숙사 생활", points: 1,
    description: range(2, 5),
    label: "생활관 내 생활이 타의 모범이 되는 자(사감교사 및 사감 추천)" },
  { track: "DORM", kind: "MERIT", category: "기숙사 생활", points: 1,
    description: range(1, 3, "원본 기준 시간당 1점, 최고 3점."),
    label: "건물 내의 환경 미화 및 공공 시설물에서의 노력 봉사자(시간당 1점, 최고 3점)" },
  { track: "DORM", kind: "MERIT", category: "기숙사 생활", points: 1,
    description: range(1, 5),
    label: "위 사항에 없는 사안에 대해 정심관 운영위원회 협의회에서 상의하여 부여" },

  // ── 상점: 신고 ──────────────────────────────────────────────
  { track: "DORM", kind: "MERIT", category: "신고", points: 1, description: null,
    label: "신고(분실물 습득)" },
  { track: "DORM", kind: "MERIT", category: "신고", points: 1, description: null,
    label: "신고(사내 기물 파손)" },
  { track: "DORM", kind: "MERIT", category: "신고", points: 2, description: null,
    label: "신고(흡연, 음주 및 규정 위반)" },
  { track: "DORM", kind: "MERIT", category: "신고", points: 3, description: null,
    label: "신고(폭력, 금품 갈취)" },

  // ── 상점: 자치회 임원 ───────────────────────────────────────
  { track: "DORM", kind: "MERIT", category: "자치회 임원", points: 3, description: null,
    label: "자치회 임원(층장포함) 및 봉사자 (학기당)" },

  // ── 벌점: 정심관 벌점 ───────────────────────────────────────
  { track: "DORM", kind: "DEMERIT", category: "정심관 벌점", points: 20, description: null,
    label: "정해진 호실 이외에서 숙박하는 행위 (보호자 통보)" },
  { track: "DORM", kind: "DEMERIT", category: "정심관 벌점", points: 20, description: null,
    label: "무단 외출 (보호자 통보)" },
  { track: "DORM", kind: "DEMERIT", category: "정심관 벌점", points: 20, description: null,
    label: "도박 행위 (고리대금 행위 포함)를 한 학생 (보호자 통보) -학생생활규정 연계" },
  { track: "DORM", kind: "DEMERIT", category: "정심관 벌점", points: 20, description: null,
    label: "흡연, 음주, 도박행위 동조 (보호자 통보) -학생생활규정 연계" },
  { track: "DORM", kind: "DEMERIT", category: "정심관 벌점", points: 15, description: null,
    label: "야간 자율시간 *야간 출입 제한 구역에 출입하는 학생" },
  { track: "DORM", kind: "DEMERIT", category: "정심관 벌점", points: 15, description: null,
    label: "흡연 도구(담배, 라이터, 전자담배 등)를 소지한 학생 -학생생활규정 연계" },
  { track: "DORM", kind: "DEMERIT", category: "정심관 벌점", points: 10, description: null,
    label: "음란 서적, 동영상 등을 소유하거나 유포한 학생 -학생생활규정 연계" },
  { track: "DORM", kind: "DEMERIT", category: "정심관 벌점", points: 10, description: null,
    label: "사감 및 기숙사 담당 교사의 지시를 따르지 않는 학생 -학생생활규정 연계" },
  { track: "DORM", kind: "DEMERIT", category: "정심관 벌점", points: 10, description: null,
    label: "타인의 음식을 훔쳐 먹거나 물건을 무단으로 사용한 학생 -학생생활규정 연계" },
  { track: "DORM", kind: "DEMERIT", category: "정심관 벌점", points: 10, description: null,
    label: "기숙사 내 외 시설 및 물품을 고의로 파손한 학생(*개인변상) -학생생활규정 연계" },
  { track: "DORM", kind: "DEMERIT", category: "정심관 벌점", points: 10, description: null,
    label: "빈 타호실에 출입하는 학생(주말포함)" },
  { track: "DORM", kind: "DEMERIT", category: "정심관 벌점", points: 5, description: null,
    label: "취침 시간 이후 타인의 수면을 방해한 학생" },
  { track: "DORM", kind: "DEMERIT", category: "정심관 벌점", points: 5, description: null,
    label: "점호 이후 기숙사 내를 이동하거나 타 호실을 출입한 학생(응급상황, 사감 사전 안내 제외)" },
  { track: "DORM", kind: "DEMERIT", category: "정심관 벌점", points: 5, description: null,
    label: "허락 없이 기숙사 안에 포장 음식을 반입한 학생" },
  { track: "DORM", kind: "DEMERIT", category: "정심관 벌점", points: 5, description: null,
    label: "허락되지 않은 전열 기구를 사용하는 학생" },
  { track: "DORM", kind: "DEMERIT", category: "정심관 벌점", points: 5, description: null,
    label: "공용 공간에 쓰레기 투기 및 분리수거를 하지 않은 학생" },
  { track: "DORM", kind: "DEMERIT", category: "정심관 벌점", points: 5, description: null,
    label: "소란한 행위로 타인에게 피해를 주는 학생" },
  { track: "DORM", kind: "DEMERIT", category: "정심관 벌점", points: 5, description: null,
    label: "야간 자율 시간을 지키지 않은 학생" },
  { track: "DORM", kind: "DEMERIT", category: "정심관 벌점", points: 5, description: null,
    label: "몰입실 사용 시간을 지키지 않은 학생" },
  { track: "DORM", kind: "DEMERIT", category: "정심관 벌점", points: 5, description: null,
    label: "허락되지 않은 공간에서 음식을 섭취한 학생(음료수 제외)" },
  { track: "DORM", kind: "DEMERIT", category: "정심관 벌점", points: 5, description: null,
    label: "허락된 공간이여도 취식 후 뒷정리(먹다 남은 음식 냉장고 보관 불가)를 안하는 학생" },
  { track: "DORM", kind: "DEMERIT", category: "정심관 벌점", points: 3, description: null,
    label: "몰입실(랩실) 면학 분위기를 흐리는 학생" },
  { track: "DORM", kind: "DEMERIT", category: "정심관 벌점", points: 3, description: null,
    label: "몰입실(랩실)에서 학습 이외의 활동을 한 학생" },
  // 원본 표기 그대로다 ("리숙사"). 공식 규정 문구라 시스템이 임의로 고치지 않는다.
  { track: "DORM", kind: "DEMERIT", category: "정심관 벌점", points: 3, description: null,
    label: "리숙사 내에서 소란을 일으킨 학생(속옷을 입고 돌아다니는 자 등)" },
  { track: "DORM", kind: "DEMERIT", category: "정심관 벌점", points: 5, description: null,
    label: "아침 퇴실 시간 지키지 않은 학생" },
  { track: "DORM", kind: "DEMERIT", category: "정심관 벌점", points: 3, description: null,
    label: "소등 시간 이후 점등한 학생 (호실원 전체)" },
  { track: "DORM", kind: "DEMERIT", category: "정심관 벌점", points: 3, description: null,
    label: "허락되지 않은 시간에 기숙사에 무단으로 들어간 학생" },
  { track: "DORM", kind: "DEMERIT", category: "정심관 벌점", points: 3, description: null,
    label: "침구 상태와 사물의 정리 정돈(쓰레기 방치 포함)이 불량한 학생" },
  { track: "DORM", kind: "DEMERIT", category: "정심관 벌점", points: 3, description: null,
    label: "세탁물 수거가 늦거나, 공용의 물건을 사용 후 방치하여 타인에게 피해를 주는 학생" },
  { track: "DORM", kind: "DEMERIT", category: "정심관 벌점", points: 3, description: null,
    label: "냉장고 및 전자레인지 사용을 불량하게 한 학생" },
  { track: "DORM", kind: "DEMERIT", category: "정심관 벌점", points: 3, description: null,
    label: "인원 점검 시 지각한 학생" },
  { track: "DORM", kind: "DEMERIT", category: "정심관 벌점", points: 3, description: null,
    label: "허위로 신고한 학생" },
];

export const MERIT_RULE_SEED: SeedRule[] = [...SCHOOL_RULES, ...DORM_RULES];
