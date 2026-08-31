# 전수 통독 감사 — 2026-09-01

> **이 문서는 검사 시점의 스냅샷이다.** 제품 코드는 고치지 않았다.
> 앞의 두 감사([`2026-08-31-codebase-audit.md`](2026-08-31-codebase-audit.md) ·
> [`2026-08-31-codebase-audit-deep.md`](2026-08-31-codebase-audit-deep.md))와 **기준선이 같고
> 읽는 방법만 다르다.** 그 둘은 검색으로 단서를 잡아 주변을 확인했고, 이 감사는
> **파일을 처음부터 끝까지 읽었다.**

기준선: `main @ bc7d64f`

## 1. 범위와 방법

`git ls-files`가 주는 추적 파일에서 생성물(`src/generated/`)과 문서(`docs/`)만 뺀
**547개 파일 78,598줄**을 경로 순서대로 8등분해, 에이전트 여덟이 각자 배정분을
**한 파일도 건너뛰지 않고 통독**했다. 설정·`Dockerfile`·`docker-compose.yml`·
`prisma/`·`scripts/`·`tests/`가 모두 포함된다.

| # | 파일 | 줄 | 범위 |
|---|---:|---:|---|
| 1 | 94 | 9,854 | 설정·인프라 → `admin/users` |
| 2 | 88 | 9,923 | `admin/users` → `pass/qr` |
| 3 | 92 | 9,910 | `pass/student-view` → `components/ui` |
| 4 | 77 | 9,978 | `components/ui` → `modules/merit` |
| 5 | 45 | 9,862 | `modules/merit` → `tests/app/pass` |
| 6 | 64 | 9,905 | `tests/app/pass` → `tests/lib` |
| 7 | 45 | 10,660 | `tests/lib` → `tests/modules/merit` |
| 8 | 42 | 8,506 | `tests/modules/merit` → `vitest.config` |

배정분은 하나도 건너뛰지 않되, 문맥이 필요하면 담당 밖 파일을 읽는 것은 허용했다 —
테스트만 받은 뒤쪽 셋이 대상 코드를 못 보면 판단이 서지 않는다. 지난 감사들과 같이
`docs/reviews/`는 읽지 못하게 막아 독립적인 눈을 유지했다.

**커버리지: 배정 547 / 통독 547 / 건너뜀 0.** 통독을 실제로 했는지가 이 라운드의
전제이므로 각 에이전트가 읽은 파일 수와 못 읽은 파일을 스스로 보고하게 했고,
빠진 파일은 없었다. 항목마다 「검색으로도 찾을 수 있었나」를 함께 받았다.

## 2. 결과 요약

| 구분 | 수 |
|---|---:|
| 높음 | 0 |
| 중간 | 11 |
| 낮음 | 37 |
| **합계** | **48** |
| 그중 통독해야만 보이는 것 | 40 (83%) |

**높음이 없다.** 앞선 두 감사가 권한·데이터 정합성·배포 실패를 이미 훑었고, 이 방법이
강한 자리는 그쪽이 아니다. 대신 **48건 중 40건이 검색으로는 닿지 않는 종류**였다 —
한 함수 안에서 앞뒤가 안 맞는 곳, 파일 위쪽 주석이 약속한 것을 아래쪽 코드가 어기는 곳,
비슷한 블록 여럿 중 하나만 다른 곳, 통과할 수밖에 없어서 아무것도 지키지 못하는 단언.

가장 값이 큰 둘을 먼저 적는다. **R-01**은 확인 모달이 서버 응답 전에 닫히는 결함이고,
`ConfirmDialog`가 객체 동일성으로 성공을 판정하는데 두 호출부만 매 렌더 새 객체를
넘기기 때문이다 — 컴포넌트와 호출부를 이어 읽어야만 보인다. **R-03**은 같은 파일
안에서 교사 대시보드와 학생 대시보드가 「학년도가 없을 때」를 정반대로 판단하는 것이고,
교사 쪽에는 그렇게 한 이유가 주석으로 적혀 있다.

**앞선 감사와 겹치는 것이 8건 있다** — 감사로그 라벨 테스트의 정규식(앞 감사 C-02),
`listActivePasses`·`getPassDetail`의 거부 미검증(C-23·C-24), 출입증 상세의 맨이름
(deep DL-52), `auth-panel.tsx`의 `font-extrabold`, `kstHour` 죽은 코드,
`recordAuditMany`가 스캐너 밖인 것, 명단 계획의 졸업생 예외(C-08). 셋 다 다른 방법으로
같은 곳에 도달했다는 뜻이라 근거가 보강된 것으로 읽으면 된다. 나머지 40건은 신규다.

---

## 3. 확정 결함 — 중간 (11건)

### R-01 · ConfirmDialog에 매 렌더 새 객체를 넘겨 모달이 제출 시작과 동시에 닫힌다 (계정 비활성화·비밀번호 초기화)

**위치:** `src/app/(app)/admin/users/[userId]/user-forms.tsx:284`

```ts
// ToggleActiveForm — 매 렌더 새 객체 리터럴이고 error가 null인 초기·대기 상태에서도 ok가 true다
        state={{ ok: state.error === null, error: state.error }}

// ResetPasswordForm — 같은 계열. 한 번 성공하면 tempPassword가 계속 남아 ok가 영구히 true다
        state={{ ok: state.tempPassword !== null, error: state.error }}

// src/components/ui/confirm-dialog.tsx:88-93 — 판정은 **객체 동일성**이다
  // 성공하면 닫고, 실패하면 쓰던 사유를 남겨 고쳐서 다시 누를 수 있게 한다.
  const [handled, setHandled] = useState(state);
  if (state !== handled) {
    setHandled(state);
    if (state.ok) setOpen(false);
  }
```

**실패 시나리오:** 교사가 계정 상세에서 「계정 비활성화」를 누르고 모달에 사유를 적은 뒤 확인을 누른다. 제출 즉시 useActionState의 pending이 true가 되어 ToggleActiveForm이 다시 렌더되고, state prop이 새 객체 리터럴이라 ConfirmDialog의 `state !== handled`가 참이 된다. 이때 ok는 `state.error === null`이라 아직 서버 응답이 오기도 전에 true다 → setOpen(false)로 모달이 닫힌다. 결과: (1) 진행 중임을 알리는 pendingLabel(「비활성화 중…」)이 모달 안에 있어 아무에게도 안 보이고, (2) 서버가 CANNOT_DEACTIVATE_SELF 등으로 거부하면 모달은 이미 닫혀 있어 오류가 버튼 아래 Note로만 뜨며, 다시 열면 handleOpen()의 setReason("")이 방금 적은 사유를 지운다. ConfirmDialog가 주석으로 약속한 「실패하면 쓰던 사유를 남겨 고쳐서 다시 누를 수 있게 한다」가 이 두 호출부에서만 깨진다. ResetPasswordForm(229행)은 첫 초기화만 정상이고, 두 번째부터는 tempPassword가 남아 있어 같은 조기 닫힘이 일어난다. 저장소의 다른 ConfirmDialog 호출부(revoke-button.tsx·delete-community.tsx 등)는 useActionState의 state를 그대로 넘겨 동일성이 안정적이라 이 증상이 없다.

**권장:** useActionState가 돌려주는 state 객체를 그대로 넘기거나(다른 호출부와 같은 방식), 액션 상태에 성공 여부 플래그(예: `ok: boolean`)를 넣어 서버가 실제로 성공했을 때만 true가 되게 한다. 파생 객체를 넘겨야 한다면 useMemo로 동일성을 붙잡아 pending 재렌더에서 새 객체가 생기지 않게 한다. 또한 ConfirmDialog가 동일성 비교에 기대고 있다는 점을 prop 타입 주석에 못 박아 다음 호출부가 같은 실수를 하지 않게 한다.

### R-02 · 반 명단의 기본 정렬이 repo가 일부러 세운 학년·반 순서를 뒤엎는다

**위치:** `src/app/(app)/merit/class-roster.tsx:143`

```ts
// class-roster.tsx 138-146
const sorted = useMemo(() => {
  const copy = [...rows];
  if (sortKey === "net") {
    copy.sort((a, b) => b.net - a.net);
  } else {
    copy.sort((a, b) => (a.number ?? 0) - (b.number ?? 0));
  }
  return copy;
}, [rows, sortKey]);

// merit.repo.ts 530-537 — 서버가 이미 정한 순서와 그 이유
// 한 반만 볼 때는 번호순이 곧 명단 순서다. 전교를 훑을 때는 학년·반이 앞에
// 서야 읽힌다 — 번호만으로 세우면 1학년 1번 다음에 3학년 1번이 온다.
orderBy: [
  { schoolClass: { grade: "asc" } },
  { schoolClass: { classNo: "asc" } },
  { number: "asc" },
],
```

**실패 시나리오:** `/merit`에서 학년·반을 고르지 않거나(전교) 학년만 고르면 `getClassRoster`는 학년→반→번호 순으로 정렬된 행을 준다. 그런데 `ClassRoster`의 기본 정렬키가 "number"라 화면이 그 위에 번호만으로 다시 정렬한다. Array#sort가 안정적이므로 결과는 「모든 반의 1번 → 모든 반의 2번 → …」이 되어, repo 주석이 막으려던 바로 그 배치(1학년 1번 다음에 3학년 1번)가 그대로 나온다. 같은 화면의 `showClass`가 켜져 학급 열이 서 있어도 줄마다 반이 튀어 담임이 자기 반 학생을 연속으로 읽을 수 없다. 같은 컴포넌트 안에서 `chosen`(고른 학생 목록)은 `rows`를 그대로 걸러 서버 순서를 유지하므로, 표와 「고른 학생」 목록의 순서가 서로 다르기도 하다.

**권장:** 기본 정렬을 서버 순서 그대로 두거나(정렬 상태 `number`일 때 `rows`를 손대지 않음), 최소한 `(a.grade ?? 0) - (b.grade ?? 0) || (a.classNo ?? 0) - (b.classNo ?? 0) || (a.number ?? 0) - (b.number ?? 0)`로 학년·반을 앞세운다. repo 주석과 화면이 같은 규칙을 말하게 한다.

### R-03 · 현재 학년도가 없으면 학생·학부모 대시보드에서 출입증·새 글 카드가 통째로 사라진다

**위치:** `src/app/(app)/page.tsx:359`

```ts
// StudentDashboard 351-365 — live·posts를 이미 받아 놓고 버린다
const [merit, live, posts] = await Promise.all([
  loadOwnMerit(user),
  getMyLivePasses(user, now),
  listRecentPosts(user, 5),
]);

if (merit === "no-year") {
  return (<Stack><NoAcademicYearNotice title="상벌점" /></Stack>);
}

// 같은 파일 TeacherStats 312-316 — 교사 쪽은 정확히 그 반대로 판단한다
} catch (error) {
  // 학년도가 없으면 상벌점 두 칸이 성립하지 않는다. 출입증 두 칸은 학년도와
  // 무관하게 선다 — 띠 전체를 지우면 결재 대기가 몇 건인지도 사라진다.
  if (!(error instanceof AcademicYearError)) throw error;
}
```

**실패 시나리오:** 현재 학년도가 아직 없거나(설치 직후·학년도 전환 사이) `AcademicYear_single_current`가 흔들려 `findCurrent()`가 비면 `loadOwnMerit`이 "no-year"를 돌려준다. 그러면 학생 대시보드는 상벌점뿐 아니라 「내 출입증」과 「새 글」까지 함께 지운다 — 두 자료는 이미 `Promise.all`로 받아 놓았고 학년도와 무관하다(`getMyLivePasses`→`repo.displayYear()`는 없으면 0을 돌려줄 뿐 던지지 않고, `listLiveForStudent`의 `where`는 year를 쓰지 않는다; `listRecentPosts`는 학년도를 아예 모른다). `ParentDashboard`(448-454)도 같은 방식으로 「동의 대기」를 함께 지운다. 결과적으로 학년도가 비어 있는 동안 학생은 승인된 외박이 있는지 대시보드에서 알 수 없다.

**권장:** 교사 쪽 `TeacherStats`와 같은 판단을 학생·학부모 쪽에도 적용한다 — 상벌점 자리에만 `NoAcademicYearNotice`를 세우고 출입증 카드·새 글 카드는 그대로 그린다.

### R-04 · /scan: 앞 학생의 판정 카드가 화면 맨 위에 그대로 남는다

**위치:** `src/app/scan/page.tsx:61`

```ts
{error && <Note tone="error">{error}</Note>}
{result && <VerdictCard result={result} />}

{/* 코드를 들고 왔어도 스캐너를 함께 띄운다 — 정문은 다음 학생이 바로 온다. */}
<Scanner origin={scanOrigin()} />
```

**실패 시나리오:** 교사가 폰 기본 카메라로 A학생 QR을 찍어 /scan?c=<A>로 들어오면 page.tsx가 A의 판정 카드를 그린다(61줄). 이어서 B학생을 화면 안 스캐너로 찍으면 scanner.tsx가 B의 판정 카드를 자기 영역에 따로 그린다(scanner.tsx:244). 주소의 ?c=<A>는 그대로라 서버 액션 뒤 재렌더에서도 A가 다시 판정돼 위 카드가 유지된다 — 한 화면에 판정 카드가 둘 서고, 가장 먼저 눈에 드는 위쪽 카드가 앞 학생(A)의 「허가/불가」다. 팔 뻗은 거리에서 배지 색만 보고 통과시키면 B의 판정을 A의 것으로 읽는다. 63줄 주석이 「다음 학생이 바로 온다」를 이미 전제하므로 드문 경로도 아니다.

**권장:** 스캐너가 새 결과를 받으면 주소의 c를 지우거나(성공 시 router.replace("/scan")), page.tsx의 판정 결과를 Scanner의 초기 상태로 내려보내 카드를 한 자리에서만 그린다.

### R-05 · bfcache로 돌아온 /scan은 카메라가 죽은 채 「준비되었습니다」라고 말한다

**위치:** `src/app/scan/scanner.tsx:190`

```ts
/**
 * 화면을 떠나는 다른 길. React가 언마운트를 못 보는 경우 —— 탭을 닫거나,
 * 브라우저가 페이지를 bfcache로 넣거나, 앱을 뒤로 보내는 때 —— 를 받는다.
 */
window.addEventListener("pagehide", stopCamera);
```

**실패 시나리오:** stopCamera()는 stopped=true로 잠그고 트랙을 멈춘 뒤 video.srcObject까지 비운다(78~88줄). 주석이 직접 지목한 bfcache 경로에서는 문서가 살아 있어 React가 다시 마운트하지 않고 effect도 다시 돌지 않는데, 되살리는 pageshow 처리가 없다. 그래서 다른 문서로 갔다가 뒤로 돌아오면 supported는 "ok", cameraReady는 true로 남아 검은 상자만 서고(254~271줄), 상태 문구는 「스캔할 준비가 되었습니다」로 남으며(217줄) 「다시 시도」 버튼은 startupError가 있을 때만 나오므로 되살릴 길이 화면에 없다. 정문에서 새로고침해야 한다는 것을 모르면 스캐너가 조용히 멈춘 채로 쓰인다.

**권장:** pageshow(event.persisted)에서 retryCamera()와 같은 재시작 경로를 태우거나, stopCamera 뒤에는 cameraReady를 false로 되돌려 「카메라 연결 중…」 덮개와 다시 시도 버튼이 뜨게 한다.

### R-06 · 규정 삭제의 필수 사유가 감사로그 화면에서 사라진다 — 같은 파일의 다른 삭제·폐기는 모두 싣는다

**위치:** `src/modules/audit-log/audit-log.labels.ts:456`

```ts
/** merit:rule:delete — 무엇을 지웠는지. 되돌리는 화면이 없어 로그가 유일한 흔적이다. */
function meritSubjectSummary(metadata: Record<string, unknown>): string | null {
  const parts = meritSubject(metadata);
  return parts.length > 0 ? parts.join(" · ") : null;
}
...
  "invite:revoke": reasonSummary,
  "merit:rule:delete": meritSubjectSummary,
  "merit:cancel": meritCancelSummary,
```

**실패 시나리오:** `merit.schema.ts`의 `deleteRuleSchema`는 `reason`을 필수로 받고(`.min(1, "삭제 사유를 입력해 주세요.")`), `rule.service.deleteRule`이 그 값을 `metadata.reason`에 담아 감사로그에 남긴다. 그런데 화면 포맷터는 `meritSubjectSummary`라서 `meritSubject()`가 만드는 track·kind·label·points만 잇고 `reason`을 한 번도 읽지 않는다 — 교사가 「기준이 바뀌어 폐기」라고 적어도 감사로그 화면에는 「기숙사 · 벌점 3점 · 점호 지각」만 뜬다. 바로 옆의 `meritCancelSummary`(merit:cancel)와 `reasonSummary`(invite:revoke)는 같은 `reasonPart()`로 사유를 싣고, `reasonSummary`의 주석은 「이 갈래가 없으면 … 왜 없앴나를 되짚을 자료가 여기밖에 없다」고 그 이유를 직접 적어 두었다. 규정 삭제는 되돌리는 화면이 없어 로그가 유일한 흔적이라고 `meritSubjectSummary` 자신의 주석이 말하는데, 정작 「왜」에 해당하는 한 조각만 빠졌다. 값은 DB의 metadata JSON에는 남아 있으므로 데이터 손실은 아니고 화면에서만 안 보인다.

**권장:** `merit:rule:delete` 전용 포맷터를 만들어 `meritCancelSummary`와 같은 짜임(`meritSubject()` + `reasonPart()`)을 쓰게 한다. 사유를 받는 액션이 늘 때마다 갈라지지 않게 `reasonPart`를 붙이는 규칙을 `METADATA_FORMATTERS` 위에 한 줄로 적어 두면 좋다.

### R-07 · 승인 다이얼로그의 필드 이름 단언이 반려 다이얼로그 때문에 절대 실패할 수 없다

**위치:** `tests/app/(app)/pass/decision-panel.test.tsx:30`

```ts
it("보호자가 확인한 신청은 교사 승인 메모를 따로 받는다", () => {
    const html = renderToStaticMarkup(
      <DecisionPanel passId="pass-2" needsProxyConsent={false} />,
    );
    expect(html).toContain("승인 메모");
    expect(html).toContain('name="decisionNote"');
```

**실패 시나리오:** DecisionPanel은 승인·반려 ConfirmDialog 둘을 항상 그리고(decision-panel.tsx:46, 86), ConfirmDialog는 <dialog>와 그 안의 form·Textarea를 조건 없이 렌더한다(confirm-dialog.tsx:104-136, name={reasonName}). 반려 쪽 reasonName은 언제나 "decisionNote"이므로(decision-panel.tsx:96) 이 문자열은 needsProxyConsent 값과 무관하게 항상 출력에 있다. 즉 decision-panel.tsx:74의 `reasonName={needsProxyConsent ? "consentNote" : "decisionNote"}`를 실수로 항상 "consentNote"로 바꿔도 이 테스트의 세 단언이 모두 통과한다 — 보호자가 이미 확인한 외박·외출의 교사 승인 메모가 consentNote(보호자 확인 기록)에 들어가 「보호자 확인 대행」처럼 남게 되는데, 정작 그 구분을 지키라고 만든 테스트가 잡지 못한다. (같은 구분을 화면 쪽에서는 pass-card.test.tsx·pass-detail-cell.test.tsx가 따로 지키고 있다.)

**권장:** 승인 다이얼로그의 필드를 배타적으로 단언한다. 반려 다이얼로그는 consentNote를 절대 쓰지 않으므로 `expect(html).not.toContain('name="consentNote"')`를 추가하면 그 자리에서 갈린다. (첫 번째 테스트도 대칭으로 `name="consentNote"` 존재 + 승인 쪽 decisionNote 부재를 함께 못 박으면 더 낫다.)

### R-08 · 감사로그 라벨 커버리지 테스트가 콜론 두 개짜리 액션 13개를 아예 못 본다

**위치:** `tests/modules/audit-log/audit-log.labels.test.ts:48`

```ts
const matches = window.match(/"[a-zA-Z][\w-]*:[\w-]+"/g) ?? [];
…
expect(recorded.size).toBeGreaterThanOrEqual(13);
const known = new Set<string>(AUDIT_ACTIONS);
const missing = [...recorded].filter((a) => !known.has(a));
expect(missing).toEqual([]);
```

**실패 시나리오:** 정규식이 콜론을 하나만 허용한다(\w에 :가 없어 [\w-]*가 콜론을 넘지 못한다). 그래서 recordAudit이 실제로 남기는 merit:rule:create·merit:rule:update·merit:rule:delete·merit:threshold:update·invite:revoke:roster·community:post:{create,update,delete}·community:comment:{create,delete}·community:attachment:{create,delete} 13개가 스캐너에 잡히지 않는다(스캐너를 그대로 돌려 27개만 모으는 것을 확인). 새 3단 액션을 AUDIT_ACTIONS·ACTION_LABELS에 넣지 않고 recordAudit만 추가해도 이 테스트는 통과하고, 감사로그 화면은 그 줄을 영문 코드 그대로 띄운다. 스캐너가 통째로 망가지는 경우를 막으라고 둔 `>= 13` 하한도 실제로 잡히는 27보다 한참 낮아 방어가 안 된다.

**권장:** 정규식을 /"[a-zA-Z][\w:-]*"/ 계열로 넓혀 3단 액션까지 잡고(권한 액션 문자열이 섞이면 window 계산을 targetType까지로 더 좁힌다), 하한을 실제로 잡히는 수(40)로 올린다.

### R-09 · 「교사만 본다」는 이름의 테스트가 거부를 전혀 검사하지 않는다 (rejectPass·cancelPass도 같은 구멍)

**위치:** `tests/modules/pass/decision.service.test.ts:513`

```ts
it("결재 대기는 교사만 본다", async () => {
    await expect(service.listPendingPasses(student, NOW)).rejects.toThrow(ForbiddenError);
    await service.listPendingPasses(admin, NOW);
    expect(listPendingForAdmin).toHaveBeenCalledWith(NOW, 2026);
  });

  it("지금 유효한 목록도 교사만 본다", async () => {
    await service.listActivePasses(admin, NOW);
    expect(listActiveNow).toHaveBeenCalledWith(NOW, 2026);
  });
```

**실패 시나리오:** 바로 위 테스트는 student 거부를 확인하는데 이 테스트는 admin 한 번만 부르고 끝난다. src/modules/pass/decision.service.ts:328의 `await assertCan(actor, "pass:read:any")`를 지워도 이 테스트는 그대로 통과하고, 그러면 학생·학부모가 「지금 나가 있는 학생」 전교 명단(이름·학급·행선지)을 읽는다. 같은 파일에서 rejectPass(pass:approve)와 cancelPass(pass:cancel)도 거부 테스트가 없다 — approvePass·issuePass·listPendingPasses·listPassHistory·exportPassHistory 다섯은 있는데 이 셋만 빠져 있어, CLAUDE.md 「새 모듈 추가 체크리스트」 5번(권한 거부/허용 검증)이 이 모듈에서 절반만 지켜진다.

**권장:** `await expect(service.listActivePasses(student, NOW)).rejects.toThrow(ForbiddenError); expect(listActiveNow).not.toHaveBeenCalled();`를 넣고, rejectPass·cancelPass에도 같은 모양의 거부 단언을 한 줄씩 추가한다. 이름이 「교사만」이면 본문이 거부를 확인해야 한다.

### R-10 · 한 학생으로 좁힌 출입증 내역이 30일 하한을 걷는 갈래만 두 테스트 파일 모두에서 빠져 있다

**위치:** `tests/modules/pass/decision.service.test.ts:520`

```ts
describe("전체 내역", () => {
  const query = {
    type: undefined,
    status: undefined,
    q: undefined,
    from: "2026-08-01",
    to: "2026-08-26",
    page: 1,
  };
```

**실패 시나리오:** `historyFilter`(decision.service.ts:370)는 `since: query.studentProfileId && !query.from ? undefined : range.since`로, 학생 상세의 출입증 탭처럼 한 사람으로 좁히고 시작일을 안 고른 조회에서만 기본 30일 하한을 걷는다. 바로 위 주석이 그 이유를 「그대로 두면 9월에 나간 기록을 12월에 못 보여준다」로 못 박아 뒀는데, 이 describe의 query 픽스처는 type·status·q·from·to·page를 다 열거하면서 studentProfileId만 없고, tests/modules/pass/pass.schema.test.ts의 passHistoryQuerySchema describe도 같은 다섯 필드만 검사하고 studentProfileId(pass.schema.ts:202에 실제로 선언돼 있다)를 한 번도 통과시키지 않는다. 통합 테스트에도 studentProfileId를 넘기는 호출이 없다. 이 삼항이 `range.since`로 되돌아가도 깨지는 테스트가 하나도 없고, 학생 상세 출입증 탭은 최근 30일치만 조용히 보여준다 — 주석이 막았다고 적은 바로 그 증상이다.

**권장:** decision.service.test.ts에 두 케이스를 넣는다 — (1) `listPassHistory(admin, { ...query, from: undefined, to: undefined, studentProfileId: "sp-1" })`가 `listHistory`를 `since: undefined`로 부르는지, (2) `from`을 함께 주면 사람이 고른 `since`가 그대로 살아 있는지. pass.schema.test.ts에는 `studentProfileId`가 파싱을 통과해 살아남는지(zod가 벗기지 않는지) 한 줄 추가한다.

### R-11 · getPassDetail의 본인·보호자·거부 갈래가 단위·통합 어디에도 없다

**위치:** `tests/modules/pass/request.service.test.ts:54`

```ts
const service = await import("@/modules/pass/request.service");
…
describe("requestPass") / describe("withdrawPass") / describe("consentPass")
describe("getMyPasses") / describe("대시보드 출입증") / describe("getMyStudentQr")
```

**실패 시나리오:** request.service의 export 가운데 getPassDetail만 이 파일에 describe가 없다. 그 함수(request.service.ts:265~281)는 이 모듈에서 유일하게 세 갈래로 갈리는 읽기 권한 판정이다 — `if (can(actor, "pass:read:any")) return pass;` → `const own = profile?.id === pass.studentProfileId;` → `const guardian = !own && (await repo.isParentOf(...));` → `if (!own && !guardian) { await recordDenied(...); throw new ForbiddenError("pass:read:any"); }`. 통합 테스트(tests/integration/pass.flow.integration.test.ts:180·193·213)는 세 번 모두 adminActor로만 부르므로 첫 갈래만 지난다. 즉 「남의 학생 출입증 상세(행선지·사유)를 로그인한 다른 학생이 읽을 수 있는가」와 「보호자는 자녀 것만 읽는가」, 그리고 거부 시 authz:denied가 남는가를 확인하는 테스트가 저장소에 하나도 없다. /pass/[passId]는 로그인한 누구나 주소로 닿을 수 있는 화면이다.

**권장:** withdrawPass·consentPass가 이미 쓰는 모양 그대로 세 케이스를 추가한다 — 본인 프로필이면 통과, isParentOf가 true면 통과, 둘 다 아니면 ForbiddenError이면서 `auditEntries()`에 `action: "authz:denied"`가 한 줄 남는지.

---

## 4. 확정 결함 — 낮음 (37건)

`통독`은 파일을 처음부터 읽어야만 보이는 것, `검색`은 grep으로도 닿는 것이다.

| # | 요약 | 위치 | 발견 방식 |
|---|---|---|---|
| RL-01 | 학년도 추가 폼은 Enter만 눌러도 확인 모달을 건너뛰고 제출된다 | `src/app/(app)/admin/students/year-switcher.tsx:65` | 통독 |
| RL-02 | 초대코드 발급 모달의 「이 화면에서 한 번만 보입니다」가 사실이 아니다 — 목록이 대기 코드를 그대로 다시 보여준다 | `src/app/(app)/admin/invites/invite-form.tsx:242` | 통독 |
| RL-03 | 출입증 상세의 「승인/반려」·「취소」 줄만 호칭 없이 맨이름을 그린다 | `src/app/(app)/pass/[passId]/page.tsx:104` | 검색 |
| RL-04 | 대시보드 「최근 부여」만 308 리다이렉트로 남겨 둔 옛 학생 상세 주소를 가리킨다 | `src/app/(app)/page.tsx:214` | 검색 |
| RL-05 | 바로 부여 폼의 「확인 방법」 칸에 접근 가능한 이름이 없다 — placeholder뿐이다 | `src/app/(app)/pass/issue-form.tsx:115` | 통독 |
| RL-06 | 댓글 폼의 명시적 reset이 `state.ok`에 매달려 있어 연속 댓글에서는 다시 돌지 않는다 | `src/app/(app)/community/[slug]/[postId]/comment-form.tsx:22` | 통독 |
| RL-07 | 학부모 초대 목록의 폐기 버튼만 `ariaLabel` 없이 「폐기」가 여러 개 늘어선다 | `src/app/(app)/parent-invite/page.tsx:78` | 통독 |
| RL-08 | 로그인 서버 오류(5xx)가 「이메일 또는 비밀번호가 맞지 않습니다」로 보인다 | `src/app/(auth)/login/submit/route.ts:75` | 통독 |
| RL-09 | 규정이 0개면 부여 폼이 아무 설명 없이 사라진다 — 주석의 근거는 can.ts에서 성립하지 않는다 | `src/app/(app)/students/[studentId]/merit-tab.tsx:244` | 통독 |
| RL-10 | 부여 성공 모달이 안쪽 아무 곳이나 눌러도 닫힌다 | `src/components/merit/award-success-dialog.tsx:58` | 통독 |
| RL-11 | 첨부 라우트의 CSP 주석이 next.config.ts·CLAUDE.md와 정반대로 적혀 있다 | `src/app/api/community/attachments/[...attachment]/route.ts:46` | 통독 |
| RL-12 | icons.tsx: 안 쓰이는 아이콘 셋과 사실이 아닌 근거 주석, 대신 셰브런은 두 곳이 다시 그린다 | `src/components/icons.tsx:119` | 통독 |
| RL-13 | auth-panel.tsx만 금지된 font-extrabold와 임의 글자크기를 쓴다 | `src/app/(auth)/auth-panel.tsx:50` | 검색 |
| RL-14 | SkeletonField 주석의 높이(38/42px, dense)가 바로 아래 상수·input.tsx와 어긋난다 | `src/components/ui/skeleton.tsx:74` | 통독 |
| RL-15 | `invite.repo.listStudents`만 `role: "STUDENT"` 필터가 없다 — 학생 목록 쿼리 셋 중 하나 | `src/modules/invites/invite.repo.ts:155` | 통독 |
| RL-16 | `SummaryRow`에 문자열이 아닌 `title`을 주면 그 줄이 접근성 트리에서 통째로 사라진다 | `src/components/ui/summary-list.tsx:50` | 통독 |
| RL-17 | `IMPORT_COUNT_LABELS` 주석이 어느 키가 옛 행인지 반대로 적혀 있다 | `src/modules/audit-log/audit-log.labels.ts:258` | 통독 |
| RL-18 | `merit:rule:create`에만 metadata 포맷터가 없어 감사로그에 날것으로 찍힌다 | `src/modules/audit-log/audit-log.labels.ts:445` | 통독 |
| RL-19 | 「학생코드만 지워진 기존 학생」 경고가 졸업 기록이 있는 학생만 비껴간다 | `src/modules/enrollment/roster.plan.ts:219` | 통독 |
| RL-20 | `kstHour`는 운영 호출자가 없고, 바로 위 형제 함수가 문서화한 `hourCycle` 가드도 빠져 있다 | `src/lib/datetime.ts:217` | 검색 |
| RL-21 | getMyStudentQr의 거부 감사로그가 User id를 「출입증」 대상으로 남긴다 — 이 함수만 can()을 부르지 않는다 | `src/modules/pass/request.service.ts:299` | 통독 |
| RL-22 | 이름 저장 경로에는 registration.verify의 normalizeName이 한 번도 적용되지 않는다 — 대조만 정규화한다 | `src/modules/registration/registration.service.ts:132` | 통독 |
| RL-23 | 결재 대기 목록은 100건에서 잘리는데 머리글은 전체 건수를 적고, 나머지에 닿을 경로가 화면에 없다 | `src/modules/pass/pass.repo.ts:168` | 통독 |
| RL-24 | clearAllMocks는 mockRejectedValue를 지우지 않는다 — 액션 테스트 끝의 「권한 거부 문구」가 뒤에 붙는 테스트를 오염시킨다 | `tests/app/(app)/admin/merit/rules/actions.test.ts:307` | 통독 |
| RL-25 | 없어진 cancel-batch-button.tsx를 설명하는 주석이 const INITIAL 위에 남아 있다 | `tests/app/(app)/merit/actions.test.ts:89` | 통독 |
| RL-26 | withTz가 막는다고 적힌 함정을 실제로는 막지 못한다 — 정적 import라 포맷터가 이미 굳어 있다 | `tests/lib/datetime.test.ts:29` | 통독 |
| RL-27 | "이 테스트 전용"이라고 적힌 학년도 8102를 다른 통합 테스트가 똑같이 쓴다 | `tests/integration/roster.repo.apply-roster.integration.test.ts:17` | 검색 |
| RL-28 | 학생증 QR 라우트의 네 가지 차단 조건 중 하나만 테스트가 붙들고 있다 | `tests/app/api/pass/qr/route.test.ts:30` | 검색 |
| RL-29 | recordAuditMany는 같은 파일에 있으면서 어디에서도 실제로 실행되지 않는다 | `tests/core/audit/audit.test.ts:17` | 검색 |
| RL-30 | 0바이트 첨부가 「20MB를 넘을 수 없습니다」로 거절되고, 그 케이스만 오류 코드를 안 본다 | `tests/modules/community/storage.test.ts:64` | 통독 |
| RL-31 | 엑셀 날짜 일련번호 갈래는 테스트 이름만 있고 실제로는 한 번도 안 태운다 | `tests/modules/enrollment/roster.parse.test.ts:56` | 통독 |
| RL-32 | 학부모 코드 발급 화면의 학생 목록만 role: STUDENT를 다시 좁히지 않는다 | `tests/modules/invites/invite.repo.test.ts:53` | 통독 |
| RL-33 | +82 표기 케이스가 호출 전에 스스로 치환돼 아무것도 검증하지 않는다 | `tests/lib/masks.test.ts:23` | 통독 |
| RL-34 | 익명 가리기를 지나는 대시보드·게시판 목록 경로 두 개가 테스트에 하나도 안 걸려 있다 | `tests/modules/community/post.service.test.ts:22` | 통독 |
| RL-35 | 「primary key 이름으로 와도」 테스트가 실제로는 제약 이름 인식 경로를 타지 않는다 | `tests/modules/merit/merit.repo.update.test.ts:150` | 통독 |
| RL-36 | 「취소분은 어느 집계에도 안 든다」 pin 목록에서 unusedRules만 빠져 있다 | `tests/modules/merit/merit.repo.totals.test.ts:437` | 통독 |
| RL-37 | STALE 테스트 주석이 「두 스텝」이라 적혀 있으나 코드는 세 스텝(60초) 뒤를 본다 | `tests/modules/pass/verify.service.test.ts:114` | 통독 |

---

## 5. 이 방법이 무엇을 잘하고 무엇을 못 하나

세 번째 감사이므로 방법 자체의 소득을 적어 둔다.

**잘한 것.** 「검색어가 없는 결함」을 잡는다. R-01(호출부와 컴포넌트를 이어 읽어야 보임) ·
R-06(같은 파일의 형제 포맷터 셋 중 하나만 사유를 뺌) · R-07(단언이 통과할 수밖에 없음) ·
RL-26(`withTz`가 막는다고 적힌 함정을 정적 import라 실제로는 못 막음)은 어떤 grep으로도
질의를 세울 수 없다. 주석과 코드의 모순을 무더기로 찾은 것도 같은 이유다 — 이 저장소는
주석이 길고 근거를 많이 담아, 코드가 바뀌면 주석만 남는 일이 그만큼 잦다.

**못한 것.** 높음이 0이다. 권한 표를 가로질러 대조하거나, 설정 파일과 런타임 코드를
맞물려 보거나, 전 저장소에서 같은 패턴의 개수를 세는 일은 통독이 아니라 검색이 잘한다.
`docs/deploy.md`대로 설치하면 명단 반영이 죽는다는 것(deep D-01)은 이 라운드가 못 찾았다 —
`.env.example` · `docker-compose.yml` · `roster.preview-token.ts` 셋을 동시에 놓고 봐야
보이는데, 그 셋은 서로 다른 에이전트에게 배정됐다.

**그래서 셋은 대체 관계가 아니다.** 모듈 축(첫 감사) · 관심사 축(deep) · 파일 순서 축
(이 문서)이 각자 다른 것을 잡는다. 다음에 한 번만 돌린다면 관심사 축이 가장 효율이
좋았고(높음 1 + 중간 17), 통독은 **주석·문서가 코드와 어긋나기 시작할 때** 다시 돌릴
값이 있다.

## 6. 사람이 정해야 할 것

앞의 두 문서가 올린 항목들이 그대로 남아 있고, 이 문서가 새로 더하는 것은 없다.
다만 R-01은 확인 모달을 붙인 이유(되돌릴 수 없는 동작 앞에 한 번 더 묻는다) 자체를
무력화하므로, 사람의 판단이 아니라 그냥 고칠 일이다.
