# 세로 조각 통독 감사 — 2026-09-01

> **이 문서는 검사 시점의 스냅샷이다.** 제품 코드는 고치지 않았다.
> 앞선 [`2026-09-01-full-read-audit.md`](2026-09-01-full-read-audit.md)와 **읽는 방법이 같고 나누는 축이 다르다** —
> 그쪽은 파일 경로 순서로 8등분했고, 이쪽은 **기능 세로줄로 25등분**했다.
> 기준선도 다르다: 그쪽은 `bc7d64f`, 이쪽은 그 감사들의 확정분을 고친 뒤다.

기준선: `main @ 2c32b44`

## 1. 범위와 방법

`git ls-files`가 주는 추적 파일에서 생성물(`src/generated/`)·감사 문서(`docs/`)·벤더 스킬 문서
(`.agents/`·`.claude/`·`.windsurf/` 94개)·`package-lock.json`·이미지를 뺀 **555개 파일 81,143줄**을
**기능 세로줄 25조각**으로 나눠, 조각마다 에이전트 셋이 차례로 붙었다 —
**통독 → 보완 통독 → 반증**. 확정분은 마지막에 지난 감사 문서와 대조했다.
에이전트 102개다(본 실행 99 + `roster-3` 후속 실행 3).

### 왜 세로로 갈랐나

지난 통독은 78,598줄을 경로 순서로 8등분했고(에이전트당 약 10,000줄), 그 문서 스스로
한계를 적어 두었다 — **「통독은 D-01을 못 찾았다(관련 파일 셋이 서로 다른 에이전트에게
갔다)」.** 배포 실패를 보려면 `Dockerfile`·`docker-compose.yml`·`docs/deploy.md`가 한 손에
있어야 하는데 경로 순서로 자르면 셋이 흩어진다.

이번에는 모듈·화면·컴포넌트·테스트를 **기능별로 묶어** 한 에이전트에게 주고, 조각 크기를
평균 3,250줄로 줄였다. `infra` 조각은 배포에 관계된 파일 27개를 통째로 쥐고 「`docs/deploy.md`
대로 설치했다고 가정하고 배포 경로를 끝까지 따라가라」는 임무를 따로 받았고, `core`·`ui`
조각은 「호출부를 훑어 규격이 갈라진 자리를 찾으라」는 임무를 받았다.

**그 설계가 이 라운드의 유일한 「높음」을 냈다** — 배포 문서가 시키는 대로 만든 비밀번호에
`/`가 들어가면 도커 배포가 통째로 뜨지 않는다(§3). 세 파일을 함께 읽어야만 보이는 결함이고,
경로 순서로 잘랐다면 이번에도 흩어졌을 자리다.

### 커버리지

| 조각 | 무엇 | 파일 | 줄 | 통독 | 재독 | 요약 지적 | 주장 |
|---|---|---:|---:|---:|---:|---:|---:|
| `infra` | 배포·빌드·런타임 설정 | 27 | 1,681 | 27 | 27 | — | 13 |
| `data` | 데이터 모델·마이그레이션·시드·프로젝트 문서 | 32 | 3,141 | 32 | 32 | 2 | 21 |
| `core-1` | 인증 세션·권한 판정·공용 유틸 (1/2) | 36 | 2,597 | 36 | 36 | 1 | 15 |
| `core-2` | 인증 세션·권한 판정·공용 유틸 (2/2) | 23 | 2,420 | 23 | 23 | — | 19 |
| `auth-1` | 로그인·가입·인증코드·초대·계정 (1/3) | 35 | 3,527 | 35 | 35 | 1 | 19 |
| `auth-2` | 로그인·가입·인증코드·초대·계정 (2/3) | 21 | 3,480 | 21 | 21 | 2 | 16 |
| `auth-3` | 로그인·가입·인증코드·초대·계정 (3/3) | 19 | 3,380 | 19 | 19 | 1 | 21 |
| `merit-1` | 상벌점 (1/5) | 24 | 3,761 | 24 | 24 | — | 13 |
| `merit-2` | 상벌점 (2/5) | 25 | 3,806 | 25 | 25 | 2 | 21 |
| `merit-3` | 상벌점 (3/5) | 11 | 3,908 | 11 | 11 | — | 15 |
| `merit-4` | 상벌점 (4/5) | 9 | 3,835 | 9 | 9 | — | 26 |
| `merit-5` | 상벌점 (5/5) | 13 | 3,459 | 13 | 13 | 2 | 20 |
| `pass-1` | 전자출입증·판독 (1/3) | 33 | 3,391 | 33 | 33 | — | 24 |
| `pass-2` | 전자출입증·판독 (2/3) | 23 | 3,674 | 23 | 23 | — | 15 |
| `pass-3` | 전자출입증·판독 (3/3) | 13 | 2,932 | 13 | 13 | — | 21 |
| `community-1` | 커뮤니티 (1/2) | 41 | 4,163 | 41 | 41 | — | 21 |
| `community-2` | 커뮤니티 (2/2) | 19 | 3,930 | 19 | 19 | 1 | 17 |
| `roster-1` | 학년도·명단·학생 (1/3) | 28 | 4,292 | 28 | 28 | — | 17 |
| `roster-2` | 학년도·명단·학생 (2/3) | 19 | 3,925 | 19 | 19 | 3 | 16 |
| `roster-3` | 학년도·명단·학생 (3/3) | 9 | 3,434 | 9 | 9 | — | 24 |
| `adminops-1` | 계정 관리·감사로그 열람·설정 (1/2) | 23 | 3,292 | 23 | 23 | 3 | 19 |
| `adminops-2` | 계정 관리·감사로그 열람·설정 (2/2) | 12 | 2,646 | 12 | 12 | 1 | 17 |
| `ui-1` | 공용 UI 컴포넌트·앱 셸 (1/2) | 23 | 2,439 | 23 | 23 | — | 21 |
| `ui-2` | 공용 UI 컴포넌트·앱 셸 (2/2) | 23 | 2,437 | 23 | 23 | — | 24 |
| `shell` | 대시보드·앱 셸 라우트·나머지 | 14 | 1,593 | 14 | 14 | 2 | 21 |
| **합계** | | **555** | **81,143** | **555** | **555** | **21** | **476** |

**배정 555 / 통독 555 / 건너뜀 0.** 통독을 실제로 했는지가 이 라운드의 전제이므로 증거를
셋 두었다.

1. **파일별 한 줄 요약.** 조각마다 배정 파일 전부에 대해 「그 파일을 열지 않고는 쓸 수 없는」
   한 문장을 남기게 했다. **25조각 전부에서 배정 파일 이름이 모두 등장하는 것을 기계로
   대조했다** — 자기 신고가 아니다.
2. **보완 통독.** 같은 조각을 두 번째 에이전트가 다시 읽으면서 첫 요약이 파일 내용과
   어긋나거나 공허한 것을 지적하게 했다. **21건이 걸렸다.**
3. **반증.** 결함마다 세 번째 에이전트가 인용된 파일을 직접 열어 현재 코드를 옮겨 적고,
   그 인용이 주장을 재현하지 못하면 기각하게 했다.

배정분은 하나도 건너뛰지 않되 문맥이 필요하면 담당 밖 파일을 여는 것은 권장했다.
지난 감사들과 같이 `docs/reviews/`는 읽지 못하게 막아 독립적인 눈을 유지했다
(`docs/deploy.md`는 감사 문서가 아니라 설치 절차이므로 `infra` 조각에 넣었다).

**빠진 곳 하나를 밝힌다.** `roster-3`의 보완 통독이 본 실행에서 API 오류로 죽어, 그 조각만
후속 실행으로 따로 채웠다. 커버리지에는 영향이 없다(통독·재독 모두 9/9).

## 2. 결과 요약

| 구분 | 수 |
|---|---:|
| 높음 | 1 |
| 중간 | 49 |
| 낮음 | 353 |
| **합계** | **403** |

이 중 5건은 지난 감사에서 **고치지 않기로 정한** 것이라 §6.1로 뺐다 —
§3~§5에 실제로 실린 것은 398건이다.

원시 주장 **476건** → 반증에서 **50건 기각**(11%) → 확정·격하 426건 →
같은 결함 **23건을 접어** 403건. 격하가 44건 포함돼 있다.

| 갈래 | 수 |
|---|---:|
| 신규 | 320 |
| 기존 감사가 확정했으나 아직 안 고친 것 | 76 |
| 기존 감사가 **고치지 않기로 정한** 것 | 5 |
| 고쳤다고 기록됐는데 다시 있는 것 | 2 |

**269건(67%)이 검색으로는 닿지 않는 종류다** — 표에서 ● 표시.
한 함수 안에서 앞뒤가 안 맞는 곳, 파일 위쪽 주석이 약속한 것을 아래쪽 코드가 어기는 곳,
비슷한 블록 여럿 중 하나만 다른 곳, 통과할 수밖에 없어 아무것도 지키지 못하는 단언이다.

종류별: 정합성 66 · 권한 4 · 감사로그 17 · 경쟁상태 5 · 계층규약 7 · 테스트 119 · 오류문구 16 · 문구 59 · 디자인 36 · 접근성 21 · 죽은코드 44 · 설정 9.

**13건은 서로 다른 조각 둘 이상이 독립적으로 같은 곳에 도달했다.** 세로로 갈라도
공용 코드는 여러 조각의 시야에 함께 들어온다는 뜻이고, 근거가 보강된 것으로 읽으면 된다.

### 확정률을 그대로 적는다

기각률이 **11%**다. 이 저장소는 직전 검증 라운드의 확정률 210/212를 스스로
「신뢰도가 낮다」고 기록했고, 이번 수치도 그 수준에서 크게 벗어나지 않는다.

이번 반증이 그때와 다르게 한 것은 셋이다 — 반증자가 **인용된 파일을 열어 현재 코드를
옮겨 적게** 했고(인용이 재현되지 않으면 기각), 통독자 여럿이 **소스에 변이를 넣고 실제로
단위 스위트 2,281건을 돌려** 「이 변이가 통과한다」를 확인했으며, 기각 사유가 실질적이다
(`import type`이 트랜스파일에서 지워지므로 런타임 해석이 없다 · `position:fixed`의 폭은
`max-width`가 아니라 shrink-to-fit로 정해진다 · 상위 라우트가 먼저 400으로 떨어뜨린다).

**약한 자리도 그대로 적는다.** `roster-3` 후속 실행은 주장 10건을 하나도 기각하지 않았다 —
한 조각에 반증자가 하나뿐이라 표본이 작고, 그 10건은 다른 24조각보다 검증이 얕다고 보는 편이 옳다.

**한 라운드는 자기 검증자를 검증하지 못한다.** 낮음 353건에는 판단이 갈릴 것이
섞여 있고, 이 문서는 그것을 「확정」이라 부르되 확정률이 높다는 사실을 함께 남긴다.

---

## 3. 확정 결함 — 높음 (1건)

### infra-R01 · compose가 DATABASE_URL을 퍼센트 인코딩 없이 조립해, 문서가 시키는 대로 만든 비밀번호에 `/`가 들어가면 migrate·app이 통째로 뜨지 않는다

**위치:** `docker-compose.yml:51` · `.env.example:8`　— 같은 뿌리에서 나온 자리를 함께 접었다 (infra-R02)

```
docker-compose.yml:50-51
    environment:
      DATABASE_URL: postgresql://${POSTGRES_USER:-gbsw}:${POSTGRES_PASSWORD:?POSTGRES_PASSWORD를 .env에 설정해야 합니다}@db:5432/${POSTGRES_DB:-gbsw}

docs/deploy.md:49-50
# 비밀번호와 세션 키는 반드시 새로 만든다
openssl rand -base64 24    # POSTGRES_PASSWORD 에 넣는다
```

docs/deploy.md §1(50행)과 .env.example 8행이 모두 `openssl rand -base64 24`로 POSTGRES_PASSWORD를 만들라고 지시한다. base64 알파벳에는 `/`가 있고 24바이트는 32글자라 `/`가 최소 한 번 나올 확률이 약 40%다(실제로 openssl을 5회 돌려 2회 나왔다). `/`는 URL의 authority를 끝내는 문자라 `postgresql://gbsw:C4y6.../ZRYh@db:5432/gbsw`는 authority가 `gbsw:C4y6...`에서 잘리고 나머지가 경로가 된다. db 컨테이너 자체는 POSTGRES_PASSWORD를 문자열 그대로 받으므로 healthy가 되고, 그 다음 migrate가 즉시 죽는다 — 실측: `npx prisma migrate deploy` → `Error: P1013: The provided database string is invalid. invalid port number in database URL.`, `new pg.Pool({connectionString})`(core/db/client.ts가 PrismaPg에 넘기는 그 값) → `Invalid URL`. app은 `depends_on: migrate: service_completed_successfully`라 영영 뜨지 않는다. 오류 문구가 포트를 탓하므로 운영자가 비밀번호를 의심할 단서가 없다. `+`와 `=`는 안전함을 따로 확인했으므로 원인은 슬래시 하나다.

**고치기:** 문서·예시가 지시하는 생성법을 URL 안전한 것으로 바꾼다(`openssl rand -hex 24`, 또는 `openssl rand -base64 24 | tr -d '/+='`). .env.example 8행·docs/deploy.md 50행을 함께 고치고, compose의 이 줄과 86행 위에 「비밀번호에 `/`를 쓰면 접속 문자열이 깨진다」를 한 줄로 못 박는다.

---

## 4. 확정 결함 — 중간 (48건)

### adminops-1-R01 · 계정 조치의 사유가 감사로그에 「reason 전학」처럼 날것으로 찍히거나 아예 사라진다

**위치:** `src/modules/audit-log/audit-log.labels.ts:489`　— 같은 결함을 `adminops-1`·`adminops-2` 조각이 각각 잡았다 (adminops-2-R01)

```
audit-log.labels.ts:482-489
/**
 * **사유를 받는 액션은 `reasonPart()`를 붙인다.** 「왜」는 되돌리는 화면이 없는
 * 기록일수록 로그에만 남는 조각이라, 갈래마다 따로 쓰면 하나씩 빠진다.
 */
const METADATA_FORMATTERS: Partial<
  Record<AuditAction, (metadata: Record<string, unknown>) => string | null>
> = {
  "user:update": (m) => changedSummary(m.changed),

admin-user.service.ts:143-150
      await recordAudit({
        actorUserId: actor.id,
        action: "user:update",
        targetType: "User",
        targetId: userId,
        // 바뀐 값이 아니라 바뀐 항목 이름만 남긴다.
        metadata: { changed, reason },
      }, tx);

admin-user.service.ts:190-196
    await recordAudit({
      actorUserId: actor.id,
      action: active ? "user:activate" : …
```

이 파일 482~485행이 「사유를 받는 액션은 reasonPart()를 붙인다」고 못 박고, 396~399행은 그 갈래가 없으면 「reason 잘못 발급」처럼 날것으로 찍힌다고 증상까지 적어 두었다. 그런데 사유를 받는 네 액션이 규칙 밖에 있다 — `user:update`는 서비스가 `metadata: { changed, reason }`을 남기는데(admin-user.service.ts:149) 이 포매터가 `changed`만 읽어 교사가 적은 사유가 화면 어디에도 안 나오고, `user:activate`·`user:deactivate`(admin-user.service.ts:195)와 `user:reset-password`(admin-user.service.ts:237)는 `metadata: { reason }`만 남기는데 METADATA_FORMATTERS에 갈래가 없어 기본 나열로 떨어진다. 교사가 「전학」이라 적고 계정을 비활성화하면 감사로그 상세 칸에 「reason 전학」이 그대로 선다. 계정 상세의 활동 기록(admin/users/[userId]/page.tsx:193)도 같은 함수를 쓰므로 두 화면에서 같이 보인다. 커뮤니티의 `community:delete`도 `metadata: { slug, name, reason }`을 남기는데 포매터가 없어 같은 증상이다.

**고치기:** `user:update` 포매터를 `changedSummary` + `reasonPart` 합성으로 바꾸고, `user:activate`·`user:deactivate`·`user:reset-password`(그리고 `community:delete`)에 `reasonSummary`를 등록한다.

> **지난 감사와 겹친다** — 2026-08-31-codebase-audit-deep.md DL-20

---

### adminops-1-R02 · 감사로그 「기간」 라벨이 `<div>`를 가리켜 네 버튼 중 어느 것도 이름을 못 받는다

**위치:** `src/app/(app)/admin/logs/log-filters.tsx:58`　— 같은 결함을 `adminops-1`·`adminops-2` 조각이 각각 잡았다 (adminops-2-C08)

```
log-filters.tsx:56-70
      <div className="mt-3 flex flex-wrap items-end gap-x-4 gap-y-3">
        <div>
          <Label htmlFor="log-period">기간</Label>
          <Segmented id="log-period">
            {AUDIT_PERIODS.map((p) => (
              <SegmentButton
                key={p}
                active={period === p}
                onClick={() => apply({ period: p })}
              >
                {PERIOD_LABEL[p]}
              </SegmentButton>
            ))}
          </Segmented>
        </div>

segmented.tsx:16-31
export function Segmented({ className, children, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn("inline-flex max-w-full items-center …
```

바로 다음 줄이 `<Segmented id="log-period">`인데 `Segmented`는 `<div>`를 낸다(components/ui/segmented.tsx:22). `<label for>`는 labelable 요소(input·select·textarea·button·output·meter·progress)만 가리킬 수 있어 이 라벨은 아무것도 안 묶는다 — 클릭해도 초점이 옮겨가지 않고, 스크린리더 사용자에게는 「오늘/7일/30일/전체」 네 버튼이 무엇을 고르는 것인지 알릴 길이 없다. 바로 옆 「동작」은 실제 `<select id="log-action">`을 가리켜 정상이라, 한 줄 안에서 둘만 다르다. 같은 저장소가 같은 모양을 옳게 푼 자리가 있다 — pass/new/request-form.tsx:46은 세그먼티드를 `<fieldset>`+`<legend>`로 묶는다.

**고치기:** `<fieldset>`+`<legend>`로 감싸거나, `Segmented`에 `role="group" aria-label="기간"`을 주고 `<Label htmlFor>` 대신 보이는 제목을 `<span>`으로 둔다.

> **지난 감사와 겹친다** — 2026-08-31-codebase-audit-deep.md DL-40

---

### auth-1-C01 · 가입 1단계의 가입코드 칸만 제출값을 되심지 않아, 코드 확인에 실패하면 12자리 코드를 처음부터 다시 친다

**위치:** `src/app/(auth)/register/register-flow.tsx:60`

```
src/app/(auth)/register/register-flow.tsx:59-69
      <Label htmlFor="code">가입코드</Label>
      <MaskedInput size="lg"
        id="code"
        name="code"
        placeholder="GBSW-0000-0000"
        autoComplete="off"
        autoCapitalize="characters"
        required
        format={formatInviteCodeInput}
        className="mb-6 font-mono"
      />

src/app/(auth)/register/actions.ts:105-107
  } catch {
    return { code: null, role: null, error: "쓸 수 없는 가입코드입니다." };
  }
```

이 저장소의 폼은 전부 「React 19가 액션이 끝난 폼을 리셋하므로 제출값을 상태에 실어 defaultValue로 되심는다」를 지키고, bootstrap-form.tsx·register-flow.tsx의 2단계·invite-form.tsx 세 폼이 그 주석을 나란히 달고 있다. 그런데 1단계 CodeStep의 이 칸만 value도 defaultValue도 없는 비제어 입력이다(masked-input.tsx는 value를 안 주면 그대로 비제어다). checkInviteAction은 실패하면 `{ code: null, role: null, error }`를 돌려주고, RegisterFlow는 CodeStep에 formAction·pending·error만 넘기므로 되심을 값이 애초에 닿지도 않는다. 결과: 학부모가 폰에서 GBSW-A3K9-2M7P를 치다 한 글자를 틀리면 「쓸 수 없는 가입코드입니다」와 함께 칸이 통째로 비고 12자를 다시 친다. CheckInviteState에 `code` 필드가 이미 있는데 성공 경로에서만 채우는 것이 이 누락의 흔적이다.

**고치기:** checkInviteAction의 실패 반환에 제출한 코드를 실어(`{ code: null, role: null, error, values: { code: String(formData.get("code") ?? "") } }` 식) RegisterFlow가 CodeStep에 넘기고, MaskedInput에 defaultValue로 되심는다. 다른 네 폼과 같은 모양이 된다.

---

### auth-1-C02 · checkInviteAction의 빈 catch가 예상 못 한 오류까지 로그 없이 「쓸 수 없는 가입코드입니다」로 바꾼다

**위치:** `src/app/(auth)/register/actions.ts:105`

```
src/app/(auth)/register/actions.ts:102-108
  try {
    const { role } = await checkInvite(parsed.data);
    return { code: parsed.data, role, error: null };
  } catch {
    return { code: null, role: null, error: "쓸 수 없는 가입코드입니다." };
  }
}
```

같은 파일의 다른 네 액션(completeRegistrationAction:155, requestVerificationAction:201, confirmVerificationAction:224·244)과 옆 모듈의 액션들(admin/invites/actions.ts:48, parent-invite/actions.ts:55)은 모두 「여기서 안 남기면 원인이 어디에도 없다」는 주석과 함께 console.error를 남기는데, 이 액션만 오류 객체를 통째로 버린다. checkInvite는 repo.findInviteByCode로 DB를 치므로 Postgres 연결 실패·Prisma 오류가 그대로 이 catch에 떨어지고, 그러면 멀쩡한 코드를 가진 학생·학부모가 「쓸 수 없는 가입코드입니다」를 보고 교사에게 재발급을 요청하는데 서버 로그에는 한 줄도 없다. 부수적으로, checkInvite가 던지는 RegistrationError의 message("가입코드 또는 입력한 정보가 맞지 않습니다.")를 액션이 그대로 화면에 흘린다는 오류 규약도 이 자리만 어긴다. 첫 통독의 R05는 「최초 교사 생성 액션만 로그 없이 삼킨다」고 적었는데 이 자리가 두 번째다 — R05의 「만」이 사실이 아니다.

**고치기:** RegistrationError만 골라 그 message를 그대로 돌려주고, 그 밖의 오류는 `console.error("[registration] 가입코드를 확인하지 못했습니다.", error)`를 남긴 뒤 일반 문구로 떨어뜨린다. completeRegistrationAction의 catch와 같은 모양으로 맞춘다.

> **지난 감사와 겹친다** — 2026-08-31-codebase-audit-deep.md DL-32

---

### auth-1-R01 · 발급·폐기 액션이 redirect 스텁뿐인 /admin/invites를 revalidate한다 — 목록을 그리는 /admin/users는 무효화되지 않는다

**위치:** `src/app/(app)/admin/invites/actions.ts:100`

```
src/app/(app)/admin/invites/actions.ts:98-101
  try {
    const invite = await createStudentInvite(actor, parsed.data);
    revalidatePath("/admin/invites");
    return { error: null, code: formatInviteCode(invite.code) };

(같은 파일 137·177행도 revalidatePath("/admin/invites") 하나뿐,
 204-206행: // 교사 목록과 학생의 학부모 코드 목록 양쪽에서 쓰인다.
            revalidatePath("/admin/invites");
            revalidatePath("/parent-invite");)

src/app/(app)/admin/invites/page.tsx:7-9
export default function InvitesRedirect() {
  redirect("/admin/users?tab=invites");
}

src/app/(app)/admin/users/page.tsx:41
      {tab === "invites" && <InvitesPanel />}
```

초대 화면이 `/admin/users?tab=invites`로 옮겨지면서 `src/app/(app)/admin/invites/page.tsx`는 `redirect("/admin/users?tab=invites")` 한 줄만 남았고, `InvitesPanel`을 실제로 렌더하는 것은 `src/app/(app)/admin/users/page.tsx:41`이다. 그런데 이 파일의 네 액션(100·137·177·205행)은 전부 `/admin/invites`만 revalidate한다 — 즉 코드를 발급하거나 폐기한 뒤 목록이 붙어 있는 경로는 한 번도 무효화되지 않는다. `panel.tsx:142`의 주석은 「발급·폐기 뒤 revalidate에서도 이 경계가 다시 매달린다」를 전제로 Suspense key를 뺐는데 그 전제가 성립하지 않는다. 지금 화면이 우연히 갱신되더라도 그것은 Next 문서가 "This behavior is temporary"라고 못박은 과잉 무효화(`revalidatePath`가 방문했던 페이지 전부를 새로 고치는 동작)에 기댄 것이다. 같은 트리의 `src/app/(app)/admin/users/actions.ts:69`는 `/admin/users`를 제대로 revalidate하고 있어 이 파일만 옛 경로에 머물러 있다.

**고치기:** 네 액션의 `revalidatePath("/admin/invites")`를 `revalidatePath("/admin/users")`로 바꾼다. `revokeInviteAction`의 `revalidatePath("/parent-invite")`는 학생 화면 경로가 그대로라 맞으므로 남긴다.

> **지난 감사와 겹친다** — 2026-08-31-codebase-audit-deep.md DL-34 (DL-30의 나머지 범위)

---

### auth-1-R02 · Better Auth 화이트리스트가 sign-in/email을 열어 둬 감사로그 없는 로그인 경로가 남는다

**위치:** `src/app/api/auth/[...all]/route.ts:11`

```
src/app/api/auth/[...all]/route.ts:9-19
const SAFE_ENDPOINTS: Record<string, ReadonlySet<string>> = {
  GET: new Set(["get-session"]),
  POST: new Set(["get-session", "sign-in/email", "sign-out"]),
};

/**
 * Better Auth의 raw mutation endpoint를 앱 밖으로 열지 않는다.
 *
 * 이 앱은 로그인·세션조회·로그아웃만 Better Auth 라우트로 쓴다. ...
```

앱 안의 로그인 경로 셋은 모두 이 라우트를 지나지 않는다 — `src/app/(auth)/login/submit/route.ts:213`은 `auth.handler(new Request(...))`를 프로세스 안에서 직접 부르고, `src/app/(auth)/register/actions.ts:252`의 `signInSilently`는 `auth.api.signInEmail`을 쓰며, `authClient.signIn.email`을 부르는 화면은 저장소에 하나도 없다(`auth-client.ts`를 쓰는 곳은 `sign-out-button.tsx` 하나뿐). 그런데 이 항목 때문에 `POST /api/auth/sign-in/email`이 그대로 열려 있어, 아이디·비밀번호를 가진 요청은 `/login/submit`을 건너뛰고 세션을 만들 수 있고 그 경로에는 `auth:login`도 `auth:login-failed`도 남지 않는다. 반복 실패도 마찬가지라 감사로그로 자격증명 대입 시도를 되짚는 일이 통째로 우회된다. 파일 주석이 말하는 「이 앱은 로그인·세션조회·로그아웃만 Better Auth 라우트로 쓴다」가 로그인에 한해 더는 사실이 아니며, `/login/submit`의 주석이 「세션이 생기는 순간만 비어 있었다」며 메운 자리를 이 항목이 도로 연다.

**고치기:** `SAFE_ENDPOINTS.POST`에서 `"sign-in/email"`을 뺀다(로그인은 `/login/submit`만 남긴다). 함께 POST의 `"get-session"`도 Better Auth에 그런 POST 엔드포인트가 없어 군더더기이므로 정리한다. `tests/app/api/auth/route.test.ts:28`이 이 항목이 허용됨을 단언하고 있으니 그 기대값도 함께 뒤집는다.

---

### auth-1-R03 · 학부모 코드 한도는 교사가 만든 코드까지 세는데 학생 목록에는 자기가 만든 것만 나와, 학생이 폐기할 수 없는 코드에 막힌다

**위치:** `src/modules/invites/invite.repo.ts:88` · `src/modules/invites/invite.service.ts:135`　— 같은 결함을 `auth-1`·`auth-2` 조각이 각각 잡았다 (auth-2-C01)

```
src/modules/invites/invite.repo.ts:83-96
export async function countActiveByStudent(
  studentId: string,
  now: Date = new Date(),
  db: DbClient = prisma,
) {
  return db.invite.count({
    where: {
      studentId,
      status: "PENDING",
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
  });
}

src/modules/invites/invite.repo.ts:64-66
export async function listByStudent(studentId: string, createdById: string) {
  return prisma.invite.findMany({
    where: { studentId, createdById, role: "PARENT" },
```

한도의 분자인 `countActiveByStudent`는 `studentId`만 보고 세는데, 학생 화면의 모수인 `listByStudent`(64행)는 `where: { studentId, createdById, role: "PARENT" }`로 **자기가 만든 코드만** 준다. 교사가 초대 화면의 「학부모」 탭에서 `createParentInviteForAction`으로 학생 X에게 학부모 코드를 3개 발급하면, X의 `/parent-invite`에는 「만든 코드가 없습니다.」가 뜨는데 만들기는 `TOO_MANY_ACTIVE_INVITES`로 막히고 화면에는 `src/app/(app)/parent-invite/actions.ts:21`의 「쓰지 않은 코드가 3개 있습니다. 하나를 폐기하고 만드세요.」가 나온다 — 폐기할 코드가 목록에 없으니 학생이 따를 수 없는 지시다. 교사 코드 1개 + 학생 코드 2개처럼 섞인 경우에도 학생은 2건만 보면서 3건이 있다는 말을 듣는다.

**고치기:** 한도와 목록의 기준을 맞춘다. 학생 본인 한도라면 `countActiveByStudent`에 `createdById`를 넘겨 같은 모수로 세고, 학생당 총량 한도가 의도라면 `listByStudent`에서 `createdById` 필터를 빼 교사가 만든 코드도 보이게 하되 폐기 소유권 검사(`invite.service.ts`의 `invite.createdById === actor.id`)와 문구를 함께 손본다.

---

### auth-2-R01 · loginErrorMessage가 Object.prototype 키를 문구로 인정해 /login?loginError=constructor 요청이 로그인 화면을 깨뜨린다

**위치:** `src/app/(auth)/login/login-state.ts:18`

```
export function loginErrorMessage(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return LOGIN_ERROR_MESSAGES[value as LoginErrorCode] ?? null;
}
```

LOGIN_ERROR_MESSAGES는 평범한 객체 리터럴이라 프로토타입 체인이 살아 있다. value가 "constructor"·"toString"·"valueOf"·"hasOwnProperty"면 조회가 undefined가 아니라 함수를 돌려주고 `?? null`을 그냥 통과한다(노드로 확인: typeof f("constructor") === "function"). loginError는 URL 쿼리라 누구나 값을 정한다 — page.tsx가 `const fallbackError = loginErrorMessage(loginError)`로 받아 클라이언트 컴포넌트 LoginForm에 initialError prop으로 넘기므로, /login?loginError=constructor 를 열면 서버 컴포넌트가 함수를 직렬화하려다 터져 로그인 화면 자체가 500이 된다("__proto__"면 객체가 넘어가 React child 오류가 된다). 같은 파일의 테스트(tests/app/(auth)/login/login-state.test.ts:19)는 "forged-message"만 확인해 이 계열을 못 잡는다. 배정 밖 파일이라 함께 적는다.

**고치기:** 자기 소유 키만 인정한다 — `if (!Object.hasOwn(LOGIN_ERROR_MESSAGES, value)) return null;`를 앞에 두거나 사전을 Map으로 바꾼다. login-state.test.ts의 「알 수 없거나 배열인 값은 무시한다」에 "constructor"·"toString" 사례를 추가한다.

---

### auth-3-C01 · registerFailedAttempt의 「한계 미만이면 폐기하지 않는다」 조기 반환을 타는 테스트가 하나도 없다

**위치:** `tests/modules/registration/registration.repo.test.ts:123`

```
inviteUpdate.mockResolvedValue({ failedAttempts: 5 });
```

describe("registerFailedAttempt()")의 두 테스트가 모두 failedAttempts를 5로, maxAttempts를 5로 두어 `if (updated.failedAttempts < maxAttempts) return { revoked: false };`(registration.repo.ts:57)를 한 번도 실행하지 않는다. beforeEach의 기본값 `{ failedAttempts: 1 }`은 두 테스트가 모두 덮어쓴다. 그 줄을 지우는 변이는 이 파일도, registration.service.test.ts(repo를 목으로 갈아끼운다)도, 통합 테스트도 잡지 못한다. 결과는 즉각적이다 — 학생이 생년월일을 한 번 오타 내면 그 자리에서 초대코드가 REVOKED가 되고, 교사가 새 코드를 발급해 주기 전까지 가입할 수 없다.

**고치기:** `inviteUpdate.mockResolvedValue({ failedAttempts: 1 })`로 한계 미만 한 건을 추가해 `resolves.toEqual({ revoked: false })`와 `expect(inviteUpdateMany).not.toHaveBeenCalled()`를 함께 단언한다.

---

### auth-3-C02 · verifyPassword가 {status:false}로 resolve하는 경로가 없어 「현재 비밀번호가 틀리면 막는다」의 주 경로가 미검증이다

**위치:** `tests/modules/account/account.service.test.ts:49`

```
verifyPassword.mockReset().mockResolvedValue({ status: true });
```

account.service.ts는 틀린 비밀번호를 두 모양으로 받는다 — 던지는 경우(`isInvalidPasswordError`)와 `{ status: false }`로 resolve하는 경우(`if (result.status !== true) throw new InvalidCurrentPasswordError()`, 45행). 이 파일은 전자만 시험한다(99행 `verifyPassword.mockRejectedValue(new Error("INVALID_PASSWORD"))`). `{ status: false }`를 주는 테스트가 없어 45행은 스위트 전체에서 한 번도 실행되지 않는다. 그 줄을 지우거나 `status === false`로 잘못 좁히는 변이는 7개 테스트를 모두 통과하며, Better Auth가 거절을 예외가 아니라 `{status:false}`로 돌려주는 배포에서는 **틀린 현재 비밀번호로도 비밀번호가 바뀐다**. 서비스가 두 모양을 다 다루는 것 자체가 후자가 실재함을 말한다.

**고치기:** `verifyPassword.mockResolvedValue({ status: false })`인 테스트를 더해 `rejects.toThrow(InvalidCurrentPasswordError)`와 `updateOwnPassword`·`recordAudit` 미호출을 단언한다.

---

### auth-3-R01 · IP 한도 통합 테스트가 제 머리말이 「일어난다」고 적은 maxWait 거부를 금지하는 단언을 달고 있다

**위치:** `tests/integration/verification.rate-limit.integration.test.ts:104`

```
// 거부된 것이 있다면 이유는 언제나 한도다 — 다른 이유로 죽고 있으면 잡는다.
    for (const result of results) {
      if (result.status === "rejected") {
        expect(result.reason).toBeInstanceOf(VerificationError);
        expect(result.reason.message).toContain("너무 많이");
      }
    }
```

같은 파일 74~78행의 머리말이 「한도+1을 한꺼번에 던지면 연결 풀이 모자라 늦게 줄 선 몇 개가 제한이 아니라 maxWait에 걸려 밀린다 … 실제로 서너 번에 한 번 16으로 떨어졌다」고 적어 두었다. 그 상황을 계산해 보면 모순이 드러난다 — 대상이 전부 다른 61건이 같은 IP로 들어오는데 만들어진 행이 16개뿐이었다면, 어떤 트랜잭션도 `recentByIp >= MAX_SENDS_PER_HOUR_PER_IP`를 볼 수 없었으므로 그 실패들은 VerificationError가 아니라 Prisma의 P2024/P2028이다. 즉 머리말이 「일어난다」고 인정한 바로 그 조건에서 102~105행이 터진다. 관측 당시 한도는 20(21건 동시)이었고 지금은 60(61건 동시)이라 압력은 세 배로 커졌다. 느린 CI에서 npm run verify가 「다른 이유로 죽고 있다」는 오해를 부르는 메시지로 실패하고, 진짜 회귀(잠금이 풀려 한도를 넘김)와 구분되지 않는다. 로컬 5회 연속 통과는 이 기계가 머리말이 말하는 기계가 아니라는 뜻일 뿐이다.

**고치기:** 동시 발사 수를 커넥션 풀 크기 아래로 줄여 모든 호출이 트랜잭션에 들어가게 하거나(그러면 「정확히 한도만큼 성공」도 다시 셀 수 있다), 이 루프를 「VerificationError인 거부는 문구가 「너무 많이」여야 한다」로 좁히고 그 밖의 거부는 개수만 기록해 넘긴다. 어느 쪽이든 머리말과 단언이 같은 말을 하게 맞춘다.

---

### community-1-C01 · 댓글 작성이 실패하면 입력한 댓글 본문이 통째로 사라진다

**위치:** `src/app/(app)/community/[slug]/actions.ts:166`

```
let result: { slug: string; postId: string };
  try {
    result = await commentService.createComment(actor, parsed.data);
  } catch (error) {
    return fail(toMessage(error));
  }
```

이 저장소는 「React 19가 액션이 끝나면 성공·실패를 가리지 않고 폼을 reset()한다」를 세 곳에 적어 두고(admin/community/action-state.ts:1-4, community/[slug]/action-state.ts:1-6, community-form.tsx:48-52, post-form.tsx:68-70) 그 대책으로 실패 응답에 제출값(values)을 실어 defaultValue로 되돌린다. createPostAction·updatePostAction은 fail(…, submitted)로 그렇게 하는데 createCommentAction만 values를 안 싣고, comment-form.tsx:40-47의 <Textarea name="body">에는 defaultValue도 제어 state도 없다(대안인 제어 방식은 pass/new/request-form.tsx:173-183이 쓴다). 그래서 2000자 댓글을 쓴 뒤 글이 그 사이 지워졌거나(POST_NOT_FOUND) 게시판이 읽기 전용으로 얼려 ForbiddenError가 나면, 화면에는 오류 한 줄만 뜨고 입력칸은 비워진다.

**고치기:** createCommentAction의 실패 경로를 `return fail(toMessage(error), values(formData))`로 바꾸고 comment-form.tsx의 Textarea에 `defaultValue={state.values?.body}`를 준다. 파싱 실패 경로(159행)도 함께 고친다.

---

### community-1-C03 · PDF가 아닌 첨부만 next/link로 API 라우트를 가리켜 목록이 보이기만 해도 서버가 파일을 통째로 읽고 클릭하면 두 번 읽는다

**위치:** `src/app/(app)/community/[slug]/[postId]/attachment-list.tsx:99`

```
if (file.mimeType === "application/pdf") {
    // 새 탭에서 연다 — 같은 탭이면 뷰어가 글을 덮어 뒤로가기로만 돌아온다.
    return (
      <a
        href={href(file.id, file.filename)}
        target="_blank"
        rel="noopener noreferrer"
        className={className}
      >
        {file.filename}
        {size}
      </a>
    );
  }

  return (
    <Link href={href(file.id, file.filename)} className={className}>
      {file.filename}
      {size}
    </Link>
  );
```

바로 위 형제 분기(83-95행)의 PDF는 `<a href>`인데 나머지(한글·오피스·zip·txt, 파일당 최대 20MB)만 next/link다. Link는 앱 라우트용이라 화면에 들어오는 순간 프리페치를 건다(node_modules/next/dist/docs/01-app/02-guides/prefetching.md: 「As each <Link> enters the viewport, Next.js prefetches the route behind it」) — 그 요청이 GET /api/community/attachments/<id>/<이름>에 그대로 닿고, getDownload(attachment.service.ts:216)가 readAttachment로 파일 전체를 Buffer에 올린 뒤 응답을 만든다. 누르면 응답이 RSC 페이로드가 아니라 클라이언트 내비게이션이 하드 내비게이션으로 떨어져 같은 읽기가 한 번 더 일어난다. mem_limit 512m 컨테이너에서 첨부 다섯 개짜리 글 하나를 여는 것만으로 100MB 읽기가 예고 없이 돈다.

**고치기:** PDF 분기와 같이 `<a href={href(file.id, file.filename)}>`로 바꾼다(Content-Disposition이 이미 내려받기를 정하므로 download 속성은 여전히 필요 없다).

---

### community-1-R01 · 고아 첨부 정리가 DB 행과 디스크 파일을 지우면서 감사로그를 한 줄도 남기지 않는다

**위치:** `src/modules/community/attachment.service.ts:172`

```
async function sweepMyOrphans(uploaderUserId: string): Promise<void> {
  try {
    const stale = await repo.listStalePending(
      uploaderUserId,
      new Date(Date.now() - PENDING_TTL_MS),
    );
    if (stale.length === 0) return;

    await repo.deleteAttachments(stale.map((a) => a.id));
    for (const attachment of stale) {
      await deleteAttachment(attachment.storageKey, attachment.createdAt);
    }
  } catch {
    // 청소 실패는 업로드를 막지 않는다.
  }
}
```

업로드마다 먼저 도는 sweepMyOrphans는 1시간 넘은 미결 첨부의 CommunityAttachment 행을 지우고 이어서 디스크 파일까지 rm 한다. 되돌릴 수 없는 삭제인데 recordAudit이 없다 — CLAUDE.md는 감사로그 예외를 bootstrap·verification·seed-merit-rules 셋으로 못 박았고 이 경로는 그중 어느 것도 아니다. 같은 파일이 하는 같은 일(글 수정에서 첨부를 뗄 때)은 post.service.updatePost가 파일 한 건마다 community:attachment:delete를 남기며 「이 모듈에서 되돌릴 수 없는 유일한 삭제」라고 주석에 적어 두었다. 더구나 listStalePending은 uploaderUserId가 null인 행(계정이 완전 삭제된 사람의 첨부)까지 함께 걷으므로, A가 파일 하나를 올리는 순간 B가 남긴 파일이 아무 기록 없이 사라진다. 같은 파일 148줄의 쓰기 실패 보상 삭제(repo.deleteAttachments([id]))도 마찬가지로 무기록이라, 감사로그에는 「첨부 등록」만 남고 그 첨부는 존재하지 않는다. 임시 데이터라 일부러 뺐을 여지는 있으나 그 판단이 코드·문서 어디에도 적혀 있지 않다.

**고치기:** sweepMyOrphans가 지운 행마다(또는 건수·파일명 묶음으로) community:attachment:delete를 남긴다. 정리 실패를 삼키는 성질은 유지하되 recordAudit을 같은 try 안에 둔다. 임시 데이터라 일부러 뺀 것이라면 CLAUDE.md의 감사로그 예외 목록에 네 번째 항목으로 명시한다.

> **지난 감사와 겹친다** — 2026-08-31-codebase-audit.md L-11 · 2026-08-31-codebase-audit-deep.md DL-22

---

### community-2-C01 · updatePost의 커밋 뒤 디스크 삭제 루프가 감싸이지 않아, 파일 하나가 안 지워지면 이미 저장된 수정이 「처리하지 못했습니다」로 보고된다

**위치:** `src/modules/community/post.service.ts:351`

```
// 커밋된 뒤에 디스크를 지운다.
  for (const file of detached) {
    await deleteAttachment(file.storageKey, file.createdAt);
  }
```

이 루프는 트랜잭션이 커밋된 **뒤에** 돌고 try/catch가 없다. `deleteAttachment`는 `rm(..., { force: true })`인데 force는 ENOENT만 삼키고 EACCES·EPERM·EIO·EROFS는 그대로 던지며, 그 앞의 `storagePath`도 키가 규격에 안 맞으면 `throw new Error`를 낸다. 첨부를 하나 뺀 글을 저장하는 순간 업로드 볼륨이 읽기 전용으로 마운트되거나 권한이 어긋나면: 글 본문·첨부 행 삭제·감사로그는 이미 커밋된 상태에서 `updatePost`가 거부되고, `updatePostAction`의 catch가 그것을 예상 못 한 오류로 받아 화면에 「처리하지 못했습니다」를 띄우며 `revalidatePath`·`redirect`도 돌지 않는다. 사용자는 저장이 실패한 줄 알고 다시 누르지만 이번에는 updatedAt이 이미 바뀌어 POST_CONFLICT를 본다. 남은 파일들도 안 지워지는데 행은 이미 사라졌으므로 고아 정리(`listStalePending`)가 영영 못 찾는다. 같은 모듈의 형제 자리는 전부 반대로 되어 있다 — `attachment.service.ts`의 `sweepMyOrphans`는 같은 모양의 디스크 삭제 루프를 통째로 try/catch로 감싸고(「청소 실패는 업로드를 막지 않는다」), 행 회수는 `repo.deleteAttachments([id]).catch(() => {})`로 삼킨다.

**고치기:** 루프를 try/catch로 감싸 실패를 삼키고 서버 콘솔에만 남긴다 — 정리 실패가 이미 성공한 수정을 되돌릴 수는 없다. `sweepMyOrphans`와 같은 모양으로 맞추거나 건별로 `await deleteAttachment(...).catch(() => {})`를 쓴다.

> **지난 감사와 겹친다** — 2026-08-31-codebase-audit.md L-18

---

### community-2-C03 · updatePost의 `kept + attached === requested.length` 대조가 테스트에서 한 번도 실행되지 않는다

**위치:** `tests/modules/community/post.service.test.ts:230`

```
const input = {
    postId: "p1",
    updatedAt: new Date("2026-08-28T00:00:00.000Z"),
    title: "새 제목",
    body: "새 본문",
    attachmentIds: [],
  };
```

updatePost 묶음의 모든 테스트가 이 `attachmentIds: []`를 쓰고, 전역 beforeEach가 `listAttachments.mockResolvedValue([])`(106줄)과 `attachToPost.mockResolvedValue(0)`(104줄)을 걸어 둔다. 그래서 서비스의 `const kept = requested.filter((id) => existingIds.has(id)).length`는 늘 0, `requested.length`도 늘 0이라 `if (kept + attached !== requested.length)` 가지가 한 번도 갈리지 않는다. 이 모듈에서 가장 미묘한 산수인데(이미 붙은 첨부는 `attachToPost`가 `postId: null`만 고르므로 안 붙고, 그래서 「그대로 둔 것」을 attach보다 먼저 따로 세야 한다) 어느 방향으로 틀려도 테스트가 통과한다 — `kept`를 attach 뒤에 세도, `existingIds` 대신 다른 조건을 봐도, 부등호를 뒤집어도 초록불이다. 실제 실패 시나리오: 고아 정리가 그 사이 지운 첨부 id 하나가 섞여 오면 조용히 「일부만 사라진 글」이 저장되는데, 그것을 막는 유일한 코드가 무검증이다.

**고치기:** updatePost 테스트를 둘 더 넣는다 — (1) `listAttachments`가 `[{ id: "a1" }]`을 주고 `attachmentIds: ["a1", "a2"]`에 `attachToPost`가 1을 돌려줄 때 통과하며 `detachFromPost`가 `["a1","a2"]`로 불리는가, (2) 같은 상황에서 `attachToPost`가 0을 돌려주면 ATTACHMENT_NOT_FOUND로 막고 감사로그를 안 남기는가.

---

### community-2-C04 · 첨부를 안 받게 바뀐 게시판에서 detachFromPost를 건너뛰는 가드에 테스트가 없다 — 모듈의 유일한 되돌릴 수 없는 삭제다

**위치:** `tests/modules/community/post.service.test.ts:307`

```
it("첨부를 안 받는 게시판이면 수정 경로로도 못 붙인다", async () => {
    findPost.mockResolvedValue({
      ...row(),
      community: board({ allowAttachments: false }),
    });
```

이 테스트는 `attachmentIds: ["a1"]`을 실어 ATTACHMENT_NOT_ALLOWED가 나는 길만 본다. 정작 위험한 길은 반대쪽이다 — 첨부를 안 받게 바뀐 게시판의 수정 화면은 첨부칸을 안 그려 `attachmentIds`가 **빈 채로** 오고, 그때 `detached = community.allowAttachments ? await repo.detachFromPost(...) : []`(post.service.ts:306-308)의 삼항이 없으면 「전부 뺐다」로 읽혀 오타 하나 고친 저장이 기존 첨부를 DB 행째·디스크째 지운다. 소스 주석이 그 자리를 「이 모듈에서 되돌릴 수 없는 유일한 삭제」라고 직접 못 박아 두었는데, 파일 전체에 `expect(detachFromPost)`가 한 줄도 없다(11줄 선언·105줄 기본값·276/286/323줄 반환값 세팅뿐). 삼항을 지우거나 조건을 뒤집어도 모든 테스트가 통과한다.

**고치기:** `allowAttachments: false`인 게시판 + `attachmentIds: []`로 updatePost를 부른 뒤 `expect(detachFromPost).not.toHaveBeenCalled()`와 `expect(deleteAttachment).not.toHaveBeenCalled()`를 단언하는 테스트를 넣는다. 짝으로 `allowAttachments: true`일 때는 불리는지도 함께 본다.

---

### core-2-R06 · formatPhone이 국내 0을 남긴 +82 표기를 `001-0123-4567`로 망가뜨려 가입·계정 수정 폼에서 붙여넣기가 형식 오류로 막힌다

**위치:** `src/lib/masks.ts:37`　— 같은 결함을 `core-2`·`core-1` 조각이 각각 잡았다 (core-1-R07)

```
export function formatPhone(input: string): string {
  const d = input
    .replace(/^\s*(?:\+|00)82[\s-]*/, "0")
    .replaceAll(/\D/g, "")
    .slice(0, 11);
```

이 치환은 「+82 뒤에는 국내 0이 없다」를 전제로 82를 0으로 바꾼다. 0을 남긴 표기가 오면 0이 하나 더 붙어 `+82 010-1234-5678` → `0010-1234-5678` → 숫자 12자리 중 앞 11자리 `00101234567` → `001-0123-4567`이 된다(node로 확인). 괄호를 친 `(+82) 10-1234-5678`과 +가 없는 `82 10-1234-5678`은 정규식의 ^ 앵커를 벗어나 `821-0123-4567`이 되는데, 이는 src/lib/masks.ts:29~33의 주석이 이 코드가 막는다고 이름까지 적어 둔 바로 그 문자열이다. formatPhone은 src/app/(auth)/register/register-flow.tsx:180·bootstrap-form.tsx:66·admin/users/[userId]/user-forms.tsx:99의 MaskedInput format으로 걸려 있으므로, 학부모·교사가 연락처 앱에서 번호를 복사해 붙이면 칸에 없는 번호가 찍히고 이어지는 phoneField(정규식 ^01[016-9]…)가 거절해 「휴대폰 번호 형식이 올바르지 않습니다.」만 보게 된다. 왜 그렇게 됐는지는 화면에 안 나온다. 커밋 932a23e가 고친 것은 0을 뺀 변종이고, 0을 남긴 변종은 그때 함께 다뤄지지 않았다.

**고치기:** 국가번호를 떼고 나서 남은 앞자리가 이미 0이면 0을 덧붙이지 않는다. 예: `.replace(/^\s*\(?(?:\+|00)?82\)?[\s-]*0?/, "0")` — 다만 82로 시작하는 국내 번호는 없으므로 + 없는 82 접두도 함께 접을지는 결정이 필요하다. 고친 뒤 core-2-R05의 사례들을 tests/lib/masks.test.ts 목록에 추가한다.

---

### data-R01 · seed-demo의 --clean이 Invite.createdById로 달린 초대를 안 지워 시연 교사가 초대코드를 발급했으면 정리가 외래키 위반으로 죽는다

**위치:** `scripts/seed-demo.ts:133`

```
// scripts/seed-demo.ts:127-138
  // 부여 → 재적 → 프로필 → (초대) → 계정 순으로 지운다. 외래키가 이 순서를 요구한다.
  await prisma.meritAward.deleteMany({ where: { studentProfileId: { in: profileIds } } });
  await prisma.enrollment.deleteMany({ where: { studentProfileId: { in: profileIds } } });
  await prisma.parentStudent.deleteMany({
    where: { OR: [{ parentUserId: { in: ids } }, { studentId: { in: profileIds } }] },
  });
  await prisma.invite.deleteMany({
    where: { OR: [{ usedById: { in: ids } }, { studentId: { in: profileIds } }] },
  });
  await prisma.studentProfile.deleteMany({ where: { id: { in: profileIds } } });
  // 감사로그의 actorUserId는 SetNull이라 계정을 지워도 기록은 남는다 (설계대로).
  await …
```

`Invite.createdById`는 `onDelete: Restrict`(schema.prisma:331)라 초대를 만든 계정은 그 행을 먼저 지우지 않으면 삭제되지 않는다. 저장소의 다른 두 삭제 경로는 이것을 알고 명시적으로 끊는다 — `admin-user.repo.ts:309`가 "createdById는 Restrict + non-null이라 먼저 지우지 않으면 user.delete가 막힌다"며 `deleteMany({ where: { createdById: userId } })`를 부르고, `roster.repo.ts:176`도 OR의 첫 갈래로 `createdById`를 넣는다. seed-demo의 정리만 `usedById`·`studentId` 둘뿐이다. 시연 시드는 관리자 화면을 눌러보라고 `teacher@demo.invalid` 계정을 일부러 만드는데(seed-demo.ts:43), 그 계정으로 로그인해 초대코드를 한 장이라도 발급하면 `npm run seed:demo -- --clean --yes-local-demo-db`가 `prisma.user.deleteMany`에서 P2003으로 터지고, 이미 상벌점·재적·프로필을 지운 뒤라 DB는 계정만 남은 반쯤 정리된 상태가 된다.

**고치기:** invite.deleteMany의 OR에 `{ createdById: { in: ids } }`를 한 갈래 더 넣는다 — admin-user.repo·roster.repo와 같은 세 갈래로 맞춘다.

---

### merit-1-C01 · 일괄 부여 확인창의 확인 버튼이 type="submit"이라 폼의 default button이 되어, 메모 칸에서 Enter를 치면 확인창 없이 부여가 나간다

**위치:** `src/app/(app)/merit/class-roster.tsx:460`

```
src/app/(app)/merit/class-roster.tsx:459-473
      {/* 폼 안에 둔다 — 확인 버튼이 이 폼을 제출한다. */}
      {rule && (
        <AwardConfirmDialog
          open={confirmOpen}
          onClose={() => setConfirmOpen(false)}
          …
          onConfirm={() => setSubmitted({ ...rule, count: selected.size })}
        />
      )}

src/components/merit/award-confirm-dialog.tsx:175
          <Button type="submit" disabled={pending} onClick={onConfirm}>

src/components/ui/button.tsx:130 (기본값)
  type = "button",
```

AwardConfirmDialog는 이 `<form action={formAction}>` 안에 있고 그 안의 확인 버튼이 `<Button type="submit">`이다(award-confirm-dialog.tsx:175). 그러면 이 폼의 첫 submit 버튼 = default button이 되는데, `<dialog>`가 닫혀 있을 때의 display:none은 default button 판정에서 걸러지지 않는다(숨긴 submit 버튼으로 Enter 제출을 켜는 그 동작이다). 그래서 학생 30명과 벌점 항목을 고른 뒤 메모 칸에서 Enter를 치면 브라우저가 그 확인 버튼에 click을 쏘고 — onConfirm이 돌아 submitted가 찍히고 폼이 그대로 제출된다. 확인창은 한 번도 뜨지 않고 30건이 들어간 뒤 성공 알림만 뜬다. inert={noneChosen} 때문에 이 경로는 학생과 항목이 이미 갖춰진 때, 곧 확인창이 반드시 떠야 하는 그때만 열린다. 항목 고르기 칸도 같다 — rule-picker.tsx:99가 목록이 닫혀 있으면 Enter를 그대로 흘려보낸다. 같은 저장소의 ConfirmSubmit은 정확히 이것을 피해 트리거·확인 둘 다 type="button"으로 두고 confirm()에서 form.requestSubmit()을 부른다(confirm-submit.tsx:76·111·69) — 규정 추가·인라인 수정 폼에는 submit 버튼이 아예 없어 Enter가 폼을 제출하지 못한다. 비슷한 확인 절차 셋 중 이 하나만 다르다.

**고치기:** AwardConfirmDialog의 확인 버튼을 ConfirmSubmit과 같은 모양으로 바꾼다 — type="button"으로 두고 onClick에서 바깥 폼을 requestSubmit()으로 제출한다. 그러면 폼에 default button이 없어져 Enter로 확인을 건너뛸 길이 사라진다.

---

### merit-2-R01 · 규정 고르기 칸을 아무 조작 없이 Tab으로 지나가면 첫 규정이 조용히 선택된다

**위치:** `src/components/merit/rule-picker.tsx:113`

```
src/components/merit/rule-picker.tsx:113-117
    if (event.key === "Tab" && open) {
      // Tab은 막지 않는다 — 고르고 나서 다음 칸(메모)으로 그대로 넘어간다.
      const rule = filtered[activeIndex];
      if (rule) choose(rule);
    }

(같은 파일 161행) onFocus={openList}
(53-57행) function openList() { setQuery(""); setActive(0); setOpen(true); }
(47행) const activeIndex = Math.min(active, Math.max(filtered.length - 1, 0));
```

입력칸에 `onFocus={openList}`가 달려 있어 Tab으로 칸에 들어오는 것만으로 `open=true`·`active=0`이 된다. 그 상태에서 다음 칸(메모)으로 가려고 Tab을 누르면 이 분기가 `filtered[0]`을 `choose()`한다 — 사용자는 아무것도 고르지 않았는데 목록의 첫 규정이 선택되고 `onChange`가 부여 버튼의 잠금까지 푼다. 더 나쁜 경우: 47번째 규정을 고른 뒤 Shift+Tab으로 되돌아와 확인하고 다시 Tab을 누르면 `openList()`가 `active`를 0으로 되돌려 놓은 뒤라 선택이 첫 규정으로 덮인다. 주석은 「고르고 나서」 넘어가는 경우만 말하는데 코드는 고른 적 없는 경우에도 고른다.

**고치기:** 방향키·타이핑으로 사용자가 실제로 목록을 만졌을 때만 Tab이 확정하게 한다 — `openList()`가 `active`를 0이 아니라 null로 두고(또는 `touched` 상태를 따로 들고) Tab 분기에서 그 값이 없으면 아무것도 고르지 않고 지나가게 한다.

---

### merit-5-C01 · 최근 부여 검색어의 OR 4갈래 중 2갈래만 단언해, 메모·학생이름 갈래를 지워도 안 잡힌다

**위치:** `tests/modules/merit/merit.repo.recent.test.ts:90`

```
tests/modules/merit/merit.repo.recent.test.ts:86-94
        where: expect.objectContaining({
          track: "DORM",
          kind: "DEMERIT",
          status: "ACTIVE",
          OR: expect.arrayContaining([
            { label: { contains: "점호", mode: "insensitive" } },
            { awardedByName: { contains: "점호", mode: "insensitive" } },
          ]),
        }),

src/modules/merit/merit.repo.ts:812-822
    ...(filter.q
      ? {
          OR: [
            { label: { contains: filter.q, mode: "insensitive" } },
            { note: { contains: filter.q, mode: "insensitive" } },
            { awardedByName: { contains: filter.q, mode: "insensitive" } },
            { …
```

repo의 recentAwardWhere는 q를 label·note·awardedByName·studentProfile.user.name 네 갈래에 건다. 단언이 arrayContaining이라 이 중 둘만 있으면 통과한다 — note와 학생이름 갈래를 지우면 교사가 최근 부여에서 학생 이름으로 검색했을 때 아무것도 안 나오는데, 실측으로 단위 141파일·2281건이 전부 통과했다. 통합 스위트에도 countRecentAwards·findRecentAward*를 부르는 자리가 없다. (첫 통독 R05도 arrayContaining을 지적했지만 그쪽은 rule.service의 감사로그 changed 배열이고, 여기는 repo의 검색 where다.)

**고치기:** arrayContaining을 걷고 OR 배열 전체를 toEqual로 못 박는다 — 검색 대상이 넷이라는 사실 자체가 화면 약속이므로 갈래가 줄면 테스트가 깨져야 한다.

---

### merit-5-C02 · 총건수 질의가 페이지와 같은 필터인지 대조하지 않아, 검색어·상태가 갈라져도 안 잡힌다

**위치:** `tests/modules/merit/merit.repo.recent.test.ts:148`

```
tests/modules/merit/merit.repo.recent.test.ts:145-151
  it("총 건수에도 화면과 같은 필터를 적용한다", async () => {
    await countRecentAwards(filter);

    expect(count).toHaveBeenCalledWith({
      where: expect.objectContaining({ track: "DORM", kind: "DEMERIT" }),
    });
  });
```

제목은 「총 건수에도 화면과 같은 필터를 적용한다」인데 objectContaining이 track·kind만 본다. countRecentAwards만 q를 무시하도록 바꿔도 2281건이 전부 통과했다(track만 남기는 변이는 kind 단언이 잡았으므로, 새는 것은 status와 q 두 조건이다). 실제로 갈라지면 총건수가 필터 안 걸린 값이 되어 쪽 수가 부풀고, 마지막 쪽들이 빈 표로 뜬다. 같은 파일이 정렬은 페이지 호출의 orderBy를 그대로 꺼내 export와 대조하면서(164~172행) where만 그 대조를 안 한다.

**고치기:** 정렬과 같은 방식으로 쓴다 — findRecentAwardPage를 먼저 부르고 그 findMany 호출의 where를 꺼내, count의 where와 toEqual로 맞춘다.

---

### merit-5-C03 · findStudentHeader가 재적 줄을 그 학년도로 좁혀 읽는지 아무 테스트도 보지 않는다

**위치:** `tests/modules/merit/merit.repo.removed-student.test.ts:106`

```
tests/modules/merit/merit.repo.removed-student.test.ts:102-107
describe("findStudentHeader — 상세는 명단에서 빠진 학생도 보여준다", () => {
  it("재적으로 거르지 않는다 (admin-users의 findDetail과 같은 규칙)", async () => {
    await repo.findStudentHeader("sp-1", 2026);

    expect(whereOf(studentProfileFindFirst)).toEqual({ id: "sp-1" });
  });

src/modules/merit/merit.repo.ts:737-745
      enrollments: {
        where: { year },
        take: 1,
        select: {
          number: true,
          status: true,
          schoolClass: { select: { grade: true, classNo: true } },
        },
      },
```

이 파일은 「빠졌다」의 술어를 못 박는 것이 목적이고, findStudentHeader의 removed·학급·번호는 전부 `enrollments: { where: { year }, take: 1 }`가 고른 한 줄에서 나온다. 그런데 findStudentHeader 쪽 네 테스트는 바깥 where와 반환값만 보고 select를 한 번도 안 본다 — 형제인 searchStudents는 `expect(select.enrollments).toEqual(expect.objectContaining({ where: { year: 2026 }, take: 1 }))`로 같은 자리를 못 박는다(67~69행). where의 year를 지우면 3학년 학생은 take:1이 어느 해 줄을 줄지 알 수 없어, 올해 퇴학한 학생이 1학년 재적 줄을 물고 removed=false·1학년 학급으로 뜬다. 실측: 지워도 단위 2281건 통과. 통합(merit.removed-student.integration)이 getStudentHeader를 부르긴 하지만 픽스처 학생이 전부 YEAR 재적 한 줄뿐이라 그쪽도 못 잡는다.

**고치기:** searchStudents 쪽과 같은 모양으로 `studentProfileFindFirst.mock.calls[0][0].select.enrollments`가 `{ where: { year: 2026 }, take: 1 }`인지 단언한다. 겸해서 재적 줄이 둘(2025·2026)인 픽스처로 removed가 2026 줄로 정해지는지도 본다.

---

### merit-5-C04 · getMeritStats에 반 범위를 준 결과(반별 현황 필터·명단·scope)를 아무 테스트도 보지 않는다

**위치:** `tests/modules/merit/merit.watch-list.test.ts:232`

```
tests/modules/merit/merit.watch-list.test.ts:226-241
  it("반을 골랐으면 그 반 학생만 본다", async () => {
    listClassRoster.mockResolvedValue([
      { studentProfileId: "sp-1" },
      { studentProfileId: "sp-2" },
    ]);

    await service.getMeritStats(admin, "SCHOOL", undefined, NOW, {
      grade: 2,
      classNo: 3,
    });

    expect(demeritTotalsByStudent).toHaveBeenCalledWith(
      expect.objectContaining({ studentProfileIds: ["sp-1", "sp-2"] }),
    );
  });

src/modules/merit/stats.service.ts:339-341
    classes: scope
      ? classes.filter((c) => c.grade === scope.grade && c.classNo === scope.classNo)
      : classes,
```

getMeritStats를 부르는 테스트 파일은 셋(watch-list·stats-scope·offset)인데 scope 인자를 주는 곳은 이 한 줄뿐이고, 그마저 demeritTotalsByStudent에 넘어간 studentProfileIds만 본다. stats.service는 scope가 있으면 `classes.filter((c) => c.grade === scope.grade && c.classNo === scope.classNo)`로 반별 현황을 그 반으로 줄이고 students·scope도 함께 싣는데, 그 filter를 통째로 지워도 단위 2281건이 전부 통과했다(통합에는 getMeritStats 호출이 없다). 지워지면 담임이 자기 반 통계를 보는데 표에는 전교 모든 반이 서고, 머리글 숫자와 표의 범위가 서로 다른 화면이 된다.

**고치기:** classSummaries 목이 두 반을 내도록 두고 scope를 준 호출에서 `stats.classes`가 고른 반 하나인지, `stats.scope`·`stats.students`가 listClassRoster 결과와 같은지 단언한다.

---

### merit-5-R01 · trackTotals·topRules·listAwardsForChart의 모집단(재적) 술어를 어느 테스트도 확인하지 않는다

**위치:** `tests/modules/merit/merit.repo.totals.test.ts:31`

```
tests/modules/merit/merit.repo.totals.test.ts:28-32
/**
 * repo의 집계들. 계산은 merit-track에 모여 있고, 여기서는 그 헬퍼가 실제로
 * 물려 있는지를 본다 — 하나만 어긋나도 화면마다 순점수가 달라진다.
 * 명단에서 출발하는 질의는 재적 where 절도 함께 못 박는다: 목이 값만 돌려주면
 * 재학·소프트삭제 조건을 지워도 결과가 그대로라 아무 테스트도 깨지지 않는다.
 */

src/modules/merit/merit.repo.ts:927-935
function studentScope(params: {
  rosterYear?: number;
  studentProfileIds?: string[];
}): Prisma.MeritAwardWhereInput {
  if (params.studentProfileIds) {
    return { studentProfileId: { in: params.studentProfileIds } };
  }
  return params.rosterYear === undefined ? {} : enrolledStudentScope(params.rosterYear);
}
```

이 파일 머리글이 「명단에서 출발하는 질의는 재적 where 절도 함께 못 박는다」고 선언하지만, 실제로 못 박은 것은 listClassRoster·classSummaries·demeritTotalsByStudent 셋뿐이다. merit.repo.ts의 `studentScope()`/`enrolledStudentScope()`가 붙는 나머지 셋(trackTotals·topRules·listAwardsForChart)은 어느 테스트도 그 where 절을 보지 않고, 서비스 쪽(merit.stats-scope.test.ts)도 `totalsYear`와 `since`만 단언할 뿐 `rosterYear`가 넘어가는지를 안 본다(grep -rn rosterYear tests/ 결과에 세 함수가 없다). 실측: 세 함수에서 `...studentScope(params)` 줄을 지우고 단위 스위트를 돌리면 141파일 2281건이 전부 통과한다. `enrolledStudentScope`에서 `status: "ENROLLED"`만 지워도 마찬가지다. 그러면 repo 주석이 막겠다고 한 일이 그대로 일어난다 — 통계 화면 머리글 합계·「많이 나온 항목」·월별 그래프는 퇴학·전학·졸업으로 재적이 끊긴 학생의 기록까지 세고, 같은 화면의 「반별 현황」(classSummaries, 재적 조건 있음)은 안 세서, 둘을 더해 맞춰 보는 교사에게 설명할 자리가 없어진다.

**고치기:** 파일 끝의 `it.each(CASES)` 옆에 같은 모양의 표를 하나 더 두고, trackTotals·topRules·listAwardsForChart를 `rosterYear: 2026`으로 부른 뒤 `where.studentProfile`이 `{ enrollments: { some: { year: 2026, status: "ENROLLED" } } }`인지, `studentProfileIds`를 주면 그 자리가 `studentProfileId: { in: [...] }`로 바뀌고 재적 조건이 안 겹치는지를 단언한다.

---

### merit-5-R02 · 합계 학년도(totalsYear)가 where.year에 실리는지를 8개 집계 중 둘만 확인한다

**위치:** `tests/modules/merit/merit.repo.totals.test.ts:138`

```
tests/modules/merit/merit.repo.totals.test.ts:134-139
  it("totalsYear가 null이면 학년도 조건 없이 센다", async () => {
    enrollmentFindMany.mockResolvedValue([enrolled("sp-1", 1)]);

    await listClassRoster({ ...roster, track: "DORM", totalsYear: null });

    expect(meritAwardGroupBy.mock.calls[0][0].where).not.toHaveProperty("year");
```

학년도 필터에 대한 단언이 「null이면 조건이 없다」 한 방향뿐이고, 「숫자면 그 학년도가 실제로 걸린다」는 반대 방향이 listClassRoster·classSummaries·trackTotals·topRules·ruleStats·unusedRules·listAwardsForChart 일곱 곳에서 비어 있다. 실측: merit.repo.ts의 여덟 자리에서 `...(params.totalsYear === null ? {} : { year: params.totalsYear })`를 전부 지우고 단위 스위트를 돌리면 실패가 3건뿐이고(demeritTotalsByStudent 2건·teacherTotals 1건) 나머지 일곱 질의는 아무도 못 잡는다. 그 상태에서 교내(SCHOOL) 화면은 「매년 초기화」(isYearScoped)를 잃는다 — 1학년 때 받은 벌점이 3학년 명단·반별 평균·통계 머리글·규정별 집계에 그대로 얹혀 표창 기준과 기준 초과 명단이 통째로 어긋나는데, 오류도 없고 화면도 멀쩡해 보인다.

**고치기:** 「totalsYear가 null이면」 테스트마다 짝을 만들어 `totalsYear: 2026`일 때 `meritAwardGroupBy.mock.calls[0][0].where.year`가 2026인지 단언한다. 지금 `status`만 훑는 `it.each(CASES)`를 where 한 벌 전체(`track`·`status`·`year`)를 검사하도록 넓히는 편이 자리도 한 곳이라 낫다.

---

### merit-5-R03 · listClassRoster·classSummaries 집계에서 track 조건이 빠져도 아무 테스트가 안 깨진다

**위치:** `tests/modules/merit/merit.repo.totals.test.ts:510`

```
tests/modules/merit/merit.repo.totals.test.ts:508-512
  it.each(CASES)("$name", async ({ run, mock }) => {
    await run();

    expect(mock).toHaveBeenCalled();
    expect(mock.mock.calls[0][0].where.status).toBe("ACTIVE");
  });

src/modules/merit/merit.repo.ts:578-585 (listClassRoster)
  const sums = await prisma.meritAward.groupBy({
    by: ["studentProfileId", "kind"],
    where: {
      studentProfileId: { in: ids },
      track: params.track,
      status: "ACTIVE",
      ...(params.totalsYear === null ? {} : { year: params.totalsYear }),
    },
```

여덟 개 집계를 한 번에 훑는 이 `it.each`는 `where.status` 한 칸만 본다. `where.track`을 확인하는 곳은 trackTotalsBetween 테스트(라인 421)와 teacherTotals 테스트(라인 523)뿐이고, 정작 화면이 트랙 탭으로 갈라 보는 두 질의 — 반 명단(listClassRoster)과 반별 요약(classSummaries)의 meritAward.groupBy — 는 아무도 안 본다. 실측: 두 곳에서 `track: params.track,` 한 줄을 지우고 단위 스위트를 돌리면 2281건이 전부 통과한다. 그러면 교내 명단에 기숙사 벌점이 합산돼 학생 한 명의 순점수가 두 트랙의 합으로 뜨고, 반 평균·기준 초과 강조 색까지 함께 틀어진다.

**고치기:** `it.each(CASES)`의 단언을 `expect(mock.mock.calls[0][0].where).toMatchObject({ track: "SCHOOL", status: "ACTIVE" })`로 넓혀 트랙까지 함께 못 박는다(CASES 항목마다 기대 트랙을 들려 주면 DORM 갈래도 같은 표로 덮인다).

---

### pass-1-C01 · 결재 대기·지금 나가 있는 학생 카드가 실제로 그린 줄 수보다 큰 건수를 제목 옆에 적는다

**위치:** `src/app/(app)/pass/admin-view.tsx:57`

```
title="결재 대기"
            hint={`${pendingResult.total}건`}
```

repo는 목록을 자르고 건수만 정확히 센다 — `listPendingForAdmin`은 `take: 100`(pass.repo.ts:168), `listActiveNow`는 `take: 200`(pass.repo.ts:191)인데 total은 `db.pass.count`의 전체 값이다. 화면은 `pending.map`·`active.map`으로 받은 것만 그리고 쪽 넘기기도 「더 있음」 표시도 없다. 전교 200~300명 규모에서 금요일 외박 신청이 100건을 넘거나 주말에 나가 있는 학생이 200명을 넘으면, 교사는 「결재 대기 128건」이라 적힌 카드 안에서 100줄만 보고 나머지 28건은 이 화면 어디에서도 결재할 수 없다(전체 내역에는 승인·반려 버튼이 없다).

**고치기:** repo의 상한을 넘겼는지를 함께 돌려받아 hint를 「100건 표시 / 전체 128건」처럼 적거나, 목록에 쪽 넘기기를 붙인다. 최소한 잘렸다는 사실을 화면에 세운다.

> **지난 감사와 겹친다** — 2026-09-01-full-read-audit.md RL-23

---

### pass-1-C12 · 바로 부여가 실패하면 행선지·사유·시각이 지워진 빈 폼과 오류 문구만 남는다

**위치:** `src/app/(app)/pass/issue-form.tsx:89`

```
<Label htmlFor="issue-destination">행선지</Label>
      <Input
        id="issue-destination"
        name="destination"
        maxLength={60}
        required
        className="mb-4"
      />
```

React 19의 `startHostTransition`은 액션을 돌리기 **전에** `requestFormReset`을 무조건 부른다(node_modules/react-dom/cjs/react-dom-client.development.js:8955) — 성공·실패를 가리지 않는다. 이 폼의 `destination`·`reason`·`endTime`은 값이 리액트 상태가 아니라 DOM에 있는 비제어 칸이라 제출할 때마다 비워진다. `OVERLAPPING_PASS`·`STUDENT_NOT_ELIGIBLE`·`INVALID_PERIOD`·`PASS_BUSY`로 되돌아오면 교사는 「같은 기간에 이미 신청한 출입증이 있습니다.」를 읽으면서 방금 적은 행선지·사유를 처음부터 다시 친다. 같은 저장소가 이 문제를 이미 두 곳에서 피해 갔다 — 학생 신청 폼은 여섯 칸을 전부 `useState`로 쥐고(new/request-form.tsx:22-28), `ConfirmDialog`는 「실패하면 쓰던 사유를 남겨 고쳐서 다시 누를 수 있게 한다」며 사유를 상태로 둔다(components/ui/confirm-dialog.tsx:78,94). 이 폼만 그 대비가 없다.

**고치기:** request-form처럼 `destination`·`reason`·`endTime`(외박이면 `consentNote`도)을 `useState`로 쥐고 `value`/`onChange`로 묶어, 성공했을 때만 `pickerKey`와 함께 비운다.

---

### pass-2-R01 · 학생 신청은 명단 반영과 같은 user 행 잠금을 기다리는데 트랜잭션 예산도 P2028 변환도 없어 원인 불명 오류로 죽는다

**위치:** `src/modules/pass/request.service.ts:35`

```
return withTransaction(async (tx) => {
    const exists = await repo.lockStudentForPassCreation(profile.id, tx);
    if (!exists) throw new PassError("NO_STUDENT_PROFILE");
```

`lockStudentForPassCreation`은 `SELECT u."id" FROM "user" ... FOR UPDATE`로 학생의 user 행을 잠근다. 명단 일괄 반영(`roster.repo.ts:339`)은 `{ timeout: 120_000 }` 트랜잭션 안에서 `tx.user.updateMany(...)`로 바로 그 행들에 쓰기 잠금을 걸고 커밋까지 쥔다. 그동안 학생이 신청을 내면 이 트랜잭션은 Prisma 기본 5초 예산을 다 써 P2028로 끊긴다. 형제 경로인 `issuePass`는 같은 상황을 알고 `{ timeout: 130_000, maxWait: 10_000 }`을 주고 P2028을 `PASS_BUSY`로 옮겨 「명단 반영 중일 수 있습니다」를 띄우는데, 여기에는 둘 다 없다 — `toState`가 PassError가 아닌 오류를 그대로 다시 던지므로 학생은 신청 화면 대신 오류 경계를 본다.

**고치기:** `issuePass`와 같은 모양으로 맞춘다 — `withTransaction`에 `{ timeout: 130_000, maxWait: 10_000 }`을 주고 P2028을 `PassError("PASS_BUSY")`로 옮긴다.

---

### pass-3-C01 · getMyStudentQr 테스트가 QR 안에 무엇이 들었는지 한 번도 보지 않는다 — 학생증을 통째로 갈아치워도 스위트가 초록이다

**위치:** `tests/modules/pass/request.service.test.ts:495`

```
tests/modules/pass/request.service.test.ts:492-497
  it("학생 본인에게 QR과 주소를 준다", async () => {
    const result = await service.getMyStudentQr(student);

    expect(result.qr.size).toBeGreaterThan(20);
    expect(result.qr.d.startsWith("M")).toBe(true);
    expect(typeof result.validUntil).toBe("string");
  });
```

이 describe의 네 테스트는 크기·첫 글자·타입·두 코드가 다르다는 것만 본다 — 그림이 무엇을 담았는지는 아무도 묻지 않는다. 두 변이를 실제로 넣고 돌려 봤다. (1) `issueStudentCode(profile.id, now)` → `issueStudentCode(actor.id, now)`, (2) `toQrPath(buildScanUrl(code))` → `toQrPath(code)`. 각각 단위 2281건·통합 88건이 **전부 통과**한다. 첫 변이는 학생 프로필이 아니라 사용자 id로 서명하므로 정문에서 `findStudentForCard`가 못 찾아 전교생이 UNKNOWN(「우리 학생증 코드가 아닙니다」)이 되고, 둘째 변이는 URL이 아닌 맨 코드를 그려 `tokenFromScanUrl`이 `new URL()`에서 null을 내 스캐너가 토큰조차 못 꺼낸다. 발급(pass.token)·주소(pass.url)·판정(verify.service)은 각각 테스트가 있지만 셋을 잇는 이음매에 단언이 하나도 없다 — `/api/pass/qr` 라우트 테스트마저 서비스를 목으로 둔다(tests/app/api/pass/qr/route.test.ts:8).

**고치기:** `getMyStudentQr`의 결과를 되짚는 왕복 단언을 넣는다 — 목 프로필 id를 `verifyStudentCode`가 받는 모양(`/^[a-z0-9]{10,64}$/`)으로 바꾼 뒤, `toQrPath`를 목으로 잡아 인자로 들어온 문자열에 `tokenFromScanUrl(text, scanOrigin())`을 걸고 그 토큰이 `verifyStudentCode`로 그 프로필 id를 되돌려 주는지 확인한다.

---

### pass-3-C03 · 대행 재시도의 「보호자 기록을 덮지 않는다」 단언이 두 키가 모두 맞을 때만 실패한다 — consentByProxy만 켜도 통과한다

**위치:** `tests/modules/pass/decision.service.test.ts:298`

```
tests/modules/pass/decision.service.test.ts:293-303
    expect(transitionUnexpired).toHaveBeenNthCalledWith(
      2,
      "p-1",
      ["CONSENTED"],
      NOW,
      expect.not.objectContaining({
        consentByProxy: true,
        consentNote: "어머니와 전화 확인",
      }),
      txClient,
    );
```

`expect.not.objectContaining`은 objectContaining 전체의 부정이라, 두 키가 **함께** 맞을 때만 실패한다. 그래서 두 번째 전이 데이터에 `consentByProxy: true`만 들어가면(consentNote는 없이) 이 단언이 그대로 통과한다. 실제로 `{ ...decisionFields, decisionNote }`를 `{ ...decisionFields, decisionNote, consentByProxy: true }`로 바꾸고 돌렸더니 단위 2281건이 **전부 통과**했다. 그 상태로 배포되면 보호자가 직접 누른 확인이 `consentByProxy=true`로 뒤집혀, 내보내기 시트의 보호자확인 칸이 「대행 · 박서연」으로(pass.export.ts:50) 나오고 상세 화면도 교사가 전화로 대신 확인한 것처럼 읽힌다 — 이 테스트가 막겠다고 이름 붙인 바로 그 일이다. (첫 통독의 pass-3-R02는 같은 블록에서 「교사가 적은 consentNote가 사라지는 것을 정답으로 못 박는다」를 지적했다. 여기는 다른 축이다 — 단언 형식 자체가 덮어쓰기를 탐지하지 못한다.)

**고치기:** 부정 매처를 버리고 실제 인자를 집어 키 단위로 못 박는다: `const second = transitionUnexpired.mock.calls[1]![3]; expect(second).not.toHaveProperty("consentByProxy"); expect(second).not.toHaveProperty("consentedByUserId"); expect(second).not.toHaveProperty("consentNote");` — 같은 파일 218-224가 이미 쓰는 방식이다.

---

### pass-3-C05 · issueWindow 외출의 종료일이 KST로 집힌다는 것에 단언이 닿지 않는다 — 고른 시각이 UTC와 KST가 같은 날인 지점뿐이다

**위치:** `tests/modules/pass/pass.window.test.ts:186`

```
tests/modules/pass/pass.window.test.ts:180-187
  it("외출은 지금부터 그날 그 시각까지다", () => {
    const { startAt, endAt } = issueWindow(
      { type: "OUTING", studentId: "s-1", endTime: "18:00", destination: "치과", reason: "검진" },
      NOW,
    );
    expect(startAt).toEqual(NOW);
    expect(endAt.toISOString()).toBe("2026-08-27T09:00:00.000Z");
```

pass.window.ts:64-66의 주석은 「외출은 종료 날짜를 받지 않으므로 오늘이다 — KST로 집는다(UTC로 자르면 하루 밀린다)」라며 `formatDateInput`을 쓰는 이유를 적어 둔다. 그런데 이 파일의 NOW는 `2026-08-27T00:00:00.000Z`(=09:00 KST) 하나뿐이라 UTC 날짜와 KST 날짜가 같은 날이고, issueWindow 테스트 넷이 전부 그 NOW를 쓴다. `formatDateInput(now)`를 `now.toISOString().slice(0, 10)`으로 바꾸고 돌렸더니 단위 2281건·통합 88건이 **전부 통과**했다. 두 눈금이 갈리는 것은 UTC 15:00~23:59, 즉 **KST 자정~오전 9시**다 — 그 시간대에 교사가 외출을 직접 부여하면 종료일이 전날로 잘려 `issueWindow`가 INVALID_PERIOD를 내거나 이미 끝난 창이 되어 PASS_EXPIRED로 떨어진다. 같은 성질을 pass.schema.test.ts:287은 「KST로 날이 바뀐 뒤에는 새 날을 기준으로 센다」로 못 박아 두었는데 여기만 빠졌다.

**고치기:** `new Date("2026-08-27T16:00:00.000Z")`(=8/28 01:00 KST) 같은 시각으로 issueWindow 외출을 한 번 더 세워, endAt이 8/28의 endTime인지 확인한다.

---

### pass-3-R01 · 이어 붙이기를 막는 60분 여백(conflictWindow)에 닿는 단언이 저장소 전체에 하나도 없다 — 상수를 0으로 바꿔도 단위 스위트 2281건이 전부 통과한다

**위치:** `tests/modules/pass/pass.window.test.ts:3`

```
tests/modules/pass/pass.window.test.ts:1-3
import { describe, expect, it } from "vitest";
import { PassError } from "@/modules/pass/pass.error";
import { issueWindow, requestWindow } from "@/modules/pass/pass.window";
```

pass.window.ts가 내보내는 함수는 requestWindow·issueWindow·conflictWindow 셋인데 이 파일은 앞의 둘만 가져온다. conflictWindow는 CHAIN_GAP_MINUTES(60분)를 유효 창 앞뒤에 얹어 findOverlapping에 넘기는 유일한 자리이고, 그 주석은 이 여백이 없으면 「외출 두 건(9/1 00:00~23:59 · 9/2 00:00~23:59)이 나란히 통과해 연속 48시간 부재에 보호자 확인이 한 번도 걸리지 않는다」고 적는다. 두 서비스 테스트는 findOverlapping을 목으로 두고 반환값만 바꿀 뿐 인자를 단언하지 않으며(request.service.test.ts:162, decision.service.test.ts:447), 통합 테스트의 「맞닿은 구간」 검사(pass.flow.integration.test.ts:411)는 repo.findOverlapping을 직접 불러 conflictWindow를 건너뛴다. 경합 테스트들도 완전히 같은 창을 두 번 내므로 여백이 0이어도 겹친다. 실제로 CHAIN_GAP_MINUTES를 0으로 고치고 단위 스위트를 돌렸더니 141파일 2281테스트가 전부 통과했다(원복함) — 문서가 이름 붙인 보호자 확인 우회로가 조용히 다시 열려도 알려 줄 검사가 없다.

**고치기:** pass.window.test.ts에 conflictWindow를 직접 부르는 describe를 더해 시작은 60분 앞, 종료는 60분 뒤로 넓어지는 것을 못 박고, request.service.test.ts·decision.service.test.ts에 findOverlapping이 받은 첫·둘째 시각 인자가 원본 창이 아니라 ±60분 넓힌 값인지 확인하는 단언을 각각 한 줄 넣는다.

---

### roster-1-C02 · 현재 학년도가 없을 때 학년도 Select가 빈 칸으로 서고 「현재로 지정」이 반드시 실패한다

**위치:** `src/app/(app)/admin/students/year-switcher.tsx:19`

```
// (app)/admin/students/year-switcher.tsx:19-20, 54, 58
  const current = years.find((y) => y.isCurrent)?.year;
  const [selected, setSelected] = useState(String(current ?? ""));
...
            description={`${selected}학년도를 현재로 지정합니다. 전교 집계와 명단이 이 학년도를 기준으로 바뀝니다.`}
...
            disabled={Number(selected) === current}
```

panel.tsx가 「현재 학년도가 없으면 표는 못 그리지만 학년도 카드는 띄워야 한다 — 학년도를 지정할 수 있는 화면이 여기뿐이다」라고 밝힌 바로 그 상태에서, current가 undefined라 selected가 ""가 된다. Select는 제어 컴포넌트인데 value=""에 대응하는 <option>이 없어 아무것도 안 고른 빈 칸으로 그려진다. 버튼은 disabled={Number(selected) === current} → Number("")=0 !== undefined라 열려 있고, 확인 모달 문구는 `${selected}학년도를…`이 비어 「학년도를 현재로 지정합니다」가 된다. 눌러 제출하면 year=""라 yearFormSchema가 실패해 「학년도가 올바르지 않습니다」만 뜬다. 교사가 드롭다운을 한 번 열어 고르면 복구되지만, 학년도가 없는 최초 상태에서 이 화면이 처음 하는 일이 실패다.

**고치기:** current가 없으면 목록의 첫 학년도(years[0]?.year)로 selected를 초기화하고, years가 비어 있을 때는 지정 버튼을 disabled로 둔다.

---

### roster-1-R01 · 명단 파일의 머리글 행만 NFC 정규화를 안 해, macOS에서 온 조합형 한글 머리글이면 전 줄이 오류가 된다

**위치:** `src/modules/enrollment/roster.parse.ts:462`

```
// roster.parse.ts:461-474
  const header = table[0]!.map((h) => h.trim());
  const at = (name: string) => header.indexOf(name);
  // 학생코드 열은 없어도 오류가 아니다 — 그 경우 전 줄이 신규로 분류된다.
  const missing = ROSTER_COLUMNS.filter((c) => c !== "학생코드" && at(c) === -1);

  const idx = Object.fromEntries(
    ROSTER_COLUMNS.map((c) => [c, at(c)]),
  ) as Record<(typeof ROSTER_COLUMNS)[number], number>;

  // macOS를 거친 파일은 한글이 조합형으로 섞여 온다. DB 쪽(listExisting)과 같은
  // NFC로 맞춰야 눈에 같은 이름이 다른 값으로 잡히지 않는다.
  const cell = (r: string[], name: (typeof ROSTER_COLUMNS)[number]) =>
    idx[name] === -1 ? "" : (r[idx[name]] ?? "").trim().normalize("NFC");
```

바로 아래 474줄의 `cell()`은 `.trim().normalize("NFC")`를 하고 그 이유를 「macOS를 거친 파일은 한글이 조합형으로 섞여 온다」고 주석에 적었다. roster.repo.ts:68도 같은 이유로 DB 이름을 NFC로 맞춘다. 그런데 머리글 행만 `.trim()`뿐이라, macOS를 거쳐 조합형(NFD) 한글이 된 머리글("학생코드"·"이름"·"생년월일"…)은 `header.indexOf(name)`이 전부 -1이 된다. 그러면 `missing`에 필수 열 여섯이 다 들어가 모든 줄에 「머리글에 이름·생년월일·학년·반·번호·학적 열이 없습니다.」가 붙고, planRoster가 그것을 errorRows로 몰아 hasBlockingError가 서서 확정이 통째로 막힌다. 같은 이유로 558줄 `fileNotices`도 「학생코드 열이 없어 전 줄을 신규로 처리합니다」라는 거짓 안내를 맨 위에 띄운다. 교사에게는 멀쩡히 내보낸 파일이 아무 이유 없이 전부 오류로 보인다.

**고치기:** 462줄과 561줄의 머리글 매핑을 `.trim().normalize("NFC")`로 바꿔 셀 값과 같은 정규화를 거치게 한다.

> **지난 감사와 겹친다** — 2026-08-31-codebase-audit-deep.md DL-11

---

### roster-2-C01 · 학생코드가 빈 신규 줄끼리는 이름·생년월일 중복을 검사하지 않아, 같은 학생이 두 줄로 들어오면 초대코드 두 장이 나가고 프로필이 둘 생긴다

**위치:** `src/modules/enrollment/roster.plan.ts:226`

```
const stillNew: PlannedRow[] = [];
  for (const r of plan.newStudents) {
    const match = existing.find(
      (s) => s.name === r.name && s.birthDate === r.birthDate,
    );
```

파일 안 중복 검사(77~102행)는 `if (r.studentCode)`일 때만 학생코드를, `r.status === "ENROLLED"`일 때만 학년-반-번호 자리를 본다. 신규 줄(학생코드 빈 칸)끼리의 이름·생년월일은 어디서도 맞대지 않고, 226행의 대조 상대는 DB 쪽 `existing`뿐이다. 그래서 「전학 온 학생이 옛 반과 새 반 양쪽에 적혀 두 줄로 들어온 파일」처럼 **이름·생년월일은 같고 자리는 다른 신규 줄 두 개**는 자리 중복에도 안 걸리고 `existing`에도 없어 둘 다 plan.newStudents에 남는다. 확정하면 roster.service가 두 줄 각각에 `generateUniqueCode()`를 돌려(268~272행) 초대코드 두 장을 발급하고, 학생코드는 `generateStudentCode()`가 난수로 만들므로 가입 시점에도 아무것도 충돌하지 않는다 — 한 사람에게 계정 두 개와 StudentProfile 두 개가 생기고, 상벌점·출입증이 둘로 갈린다. 216~223행의 주석이 「같은 학생이 두 줄로 들어온 파일이 그대로 통과한다 — 초대코드가 새로 나가고 두 번째 프로필이 생긴다」를 막으려고 대조 상대를 missingFromFile에서 existing으로 넓힌 자리인데, 신규×신규 조합만 그 그물 밖에 남아 있다.

**고치기:** 77~102행의 중복 검사 루프에 `${name}|${birthDate}` 키를 쓰는 세 번째 Map을 두고(학생코드가 빈 줄에만 적용), 이미 본 조합이면 seenCode·seenSeat와 같은 방식으로 `${prev}행과 이름·생년월일이 같습니다.`를 dupErrors에 넣어 errorRows로 내린다. 자리가 같은 경우는 지금처럼 seenSeat가 먼저 잡는다.

---

### roster-2-R01 · 확정 결과의 「N건 반영했습니다」는 신규 학생을 하나도 세지 않고 안 바뀐 학생을 전부 센다

**위치:** `src/modules/enrollment/roster.service.ts:413`

```
// deleted는 화면이 "N명 제외"를 따로 알리는 데 쓴다 — 반영 건수 하나만 주면
  // 몇 명이 명단에서 빠졌는지가 묻힌다.
  return {
    saved: assignments.length,
    deleted: plan.missingFromFile.length,
    invites,
    excludedNewStudents,
  };
```

assignments는 reassign+statusChange+newAssignment+untouched다. 신규 학생(plan.newStudents)은 Enrollment를 만들지 않고 초대코드만 발급하므로 assignments에 없다 — 학생이 0명인 상태에서 300줄짜리 첫 명단을 확정하면 초대코드 300장이 발급되는데 화면(import-form.tsx:428)에는 「0건 반영했습니다.」가 뜬다. 반대로 300명 학교에서 한 명의 번호만 고쳐도 untouched 299명이 함께 세어져 「300건 반영했습니다.」가 뜬다. 미리보기가 보여준 분류별 건수(신규 300 / 재배정 1)와 확정 결과 숫자가 어느 쪽으로도 맞지 않는다. 화면 상태 타입의 주석(src/app/(app)/admin/students/import/action-state.ts:32 「반영 건수(saved) 중 계정째 삭제된 학생 수」)도 같은 오해 위에 서 있다 — missingFromFile은 untouched에서 제외되므로 deleted는 saved의 부분집합이 아니라 서로 겹치지 않는 집합이다.

**고치기:** saved를 「실제로 달라진 줄」(reassign+statusChange+newAssignment)로 좁히고 발급된 초대코드 수를 별도 숫자로 함께 돌려준다. action-state.ts:32의 「반영 건수(saved) 중」 주석도 함께 고친다.

> **지난 감사와 겹친다** — 2026-08-31-codebase-audit.md L-21

---

### roster-3-C01 · schoolClass upsert 목이 늘 같은 id를 줘서 학생이 제 반에 들어가는지 아무도 보지 않는다

**위치:** `tests/modules/enrollment/roster.repo.test.ts:399`

```
// 학생은 3명이지만 (학년,반) 쌍은 (1,3)과 (2,1) 둘뿐이다.
    expect(schoolClassUpsert).toHaveBeenCalledTimes(2);
```

roster.repo.ts:217-241은 (학년,반)마다 upsert한 결과를 classIdByKey에 모은 뒤 학생마다 classIdByKey.get(`${row.grade}-${row.classNo}`)로 제 반의 id를 꺼내 createMany에 싣는다. 그런데 이 파일의 목은 beforeEach(121행)에서 schoolClassUpsert가 호출마다 늘 { id: "class-1" }을 돌려주게 세워져 있고, 두 반짜리 테스트(385행)는 upsert 횟수만 세며, createMany의 data를 보는 두 곳(320행 length 2 · 499행 objectContaining)은 classId를 학생별로 대조하지 않는다. 즉 이 파일은 매핑이 틀려도 구분할 수단 자체가 없다. 실제로 classIdByKey.get(...)을 [...classIdByKey.values()][0](늘 첫 반)으로 바꾸고 npx vitest run --project unit을 돌렸더니 2281건이 전부 통과했다(원복 완료). 통합 테스트도 못 잡는다 — roster.repo.apply-roster·roster.hard-delete 둘 다 assignments: []라 이 경로를 아예 안 탄다. 매핑이 어긋나면 2학년 학생이 1학년 반 행에 붙어 반영되고 명단·상벌점·출입증이 전부 틀린 소속으로 선다.

**고치기:** schoolClassUpsert 목을 호출 인자에 따라 다른 id를 주게 바꾸고(예: ({ where }) => ({ id: `cls-${where.year_grade_classNo.grade}-${where.year_grade_classNo.classNo}` })), 385행 테스트에 upsert 인자의 year_grade_classNo가 (2026,1,3)·(2026,2,1)인지와 enrollment.createMany data의 각 줄 classId가 그 학생의 (학년,반)에 대응하는 id인지를 단언한다.

---

### roster-3-C02 · listExisting이 생년월일을 KST로 자르는지 확인하는 단언이 어디에도 없다

**위치:** `tests/modules/enrollment/roster.repo.listExisting.test.ts:30`

```
birthDate: new Date("2010-07-28T00:00:00+09:00"),
```

roster.repo.ts:69-72는 「파일의 표기와 맞대려면 KST 기준 YYYY-MM-DD여야 한다」는 주석과 함께 Intl.DateTimeFormat(en-CA, Asia/Seoul)로 birthDate를 만든다. 이 값은 planRoster가 파일 쪽 생년월일과 문자열로 맞대는 유일한 값이다(roster.plan.ts:140). 그런데 이 파일의 네 테스트는 name·hasGraduatedEnrollment·deleted·status·where만 보고 result[0].birthDate를 한 번도 읽지 않는다 — 픽스처가 KST 자정(+09:00)이라 UTC 회귀를 드러낼 값을 이미 갖고 있는데도 그렇다. 실제로 그 줄을 p.birthDate.toISOString().slice(0, 10)으로 바꿔 돌렸더니 단위 테스트 2281건이 전부 통과했다(원복 완료). 그러면 KST 자정으로 저장된 전교생의 생년월일이 하루씩 밀려 나가고, 내려받아 그대로 올린 파일조차 전원이 「파일의 이름/생년월일이 등록된 학생과 다릅니다」 needsAttention으로 떨어져 명단 반영이 통째로 막힌다. 형제 파일도 대신 못 잡는다 — roster.export.test.ts는 픽스처 문자열로 ExportStudent를 만들어 listExisting을 거치지 않고, year-race 통합 테스트의 toRosterRow는 listExisting이 준 값을 그대로 되돌려 실어 자기모순이 생기지 않는다.

**고치기:** 이 파일에 expect(result[0]!.birthDate).toBe("2010-07-28")을 한 줄 넣는다. KST 자정 픽스처가 이미 있으므로 그 한 줄이 곧 UTC 회귀 가드다. 서버 TZ에 좌우되지 않게 UTC 자정(2010-07-28T00:00:00Z)이 「2010-07-28」로 나오는 줄을 하나 더 붙여 두면 더 좋다.

---

### roster-3-C03 · 명단 반영이 낸 초대코드의 invite:create 감사로그가 통째로 미검증이고, 픽스처에 targetId가 될 id가 없다

**위치:** `tests/modules/enrollment/roster.service.test.ts:259`

```
invites: [{ name: "김동혁", code: "GBSWCODE1", grade: 1, classNo: 5, number: 7 }],
```

roster.service.ts:353-367은 이번 반영이 발급한 코드마다 invite:create 한 줄을 남기고, 그 위 주석이 이유를 둘 적어 뒀다 — 「종이로 나가는 코드가 어디서 나왔든 발급 기록은 하나여야 『이 코드는 누가 만들었나』를 한 줄로 되짚을 수 있다」와 「코드 값은 metadata에 넣지 않는다. 감사로그를 볼 수 있는 사람이 남의 가입코드를 그대로 읽게 된다」. 그런데 grep -rn "invite:create" tests/ 결과에 이 경로를 보는 줄이 하나도 없다. 이 파일의 기본 applyRoster 목이 invites: []라 루프 본문이 아예 안 돌고, 유일하게 invites를 채우는 이 테스트(256행)는 result.invites의 길이만 보며 감사로그는 건드리지 않는다. 게다가 그 픽스처는 repo의 실제 반환 모양(roster.repo.ts:292-300 — id가 첫 필드이고 「감사로그의 targetId. 코드 값은 로그에 싣지 않으므로 이 id가 유일한 손잡이다」라고 못 박혀 있다)에서 id를 빼먹었다. 그래서 이 갈래를 통째로 지워도, targetId가 undefined가 돼도, 누가 metadata에 code: invite.code를 넣어 전교 신규 학생의 가입코드를 감사로그에 흘려도 verify가 그대로 통과한다.

**고치기:** applyRoster 목이 invites: [{ id: "inv-new-1", name, code, grade, classNo, number }]를 돌려주게 픽스처에 id를 채우고, auditEntries()에서 invite:create 줄을 골라 발급 수만큼 있는지·targetType이 "Invite"이고 targetId가 그 id인지·metadata가 { role: "STUDENT" }뿐인지·JSON.stringify(그 줄)에 코드 값("GBSWCODE1")이 없는지를 단언하는 테스트를 넣는다.

---

### roster-3-R02 · applyRoster에 넘어가는 managedStudentProfileIds·createdById를 아무 테스트도 단언하지 않는다

**위치:** `tests/modules/enrollment/roster.service.test.ts:544`

```
it("1명이 빠질 때 건수를 정확히 넣으면 통과한다", async () => {
      await applyRosterPlan(admin, 2026, [무관한신규줄], fingerprint(), ["sp-1"], 1);

      expect(applyRoster.mock.calls[0]![1].deleteStudentProfileIds).toEqual(["sp-1"]);
    });
```

roster.service.ts:294는 managedStudentProfileIds에 existing 전원의 id를 싣는다 — repo가 그 학년도 배정을 통째로 지울 범위이고, roster.repo.ts:127-131이 「교사로 승격돼 명단 밖으로 빠진 계정의 배정이 함께 지워지지 않게」 하는 유일한 방어라고 못 박은 값이다. 이 파일은 applyRoster.mock.calls[0][1]에서 deleteStudentProfileIds·assignments·newStudents·inviteExpiresAt만 꺼내 보고 managedStudentProfileIds와 createdById는 한 번도 읽지 않는다. 형제 파일 roster.repo.test.ts:297-303은 「받은 범위대로 지운다」만 붙들므로, 서비스가 이 값을 assignments의 id만으로 잘못 채워도(승격 계정의 옛 배정이 남아 NUMBER_TAKEN이 되거나, 반대로 전 범위를 넘겨 남의 배정을 지워도) 양쪽 다 통과한다. createdById도 마찬가지라 초대코드가 엉뚱한 교사 명의로 발급돼도 잡히지 않는다.

**고치기:** 기존 학생 둘을 세운 테스트에서 applyRoster.mock.calls[0][1].managedStudentProfileIds가 existing 전원의 id와 같은지, createdById가 admin.id인지를 단언하는 테스트를 추가한다.

---

### shell-C01 · 대시보드 「지금 나가 있는 학생」이 복귀 시각에서 날짜를 지워, 내일 돌아오는 외박이 오늘 저녁으로 읽힌다

**위치:** `src/app/(app)/page.tsx:271`

```
src/app/(app)/page.tsx:269-273
                    trailing={
                      <span className="text-caption tabular-nums text-mut">
                        {formatTimeShort(pass.endAt)} 복귀
                      </span>
                    }

src/modules/pass/pass.labels.ts:96-104
/**
 * 「언제까지인가」 한 조각. `passPeriod`와 같은 눈금이되 더 좁다 — 지금 나가 있는
 * 학생 옆에 오른쪽 정렬로 서는 자리라, 외박도 연도는 빼고 날짜와 시각만 적는다.
 */
export function passEndLabel(pass: { type: string; endAt: Date }): string {
  return pass.type === "OVERNIGHT"
    ? formatMonthDayTime(pass.endAt)
    : formatTimeShort(pass.endAt);
}

src/app/(app)/pass/admin-view.tsx:116-118
                      <p className="text-caption text-mut …
```

`modules/pass/pass.labels.ts`의 `passEndLabel`이 바로 이 자리를 위해 있고(주석: 「지금 나가 있는 학생 옆에 오른쪽 정렬로 서는 자리라, 외박도 연도는 빼고 날짜와 시각만 적는다」), `/pass`의 admin-view.tsx:117이 그것을 써서 「9. 3. 오후 6:00까지」로 그린다. 대시보드만 `formatTimeShort`를 직접 불러 시각만 남긴다. 9/1 09:00~9/3 18:00짜리 외박으로 나가 있는 학생이 대시보드에는 「오후 6:00 복귀」로 서고, 교사는 오늘 저녁에 들어오는 학생으로 읽는다. 같은 값에 붙는 말도 「까지」와 「복귀」로 갈려 용어 고정표를 깬다.

**고치기:** `passEndLabel(pass)`를 import해 `{passEndLabel(pass)}까지`로 바꾼다 — 형식과 문구가 /pass와 한 곳에서 정해진다.

---

### shell-C02 · 대시보드 「최근 부여」가 상쇄점을 상점과 같은 파란색으로 칠한다

**위치:** `src/app/(app)/page.tsx:226`

```
src/app/(app)/page.tsx:220-234
                  trailing={
                    award.status === "CANCELLED" ? (
                      <Badge tone="cancelled">취소</Badge>
                    ) : (
                      <span
                        className={
                          award.kind === "DEMERIT"
                            ? "text-sm font-medium tabular-nums text-rose"
                            : "text-sm font-medium tabular-nums text-blue"
                        }
                      >
                        {award.kind === "DEMERIT" ? "−" : "+"}
                        {award.points}
                      </span>
                    )
                  } …
```

`components/merit/kind-badge.tsx`의 `kindColorClass`가 종류→색을 소유하고 MERIT=text-blue · DEMERIT=text-rose · OFFSET=text-green으로 정해 두었으며, merit/recent·merit/stats·merit/rules와 `merit-totals.tsx`가 모두 그것을 쓴다. 대시보드만 손으로 이분해서 OFFSET(상쇄점)이 `text-blue`로 나온다 — 이 줄의 meta는 규정 이름(award.label)만 적고 종류를 적지 않으므로 색이 종류를 알리는 유일한 신호다. 교사가 대시보드에서 상쇄점 +10을 상점 +10으로 읽고 /merit/recent에서는 초록으로 본다. 부호도 마찬가지다: `signedPoints`는 모르는 종류에 빈 문자열을 주는데 여기서는 무조건 「+」가 붙는다.

**고치기:** `kindColorClass(award.kind)`와 `signedPoints(award.kind, award.points)`를 가져다 쓴다.

---

### shell-R01 · 전역 `outline: none`이 체크박스와 파일 선택칸의 포커스 표시를 지워 버린다

**위치:** `src/app/globals.css:154`

```
src/app/globals.css:154-159
  input:focus-visible,
  textarea:focus-visible,
  select:focus-visible {
    outline: none;
    border-color: var(--color-ink);
    box-shadow: 0 0 0 3px --alpha(var(--color-ink) / 10%);
  }

src/components/ui/checkbox.tsx:23-28
      <input
        type="checkbox"
        aria-label={label}
        className="size-4 accent-pri"
        {...props}
      />

src/app/(app)/admin/students/import/import-form.tsx:220-221
        <input
          type="file"

src/app/(app)/community/[slug]/attachment-picker.tsx:117-119
      <input
        ref={inputRef}
        type="file"
```

이 규칙은 `input` 전체에 걸린다. 테두리를 가진 글자 입력칸은 `border-color`가 #dfdfdf에서 #171717로 바뀌어 포커스가 또렷하게 보이지만, `src/components/ui/checkbox.tsx`의 네이티브 체크박스(`className="size-4 accent-pri"` — 테두리 클래스가 없다)와 `admin/students/import/import-form.tsx:221`·`community/[slug]/attachment-picker.tsx:119`의 `type="file"` 칸은 `border-color`가 그려지는 자리가 없다. 그 둘에 남는 유일한 신호가 10% 알파 검정 3px 그림자인데 흰 바탕에서 대비가 1.2:1 남짓이라 사실상 보이지 않는다. 키보드로 반 명단의 일괄 선택 체크박스를 훑는 사감·교사는 지금 커서가 어느 줄에 있는지 알 수 없고, 명단 업로드와 첨부 고르기 칸도 같다.

**고치기:** 리셋을 글자 입력칸으로 좁힌다 — `input:where([type=checkbox],[type=file]):focus-visible`에는 `outline: 2px solid var(--color-ink); outline-offset: 2px`를 남기거나, 위 선택자에서 그 두 유형을 `:not()`으로 뺀다.

---

### ui-1-C01 · Markdown 컴포넌트가 className 뒤에 props를 펼쳐, 살균기가 남긴 class가 디자인 클래스를 통째로 덮는다 — GFM 체크리스트가 글머리표·들여쓰기 없이 그려진다

**위치:** `src/components/ui/markdown.tsx:95`

```
ul: (p: Md<"ul">) => (
    <ul className="my-3 list-disc space-y-1 pl-5" {...omitNode(p)} />
  ),
  ol: (p: Md<"ol">) => (
    <ol className="my-3 list-decimal space-y-1 pl-5" {...omitNode(p)} />
  ),
```

rehype-sanitize의 defaultSchema는 ul에 ['className','contains-task-list'], code에 ['className',/^language-./]를 허용한다(node_modules/hast-util-sanitize/lib/schema.js:37,68). SCHEMA는 attributes에서 a만 덮으므로 이 class들이 살아남고, react-markdown이 그것을 className prop으로 넘긴다. COMPONENTS는 className을 먼저 적고 {...omitNode(p)}를 뒤에 펼치므로 뒤엣것이 이긴다. 실제로 이 저장소의 의존성으로 렌더해 확인했다 — 입력 `- [ ] 할 일` / `- [x] 끝난 일`이 `<ul class="contains-task-list"><li class="task-list-item"> 할 일</li>…</ul>`로 나온다: my-3·list-disc·space-y-1·pl-5가 전부 사라진다. 체크박스는 tagNames에서 input을 뺐으므로 함께 사라져, 결과는 글머리표도 들여쓰기도 위아래 여백도 없고 완료 여부도 구분되지 않는 두 줄이다. 펜스 코드블록의 <code class="language-js">도 같은 이유로 rounded-btn bg-soft…를 잃는다(인라인 코드만 살아남는다). ol도 같다.

**고치기:** 각 컴포넌트에서 스프레드를 className 앞에 두거나(`<ul {...omitNode(p)} className="…" />`), 살균기가 준 class를 살려야 한다면 `className={cn("my-3 list-disc …", p.className)}`처럼 명시적으로 합친다. 최소한 ul·ol·code 셋은 지금 순서를 뒤집어야 한다.

---

### ui-1-R04 · 하단탭이 최장일치를 하지 않아 /merit/recent에서 「상벌점」과 「최근」 두 칸이 동시에 켜지고 aria-current가 둘이 된다

**위치:** `src/components/app-shell/bottom-tab.tsx:16`

```
{items.map((item) => {
        const active = isActive(pathname, item.href);
        const Icon = item.icon;

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
```

`isActive`는 `pathname.startsWith(href)`다(nav.ts:213). 교사 하단탭에는 `/merit`(상벌점)와 `bottomTabItems`가 덧붙인 `/merit/recent`(최근)가 함께 서므로(nav.ts:152-155), `/merit/recent` 화면에서 두 항목 모두 `active`가 참이 되어 두 칸이 진하게 켜지고 `aria-current="page"`가 한 `<nav>` 안에 둘 생긴다 — 낭독기는 「현재 페이지」를 두 번 듣고, 눈으로는 지금 어느 화면인지 정해지지 않는다. 사이드바는 같은 위험을 `activeChild`로 이미 막아 두었고(sidebar.tsx:80 「하나만 켠다 — /merit/stats는 /merit로도 시작해서 그냥 두면 둘 다 강조된다」), 하단탭만 그 처리를 빠뜨렸다.

**고치기:** `nav.ts`의 `activeChild`와 같은 최장일치 선택을 하단탭에도 적용한다 — 걸리는 항목 중 `href.length`가 가장 긴 하나만 `active`로 두고 나머지는 끈다.

> **지난 감사와 겹친다** — 2026-08-31-codebase-audit-deep.md DL-39

---

## 5. 확정 결함 — 낮음 (349건)

● 표시는 **검색으로는 찾을 수 없어 통독해야만 보이는 것**이다. 「지난 감사」 칸이 빈 줄은 신규다.

### 정합성 — 화면과 데이터가 어긋난다 (47건)

| # | 위치 | 무엇이 잘못됐나 | 지난 감사 |
|---|---|---|---|
| infra-R08 | `.dockerignore:20` | ● .dockerignore가 스크립트 3개만 허용하는 것처럼 적혀 있지만 `!scripts` 한 줄이 scripts/ 전체를 들여보낸다 — 아래 세 줄은 아무 일도 하지 않는다 | 기존-미처리<br><sub>2026-08-31-codebase-audit-deep.md DL-71</sub> |
| infra-R06 | `docs/deploy.md:26` | ● 배포 문서의 준비물이 메모리 2GB 이상이라고 하는데, 같은 문서가 4GB에서 빌드가 OOM으로 죽고 8GB에서야 통과했다고 적는다 | 기존-미처리<br><sub>2026-08-31-codebase-audit.md §5 (「docs/deploy.md §0의 최소 사양 2GB가 §5의 빌드 요구 8GB와 모순된다」)</sub> |
| infra-R07 | `docs/deploy.md:305` | ● 배포 문서의 갱신 절차가 `docker compose up -d --build`를 시키고 14줄 뒤에 그 명령이 사이트를 죽인 채로 남긴다고 경고한다 |  |
| infra-R05 | `docs/deploy.md:428` | 배포 문서가 앱 컨테이너 메모리 상한을 512m이라고 적는다 — compose는 1g이고, 512m로 되돌리면 20MB 첨부에서 넘친다 | 기존-미처리<br><sub>2026-08-31-codebase-audit-deep.md DL-69</sub> |
| infra-C03 | `next.config.ts:40` | ● next.config.ts와 docker-compose.yml이 「compose가 BETTER_AUTH_URL에 https를 강제한다」고 두 번 적지만 그런 강제는 어디에도 없다 — 그중 하나는 HSTS를 상시 내보내는 근거로 쓰인다 |  |
| infra-C01 | `scripts/check-standalone.mjs:17` | standalone 검사기가 .dockerignore이 막는 id_rsa·id_ed25519를 통과시킨다 — 두 목록 중 이 두 이름만 어긋난다 |  |
| data-R02 | `scripts/seed-demo.ts:368` | ● seed-demo가 발생일을 최대 4개월 전으로 흩어 학년도(3월~2월) 창 밖으로 밀어내, 서비스가 막는 상태를 직접 만든다 |  |
| data-C02 | `scripts/seed-demo.ts:370` | ● seed-demo의 날짜 흩뿌리기가 setMonth를 setDate보다 먼저 불러, 오늘이 29~31일이면 달 버킷 둘이 같은 달로 무너진다 |  |
| merit-1-C07 | `src/app/(app)/admin/merit/rules/rule-table.tsx:233` | ● 규정 수정에 실패한 뒤 「취소」로 나갔다가 같은 행을 다시 열면 버린 제출값이 되살아난다 |  |
| roster-1-R07 | `src/app/(app)/admin/students/student-table.tsx:232` | ● 학생 표의 학년·반·번호 입력칸만 서버 범위 상수를 min/max로 물리지 않았다 |  |
| adminops-1-C01 | `src/app/(app)/admin/users/[userId]/user-forms.tsx:169` | ● 계정 정보 수정이 거부되면 여덟 칸 중 사유 칸 하나만 비워진다 |  |
| shell-R07 | `src/app/(app)/loading.tsx:4` | ● 공용 뼈대 주석이 자기가 덮는 화면을 둘로 적었지만 실제로는 다섯이다 |  |
| merit-1-C02 | `src/app/(app)/merit/admin-view.tsx:311` | ● 반 고르기 칩은 raw 쿼리를, 명단은 파싱된 범위를 읽어 잘못된 쿼리 하나면 칩과 명단이 서로 다른 범위를 가리킨다 |  |
| merit-1-C03 | `src/app/(app)/merit/recent/page.tsx:295` | ● 마지막 쪽의 마지막 기록을 취소하면 최근 부여가 「기록이 없습니다」로 비고 쪽 넘김도 사라져 돌아갈 길이 없다 |  |
| merit-2-C01 | `src/app/(app)/merit/stats/views/ranking.tsx:111` | 통계에서 학생 이름을 누르면 보고 있던 학년도가 사라진다 — 트랙만 들고 가고 학년도는 버린다 |  |
| merit-2-R11 | `src/app/(app)/merit/stats/views/rule-groups.tsx:273` | 같은 통계 화면 안에 비중을 %로 적는 함수가 둘인데 10% 미만 정수에서 결과가 갈린다 |  |
| shell-R05 | `src/app/(app)/page.tsx:442` | ● 학부모 대시보드에만 「새 글」 카드가 없다 |  |
| auth-1-C06 | `src/app/(app)/parent-invite/page.tsx:107` | 학생 화면만 초대 metadata를 스키마 없이 캐스트하고 폴백 글자도 교사 화면과 달라 「- 학부모님」이 그려진다 |  |
| merit-2-R03 | `src/app/(app)/students/[studentId]/merit-tab.tsx:105` | ● 현재 학년도가 없으면 학년도 칩이 떠도 눌러서 지난 해 기록을 볼 수 없다 — 주석은 볼 수 있다고 적었다 |  |
| merit-2-R02 | `src/app/(app)/students/[studentId]/merit-tab.tsx:241` | ● 활성 규정이 하나도 없으면 부여 폼이 아무 설명 없이 사라진다 — 주석은 이것을 권한 문제로 적었다 | 기존-미처리<br><sub>2026-09-01-full-read-audit.md RL-09</sub> |
| pass-1-C09 | `src/app/(app)/students/[studentId]/pass-tab.tsx:62` | ● 학생 상세 출입증 탭은 상태·쪽을 한 덩어리로 검증해 상태 하나가 틀리면 쪽까지 1로 되돌린다 |  |
| ui-1-C04 | `src/components/app-shell/mobile-nav.tsx:43` | ● 모바일 서랍이 주소 변화로만 닫히는데 주석이 근거로 든 「?track=만 다른 하위 메뉴」는 nav.ts에 없고, 지금 있는 화면의 메뉴를 누르면 서랍이 안 닫힌다 |  |
| pass-1-C13 | `src/components/app-shell/nav.ts:69` | 메뉴 주석이 QR을 「목록에서 한 건을 골라야 뜬다(/pass/{id})」고 적는데 그 화면에는 QR이 없다 | 기존-미처리<br><sub>2026-08-31-codebase-audit-deep.md DL-87</sub> |
| merit-2-R13 | `src/components/merit/award-success-dialog.tsx:58` | ● 부여 성공 모달이 배경뿐 아니라 내용 아무 데나 눌러도 닫힌다 — 주석은 배경이라고 적었다 | 기존-미처리<br><sub>2026-09-01-full-read-audit.md RL-10</sub> |
| merit-2-R06 | `src/components/merit/charts.tsx:313` | StudentNetChart의 thresholds 주석이 그런 prop이 없는 ClassNetChart를 가리킨다 |  |
| ui-1-R01<br><sub>+community-1-R14·adminops-1-R04</sub> | `src/components/ui/confirm-dialog.tsx:155` · `src/modules/admin-users/admin-user.schema.ts:81` | ● ConfirmDialog가 사유 칸 maxLength를 500으로 못박아, 서버가 100·200자로 자르는 다섯 호출부에서 제출이 실패한다 | 기존-미처리<br><sub>2026-08-31-codebase-audit.md L-02 · 2026-08-31-codebase-audit-deep.md DL-58</sub> |
| ui-2-C02 | `src/components/ui/pagination.tsx:88` | ● paginationItems가 페이지 한 장만 빠져도 「…」을 넣어, 숫자보다 넓은 생략부호가 숫자 하나를 가린다 |  |
| ui-2-C01 | `src/components/ui/plain-text.tsx:45` | ● splitLinks가 문장부호를 괄호보다 먼저 떼어, 「(주소.)」에서 마침표가 href 안에 남는다 |  |
| ui-2-R10 | `src/components/ui/section-card.tsx:72` | ● SectionCard variant="panel"이 flush를 조용히 무시한다 |  |
| ui-2-R04 | `src/components/ui/sheet-download.tsx:16` | ● 「내보내기 버튼이 전부 이걸 쓴다」는 주석이 사실이 아니다 — 훅이 옵션을 못 박아 세 버튼이 제 판본을 갖는다 |  |
| ui-2-R05 | `src/components/ui/sheet-download.tsx:36` | ● useSheetDownload가 예외를 안 잡아 서버 액션이 거부되면 오류 배너 없이 조용히 끝난다 |  |
| ui-2-R06 | `src/components/ui/skeleton.tsx:75` | SkeletonField 주석이 존재하지 않는 Input의 dense와 38px·42px를 말한다 — 네 줄 아래 표와 어긋난다 | 기존-미처리<br><sub>2026-09-01-full-read-audit.md RL-14</sub> |
| ui-2-C06 | `src/components/ui/table.tsx:127` | ● Column.className의 설명(「<th>·<td>에 함께 붙는다」)이 세 갈래 렌더 중 어느 것과도 정확히 맞지 않는다 |  |
| core-1-R02 | `src/lib/masks.ts:63` | ● masks.ts가 스스로 못박은 「영숫자를 넣거나 빼지 않는다」를 formatVerificationCode와 formatPhone이 어겨 MaskedInput의 커서가 한 칸 밀린다 |  |
| adminops-2-C02 | `src/modules/audit-log/audit-log.service.ts:28` | ● readAuditLog이 page를 pageCount로 자르지 않아, 범위를 넘은 쪽에서 「몇 건」과 「기록이 없습니다」가 한 카드 안에서 어긋난다 |  |
| community-2-C02 | `src/modules/community/post.service.ts:146` | ● listPostPage가 pageCount를 넘는 page를 그대로 돌려줘, 범위 밖 쪽을 열면 글이 가득한 게시판이 「아직 글이 없습니다 / 첫 글 쓰기」로 보인다 |  |
| roster-1-C01 | `src/modules/enrollment/enrollment.repo.ts:50` | ● 학생 표의 원본 조회에 orderBy가 없어 전교생 목록의 순서가 보장되지 않는다 |  |
| roster-1-C09 | `src/modules/enrollment/roster.export.ts:55` | ● 내보낸 명단 xlsx의 학생 줄 순서가 정해져 있지 않다 |  |
| roster-2-R04 | `src/modules/enrollment/roster.plan.ts:185` | ● 파일에 있지만 오류가 난 줄의 학생이 미리보기의 「명단에서 빠지는 학생」 영구 삭제 목록에 뜬다 |  |
| core-1-C06 | `src/modules/enrollment/roster.repo.ts:70` | roster.repo와 roster.parse가 formatDateInput과 똑같은 en-CA·Asia/Seoul 포맷터를 datetime.ts 밖에서 다시 만든다 |  |
| merit-3-C04 | `src/modules/merit/merit.export.ts:114` | ● 학생 내역 시트만 첫 줄에 조회 범위를 안 적어, 파일 이름이 바뀌면 학년도인지 누적인지 알 길이 없다 |  |
| merit-3-C03 | `src/modules/merit/merit.repo.ts:561` | ● listClassRoster만 유일한 보조 정렬키가 없어 번호 없는 학생들의 줄 순서가 호출마다 달라질 수 있다 | 기존-미처리<br><sub>2026-08-31-codebase-audit.md L-08</sub> |
| merit-3-R01 | `src/modules/merit/merit.repo.ts:1110` | ● 통계 화면의 탭마다 「부여 건수」의 모집단이 다르다 — ruleStats·teacherTotals에만 재적 술어가 없다 | 기존-미처리<br><sub>2026-08-31-codebase-audit.md C-03 · 2026-08-31-codebase-audit-deep.md D-02</sub> |
| pass-3-R07 | `src/modules/pass/decision.service.ts:93` | ● approvePass의 대행 경합 재시도가 교사가 적은 consentNote를 승인 메모로 옮기지 않고 버린다 — 바로 위 주석이 막겠다고 한 상황이다 |  |
| pass-2-R02 | `src/modules/pass/decision.service.ts:97` | ● 대행 승인 폴백에서 교사가 적은 「확인 방법」 문구가 Pass에도 감사로그에도 남지 않고 사라진다 |  |
| pass-1-R10 | `src/modules/pass/decision.service.ts:102` | ● 승인 경합에서 교사가 적은 「확인 방법」이 통째로 버려진다 — 바로 위 주석이 그러지 않겠다고 적은 자리다 |  |
| pass-2-C03 | `src/modules/pass/verify.service.ts:142` | ● 정문 판정의 NOT_APPROVED 갈래가 후보 중 첫 줄을 그냥 집어, 어제 끝난 미결 신청이 오늘 살아 있는 신청을 밀어낸다 |  |

### 권한·소유권 (3건)

| # | 위치 | 무엇이 잘못됐나 | 지난 감사 |
|---|---|---|---|
| ui-1-R02 | `src/components/ui/no-academic-year-notice.tsx:16` | ● NoAcademicYearNotice가 역할을 가리지 않고 학생·학부모에게도 교사 지시문과 교사 전용 링크를 보여준다 |  |
| pass-1-C14 | `src/modules/pass/request.service.ts:301` | getMyStudentQr만 pass 모듈 서비스 중 유일하게 can()을 한 번도 부르지 않는다 | 기존-미처리<br><sub>2026-08-31-codebase-audit.md L-01</sub> |
| pass-2-R04 | `src/modules/pass/request.service.ts:305` | ● getMyStudentQr만 can()도 assertCan도 부르지 않아 학생증 발급이 프로필 행 존재만으로 통과한다 | 기존-미처리<br><sub>2026-08-31-codebase-audit.md L-01</sub> |

### 감사로그 (14건)

| # | 위치 | 무엇이 잘못됐나 | 지난 감사 |
|---|---|---|---|
| community-1-C06 | `src/app/(app)/community/[slug]/[postId]/page.tsx:32` | ● 못 읽는 게시판의 글 주소를 한 번 열면 authz:denied가 두 줄 쌓인다 |  |
| auth-1-C05 | `src/app/(auth)/register/actions.ts:250` | ● signInSilently가 감사로그 한 줄 없이 세션을 만든다 — 로그인 기록에 그 계정의 첫 세션이 없다 |  |
| auth-1-C07 | `src/app/api/auth/[...all]/route.ts:11` | ● sign-out을 화이트리스트로 통과시키면서 로그아웃 감사로그는 어디에도 없다 | 기존-미처리<br><sub>2026-08-31-codebase-audit.md C-09</sub> |
| adminops-1-C02 | `src/modules/admin-users/admin-user.service.ts:267` | ● 되돌릴 수 없는 완전 삭제만 사유를 한 글자도 받지 않아 user:delete 감사로그 상세가 늘 「—」다 |  |
| community-1-R03 | `src/modules/community/attachment.service.ts:199` | ● 미결 첨부의 소유권 거부만 authz:denied를 남기지 않고 ForbiddenError를 맨으로 던진다 | 기존-미처리<br><sub>2026-08-31-codebase-audit.md L-10 · 2026-08-31-codebase-audit-deep.md DL-21</sub> |
| community-1-R07 | `src/modules/community/board.service.ts:171` | ● 게시판 제거만 사유를 서버에서 강제하지 않아 모달을 건너뛴 요청이 사유 없이 통과한다 |  |
| roster-1-C04 | `src/modules/enrollment/enrollment.service.ts:49` | 학생 상세 열람 거부 감사로그가 어느 학생을 보려다 막혔는지를 남기지 않는다 |  |
| roster-1-R06 | `src/modules/enrollment/roster.service.ts:87` | ● 명단 미리보기가 전교생의 이름·생년월일·학생코드를 브라우저로 내보내면서 감사로그를 하나도 남기지 않는다 |  |
| roster-2-R02 | `src/modules/enrollment/roster.service.ts:99` | ● exportRoster만 감사로그를 남기지만 previewRoster가 같은 전교생 개인정보를 기록 없이 내보낸다 |  |
| pass-2-R05 | `src/modules/pass/decision.service.ts:126` | ● pass:approve만 메모를 reason이 아닌 키로 남겨 승인 메모·대행 확인 메모가 감사로그 화면에 전혀 뜨지 않는다 |  |
| pass-2-R06 | `src/modules/pass/request.service.ts:176` | ● pass:consent가 보호자 확인 메모를 반려·취소 전용으로 못박은 reason 키에 담는다 |  |
| pass-2-C06 | `src/modules/pass/request.service.ts:307` | ● 학생증 QR 거부 기록이 사용자 id를 targetType "Pass"에 넣고 시도 동작을 「출입증 신청」이라고 적는다 | 기존-미처리<br><sub>2026-08-31-codebase-audit.md L-06 · 2026-08-31-codebase-audit-deep.md DL-19 · 2026-09-01-full-read-audit.md RL-21</sub> |
| roster-3-R04 | `tests/modules/enrollment/roster.service.test.ts:760` | revokedInvites 픽스처에 status가 없어 폐기 감사로그의 status가 단언되지 않는다 |  |
| roster-3-C08 | `tests/modules/enrollment/roster.service.test.ts:811` | ● exportRoster의 metadata.count와 deleted 필터를 보는 단언이 없다 — 「무엇을 얼마나 받아갔나」가 미검증이다 |  |

### 경쟁 상태·트랜잭션 경계 (4건)

| # | 위치 | 무엇이 잘못됐나 | 지난 감사 |
|---|---|---|---|
| roster-1-C10 | `src/app/(app)/admin/students/panel.tsx:44` | ● 학생 탭이 표에 실어 보내는 학년도를 행을 뽑은 조회와 다른 조회에서 얻는다 |  |
| roster-2-C02 | `src/modules/enrollment/roster.repo.ts:302` | ● 신규 학생 초대코드를 한 건씩 create하는 루프가, 같은 파일이 「왕복 수를 1로 줄여야 한다」고 못 박은 학년도 잠금 안에서 돈다 |  |
| merit-3-R04<br><sub>+roster-1-R03</sub> | `src/modules/merit/award.service.ts:327` · `src/modules/enrollment/enrollment.service.ts:236` | 일괄 부여가 AcademicYear 잠금을 쥔 채 감사로그를 학생 수만큼 왕복한다 — recordAuditMany가 바로 이 자리를 위해 있다 | 기존-미처리<br><sub>2026-08-31-codebase-audit-deep.md DL-14</sub> |
| merit-3-C05 | `src/modules/merit/stats.service.ts:588` | ● getRankingStats가 먼저 띄운 classesPromise는 앞의 조회가 먼저 실패하면 처리되지 않은 거부로 남는다 |  |

### 계층 규약 (7건)

| # | 위치 | 무엇이 잘못됐나 | 지난 감사 |
|---|---|---|---|
| auth-1-R07 | `src/app/(app)/admin/invites/panel.tsx:69` | 초대 metadata를 읽는 자리 셋 중 둘이 namedInviteMetaSchema 대신 as 캐스트를 쓴다 |  |
| shell-C09 | `src/app/(app)/page.tsx:134` | ● 대시보드가 유효 창 문자열을 `passPeriod` 대신 직접 조립해, 같은 날에 시작하고 끝나는 외박에서 종료 날짜가 사라진다 | 기존-미처리<br><sub>2026-08-31-codebase-audit-deep.md DL-37</sub> |
| ui-1-R03 | `src/components/app-shell/nav.ts:98` | ● 커뮤니티 하위 메뉴 「게시판」에 roles가 없어, 주석이 약속한 「학생·학부모에게는 평범한 링크」가 되지 않는다 |  |
| ui-1-R14 | `src/components/app-shell/sidebar.tsx:223` | 사이드바만 honorificName을 부르지 않고 이름+호칭을 손으로 이어 붙인다 |  |
| core-1-C01 | `src/core/auth/session.ts:56` | requireAuth가 isLoginBlocked를 부르지 않고 같은 판정을 손으로 다시 적는다 — prisma/schema.prisma는 부른다고 적어 놓았다 |  |
| adminops-2-C01 | `src/modules/audit-log/audit-log.schema.ts:26` | audit-log.schema가 lib/datetime의 kstDayStart를 손으로 다시 조립한다 |  |
| merit-3-R06 | `src/modules/merit/merit.repo.ts:87` | findCurrentYearForUpdate가 roster.repo의 같은 함수와 글자 그대로 중복이고, AcademicYear 조회를 소유 모듈 밖에서 세 번째로 다시 짠다 | 기존-미처리<br><sub>2026-08-31-codebase-audit-deep.md DL-16</sub> |

### 테스트 — 지킨다고 적어 놓고 못 지키는 단언 (99건)

| # | 위치 | 무엇이 잘못됐나 | 지난 감사 |
|---|---|---|---|
| infra-R09 | `.github/workflows/ci.yml:142` | ● CI가 runner 이미지를 짓고 버린다 — 컨테이너에서만 깨지는 경로에 자동 검증이 하나도 없다 |  |
| core-1-R05 | `src/core/audit/audit.ts:66` | recordAuditMany에 직접 단위 테스트가 하나도 없다 — 유일한 호출자의 테스트는 이 함수를 목으로 갈아끼운다 | 기존-미처리<br><sub>2026-09-01-full-read-audit.md RL-29</sub> |
| merit-3-C01 | `tests/app/(app)/admin/merit/rules/actions.test.ts:272` | ● 규정 삭제·수정 액션의 ruleId 실패 테스트가 문구를 보지 않아, 영문 zod 메시지가 화면으로 나가도 통과한다 |  |
| merit-4-C05 | `tests/app/(app)/admin/merit/rules/rule-table.test.tsx:42` | ● RuleTable의 0건 분기와 「분류 한 개」 분기를 아무 테스트도 지나가지 않는다 |  |
| adminops-2-R09 | `tests/app/(app)/admin/settings/actions.test.ts:45` | ● 기준 저장 성공이 /merit 레이아웃까지 다시 그리는지 확인하는 단언이 없어, 그 줄을 지워도 테스트가 전부 통과한다 |  |
| adminops-2-C05 | `tests/app/(app)/admin/settings/actions.test.ts:106` | 설정 액션 테스트의 마지막 목만 mockRejectedValue라, 뒤에 테스트를 더하면 서비스가 영구히 거부 상태로 남는다 |  |
| roster-2-C07 | `tests/app/(app)/admin/students/import/actions.test.ts:455` | ● 「계정이 안 만들어진 신규 줄을 화면까지 전달한다」 테스트의 목이 화면이 실제로 그리는 status를 빼고 있다 |  |
| roster-2-R09 | `tests/app/(app)/admin/students/import/import-form.test.ts:2` | 화면 파일 이름을 단 테스트 둘이 그 화면을 한 번도 임포트하지 않는다 |  |
| roster-2-C05 | `tests/app/(app)/admin/students/student-table.test.ts:17` | ● clearUnchangedSubmittedDrafts의 세 갈래 중 「제출한 학생이 목록에서 사라진 경우」만 검사가 없다 |  |
| adminops-2-R04 | `tests/app/(app)/admin/users/actions.test.ts:323` | 세 폼이 보내는 「사유」가 서비스까지 가는지 검사하는 테스트가 비밀번호 초기화 하나뿐이고, auditReason 스키마 자체는 한 줄도 테스트되지 않는다 |  |
| adminops-2-R05 | `tests/app/(app)/admin/users/actions.test.ts:333` | ● 확인 모달이 의존하는 「성공마다 새 객체」 불변식을 지키는 테스트가 없어, 고정 상수로 되돌려도 전부 통과한다 |  |
| merit-4-R11 | `tests/app/(app)/merit/actions.test.ts:112` | ● toState의 ForbiddenError 분기가 부여·일괄·취소 액션에서는 한 번도 검사되지 않는다 — 내보내기 셋만 본다 |  |
| merit-4-C06 | `tests/app/(app)/merit/actions.test.ts:232` | ● toState의 예상 못 한 오류 분기(폴백 + console.error)를 어느 테스트도 지나가지 않는다 — 형제 분기 둘은 로그까지 검사한다 |  |
| merit-4-R03 | `tests/app/(app)/merit/actions.test.ts:312` | ● 부여·취소 뒤 정식 주소 `/students/<id>` 무르기를 아무 테스트도 검사하지 않는다 — 308 리다이렉트로만 남은 옛 주소만 본다 |  |
| merit-4-R10<br><sub>+merit-3-R07·adminops-2-R06</sub> | `tests/app/(app)/merit/actions.test.ts:494` · `tests/app/(app)/admin/merit/rules/actions.test.ts:296` · `tests/app/(app)/admin/users/actions.test.ts:558` | ● describe("모든 액션이 requireAuth로 시작한다")가 여섯 액션 중 하나만 본다 |  |
| auth-2-R06 | `tests/app/(app)/parent-invite/actions.test.ts:104` | 학부모 코드 테스트가 존재하지 않는 권한 액션 이름 invite:create-own을 쓴다 |  |
| auth-2-C04 | `tests/app/(auth)/login/submit.route.test.ts:6` | ● 로그인 라우트 테스트가 recordAudit을 목으로 끊지 않아 단위 테스트가 실제 DB 접속을 시도하고, 로그인 감사로그는 저장소 어디서도 단언되지 않는다 |  |
| community-2-R03 | `tests/app/api/community/attachments/route.test.ts:9` | ● 첨부 라우트 테스트가 문 셋 중 「동시 업로드 수」만 통째로 빼놓았다 |  |
| community-2-C07 | `tests/app/api/community/attachments/route.test.ts:207` | ● 내려받기 헤더 테스트의 이름이 「헤더 넷」이지만 다섯을 단언하고 라우트는 여섯을 붙인다 |  |
| shell-C07 | `tests/app/suspense-keys.test.ts:49` | ● Suspense key 검사의 허용 목록이 경계 단위가 아니라 파일 단위라, 그 파일에 진짜 형제 충돌이 들어와도 통과한다 |  |
| merit-4-R12 | `tests/components/merit/rule-filter.test.ts:63` | ● groupRules의 「연속된 것만 묶는다」가 검사되지 않는다 — 비연속 중복이 두 묶음이 되는지 보는 케이스가 없다 |  |
| ui-2-C09 | `tests/components/ui/markdown.test.tsx:94` | ● markdown 살균 테스트의 「img onerror」 사례가 정작 <img를 검사하지 않는다 |  |
| core-1-C02 | `tests/core/auth/credential-session-boundary.test.ts:49` | ● credential-session-boundary 테스트가 FOR UPDATE를 한 번도 확인하지 않는다 — 잠금을 통째로 지워도 초록으로 통과한다 |  |
| core-2-R04 | `tests/core/auth/session.test.ts:20` | session.ts의 권한 게이트 requirePermission()과 세션 정규화 getSessionUser()에 단언이 하나도 없다 | 기존-미처리<br><sub>2026-08-31-codebase-audit-deep.md DL-77</sub> |
| core-2-R10 | `tests/core/authz/pass-type.test.ts:31` | ● requiresConsent의 문서화된 계약 「모르는 값은 false」가 테스트에 없다 — 인자를 string으로 받는 결정을 아무것도 지키지 않는다 |  |
| core-2-C02 | `tests/core/db/transaction-conflict.test.ts:56` | ● transaction-conflict 테스트의 「안 터진다」 목록에 깨진 meta 모양이 하나도 없다 |  |
| core-2-R09 | `tests/core/db/unique-violation.test.ts:162` | ● unique-violation 테스트가 근거로 인용한 두 줄 번호가 모두 실제 코드와 어긋난다 |  |
| shell-R08 | `tests/e2e/attachment.smoke.spec.ts:173` | ● 첨부 왕복 e2e가 정작 깨지기 쉬운 CSP 헤더를 확인하지 않는다 | 기존-미처리<br><sub>2026-08-31-codebase-audit-deep.md DL-76</sub> |
| merit-4-C11 | `tests/integration/merit.bulk-award.integration.test.ts:224` | ● 학년도 경합 픽스처가 isCurrent를 8114로 옮기는데 afterAll은 되돌리지 않고 그 행을 지운다 |  |
| merit-4-C02 | `tests/integration/merit.bulk-award.integration.test.ts:235` | ● 통합 픽스처가 고정 접미사로 User id를 짓는데 테스트 DB는 리셋되지 않는다 — 같은 파일의 경합 테스트만 randomUUID를 쓴다 |  |
| merit-4-R14 | `tests/integration/merit.bulk-award.integration.test.ts:391` | ● 통합 테스트 「기록끼리 묶이지 않는다」가 묶임 여부를 전혀 검사하지 않는다 |  |
| pass-3-R08 | `tests/integration/pass.list-window.integration.test.ts:122` | ● 통합 테스트에 실패할 수 없는 단언이 하나 있다 — 방금 그 id로 만든 행의 id를 다시 확인한다 |  |
| pass-3-C02 | `tests/integration/pass.list-window.integration.test.ts:194` | ● 학부모 내역이 「지금 동의할 수 있는 외박」을 빼는 규칙에 닿는 단언이 저장소 전체에 없다 — getMyChildPasses가 now를 받는 유일한 이유다 |  |
| pass-3-C06 | `tests/integration/pass.list-window.integration.test.ts:227` | ● 「이름과 id로 항상 같다」는 테스트가 이름이 서로 다른 자녀 둘만 만들어 id 동점 끊기를 전혀 검증하지 못한다 |  |
| auth-3-R07 | `tests/integration/registration.atomicity.integration.test.ts:238` | ● 학년도 경합 통합 테스트가 가입 프라미스를 100ms 동안 핸들러 없이 들고 있어 실패가 미처리 거부로 새어 나간다 |  |
| roster-2-R06 | `tests/integration/roster.audit-rollback.integration.test.ts:96` | 명단 롤백 통합 테스트의 제목이 지금은 없는 「소프트 삭제」를 검증한다고 적혀 있다 |  |
| core-2-R07 | `tests/lib/date-input.test.ts:8` | ● date-input 테스트에 0~99년 사례가 없어, 구현이 존재하는 이유인 `new Date(0)`+setUTCFullYear 우회를 아무것도 지키지 않는다 |  |
| core-2-R02 | `tests/lib/datetime.timezone.test.ts:88` | ● formatClock의 유일한 테스트가 23:59:59·00:00:00만 넣어, 이 함수가 존재하는 이유인 「시 자리 두 자리 고정」을 전혀 검사하지 않는다 |  |
| core-2-R05 | `tests/lib/masks.test.ts:24` | ● formatPhone의 붙여넣기 목록이 국내 0을 그대로 둔 +82 표기(`+82 010-…`)를 빠뜨려, 주석이 막는다고 적은 「없는 번호」가 그대로 통과한다 |  |
| core-2-R08 | `tests/lib/safe-next.test.ts:19` | ● 오픈 리다이렉트를 막는 유일한 자리의 테스트가 DEL(0x7f)과 길이 경계를 빼놓았다 — hasControlChar가 문자 클래스 대신 코드포인트를 보는 이유가 검사되지 않는다 |  |
| core-2-C05 | `tests/lib/student-code.test.ts:38` | ● isStudentCode의 「첫 글자는 문자」 가드를 지워도 이 파일의 단언이 전부 통과한다 |  |
| core-2-C08 | `tests/lib/user-fields.test.ts:11` | ● 붙여넣기 마스크→phoneField 합성 경로를 도는 테스트가 없다 — 초대코드 쪽에는 있다 |  |
| roster-2-R07 | `tests/modules/academic-year/academic-year.repo.test.ts:74` | ● academic-year.repo 테스트의 tx 목과 prisma 목이 같은 함수 인스턴스라 「전달된 db로 쓴다」를 검증하지 못한다 |  |
| auth-3-C10 | `tests/modules/account/account.repo.test.ts:53` | ● credential 행 잠금 단언이 호출 횟수뿐이라 FOR UPDATE인지도, 어느 userId를 잠그는지도 보지 않는다 |  |
| adminops-2-C04 | `tests/modules/admin-users/admin-user.service.test.ts:231` | 자기 계정 차단 셋 중 CANNOT_RESET_SELF만 테스트가 하나도 없다 |  |
| adminops-2-R03 | `tests/modules/audit-log/audit-log.labels.test.ts:67` | 액션 스캐너의 하한 39가 실제 42보다 세 개 낮아, 「하한을 실제 개수 바로 아래에 둔다」는 자기 주석을 어긴다 | 기존-재발<br><sub>2026-09-01-full-read-audit.md R-08 (= 2026-08-31-codebase-audit.md C-02)</sub> |
| adminops-2-R02 | `tests/modules/audit-log/audit-log.labels.test.ts:99` | ● 라벨 테스트에 targetType 커버리지 검사가 없어, 실제로 기록되는 유일한 미번역 대상 「Authz」가 감사로그 표에 영문 그대로 나간다 |  |
| adminops-2-R08 | `tests/modules/audit-log/audit-log.repo.test.ts:9` | ● 감사로그 repo 테스트가 findPage의 정렬키만 보고, 필터를 만드는 toWhere와 countMatching은 한 줄도 안 지난다 |  |
| adminops-2-C03 | `tests/modules/audit-log/audit-log.service.test.ts:41` | ● 감사로그 서비스 테스트가 반환 계약을 하나도 단언하지 않아, entries·total·actions를 통째로 잃어도 전부 통과한다 |  |
| auth-3-C11 | `tests/modules/bootstrap/bootstrap.service.test.ts:144` | ● bootstrap 테스트가 tx를 인라인 {tx:true} 구조 비교로만 확인해 「사용자·감사가 같은 트랜잭션」을 증명하지 못한다 |  |
| community-2-R07 | `tests/modules/community/board.service.test.ts:17` | ● board.service.test.ts에 listReadableWithActivity 테스트가 없고 repo 목에 그 함수 자체가 빠져 있다 | 기존-미처리<br><sub>2026-08-31-codebase-audit-deep.md DL-75</sub> |
| community-2-R02 | `tests/modules/community/schema.test.ts:2` | ● schema.test.ts가 글·댓글 스키마를 하나도 검증하지 않아 글당 첨부 5개 상한이 저장소 전체에서 무검증이다 |  |
| roster-3-C10 | `tests/modules/enrollment/enrollment.service.test.ts:85` | ● 표 편집 저장이 학년도를 잠그고 읽는지 보는 단언이 없다 — 형제 파일에는 같은 단언이 있다 |  |
| roster-3-C06 | `tests/modules/enrollment/roster.parse.test.ts:56` | 「엑셀이 날짜를 숫자로 바꿔놔도 받아낸다」는 제목이 약속한 5자리 일련번호 갈래를 아무 테스트도 태우지 않는다 | 기존-미처리<br><sub>2026-09-01-full-read-audit.md RL-31 (§4 낮음 표)</sub> |
| roster-3-R14 | `tests/modules/enrollment/roster.parse.test.ts:346` | ● preflightXlsx의 거부 사유 중 절반이 미검증이다 — XLSX_TOO_LARGE는 화면 문구까지 있는데 분기를 타는 테스트가 없다 |  |
| roster-3-R03 | `tests/modules/enrollment/roster.preview-token.test.ts:29` | ● 「정상 토큰만 통과한다」가 양성 한 줄뿐이라 봉인이 비밀키에 묶여 있는지를 아무도 확인하지 않는다 |  |
| roster-3-R01 | `tests/modules/enrollment/roster.repo.listExisting.test.ts:20` | ● 내보내기의 입학반·입학번호를 만드는 entrySeats()가 통째로 미검증이다 |  |
| roster-3-C04 | `tests/modules/enrollment/roster.repo.test.ts:144` | 「초대코드를 먼저 지우고」의 「먼저」를 지키는 순서 단언이 없다 — 바로 아래 테스트는 그 기법을 쓴다 |  |
| roster-3-C07 | `tests/modules/enrollment/roster.service.test.ts:176` | ● 「Set이 배치 안의 중복까지 막는다」를 지키는 테스트가 없다 — 목이 늘 새 코드를 준다 |  |
| roster-3-R13 | `tests/modules/enrollment/roster.service.test.ts:279` | 초대코드 만료 일수 단언이 expect.any(Number)라 0일이어도 통과한다 |  |
| roster-3-C09 | `tests/modules/enrollment/roster.service.test.ts:662` | ● applyRosterPlan이 돌려주는 saved를 아무 테스트도 읽지 않는다 — 화면이 「N명 반영」으로 쓰는 값이다 |  |
| roster-3-R12 | `tests/modules/enrollment/roster.service.test.ts:880` | ● previewRoster가 「아무것도 저장하지 않는다」를 지키는 단언이 없다 |  |
| auth-3-C07 | `tests/modules/invites/invite.repo.test.ts:54` | ● listStudents 테스트가 deletedAt 필터만 보고 year 스코프도 정렬도 검증하지 않는다 |  |
| auth-3-R08 | `tests/modules/invites/invite.repo.test.ts:80` | ● 「무기한 코드는 센다」 테스트가 바로 위 테스트 단언의 부분집합이라 새로 지키는 것이 없다 |  |
| auth-3-C08 | `tests/modules/invites/invite.service.test.ts:277` | ● createParentInvite에는 잠금 실패(NOT_A_STUDENT) 분기 테스트가 없다 — 쌍둥이 createParentInviteFor에만 있다 |  |
| auth-3-R03 | `tests/modules/invites/invite.service.test.ts:294` | listInvites 테스트만 repo 인자(현재 학년도)를 확인하지 않는다 — 바로 아래 형제 단언은 확인한다 |  |
| auth-3-C09 | `tests/modules/invites/invite.service.test.ts:368` | ● 소유권 거부 픽스처가 role·createdById를 통째로 비워, 네 조건 중 무엇이 막았는지 못 가른다 |  |
| merit-4-R08 | `tests/modules/merit/award.service.test.ts:102` | ● 현재 학년도가 없을 때(findCurrentYearForUpdate → null) 부여가 막히는지 서비스 테스트가 확인하지 않는다 |  |
| merit-4-R13 | `tests/modules/merit/award.service.test.ts:122` | ● 부여 대상 조회 목이 repo가 select하지 않는 studentCode·user.id를 돌려준다 | 기존-미처리<br><sub>2026-08-31-codebase-audit.md C-28 (재확인: 2026-09-01-verification-pass.md §6 중간 C-28)</sub> |
| merit-4-R02 | `tests/modules/merit/award.service.test.ts:242` | ● 단건 부여의 트랜잭션 예산(timeout 30초·maxWait 5초)을 아무 테스트도 잡지 않는다 — 일괄만 잡는다 |  |
| merit-4-R01 | `tests/modules/merit/award.service.test.ts:642` | ● 일괄 부여의 감사로그가 학생과 짝이 맞는지 아무 테스트도 검사하지 않는다 — 건수만 센다 |  |
| merit-4-C10 | `tests/modules/merit/award.service.test.ts:724` | ● 「돌려주는 건수가 실제로 넣은 수와 같다」가 어떤 계산도 가르지 못한다 — 목이 늘 2건을 돌려주기 때문 |  |
| merit-4-R07 | `tests/modules/merit/award.service.test.ts:895` | ● exportRecentAwards의 권한 거부 테스트가 없고, 유일한 테스트가 listRecentAwards describe 안에 들어가 있다 |  |
| merit-4-C03 | `tests/modules/merit/award.service.test.ts:948` | ● searchStudents 매핑 테스트 셋이 기본 옵션(includeRemoved:false)으로는 repo가 절대 돌려줄 수 없는 행을 흉내 낸다 |  |
| merit-4-C04 | `tests/modules/merit/merit.chart.test.ts:130` | ● categoryDistribution 테스트에 상쇄점(OFFSET)이 한 건도 없다 — 같은 파일의 monthlyTotals는 두 번 못 박는다 |  |
| merit-5-C08 | `tests/modules/merit/merit.repo.recent.test.ts:50` | ● 쪽 경계를 고정하는 유일 보조 정렬키 검사가 최근 부여 세 질의에만 걸려 있고, 같은 주석을 단 listAwards·searchStudents에는 없다 |  |
| merit-5-C05 | `tests/modules/merit/merit.repo.totals.test.ts:510` | ● 「취소된 기록은 어느 집계에도 안 든다」 목록에 unusedRules가 빠져 있다 | 기존-미처리<br><sub>2026-09-01-full-read-audit.md RL-36</sub> |
| merit-5-R06 | `tests/modules/merit/merit.schema.test.ts:81` | ● 「ruleId가 없으면 거부한다」가 updatedAt도 빠뜨린 입력을 써서 ruleId를 격리하지 못한다 |  |
| merit-5-C07 | `tests/modules/merit/merit.schema.test.ts:345` | 검증 실패 문구 테스트가 한글 문구를 이미 붙인 필드만 골라 담아, 영문 zod 문구가 새는 자리를 못 잡는다 |  |
| merit-5-R04 | `tests/modules/merit/merit.stats-scope.test.ts:100` | ● topRules가 규정의 현재 이름으로 스냅샷을 바꿔치기하는 동작에 테스트가 없다 — 같은 동작의 ruleStats 쪽에는 있다 |  |
| merit-5-C09 | `tests/modules/merit/merit.stats-scope.test.ts:151` | ● 상위 10개를 자르는 자리의 동점 보조 정렬키를 아무 테스트도 보지 않는다 |  |
| merit-5-C11 | `tests/modules/merit/merit.watch-list.test.ts:245` | ● 학생이 0명인 반을 골랐을 때 studentProfileIds가 빈 배열로 넘어가는지 아무도 안 본다 |  |
| merit-5-R05 | `tests/modules/merit/rule.service.test.ts:141` | 제목은 「바뀐 항목만」인데 arrayContaining이라 안 바뀐 항목이 섞여도 통과한다 |  |
| merit-5-C06 | `tests/modules/merit/stats.ranking.test.ts:205` | ● 「고른 반을 그대로 소속으로 붙인다」 단언이 픽스처 때문에 실패할 수 없다 |  |
| pass-3-R03 | `tests/modules/pass/decision.service.test.ts:28` | decision.service의 listStudentsForIssue·countStudentPasses는 테스트가 하나도 없고, repo 목에 그 함수들이 아예 빠져 있어 지금 상태로는 부를 수도 없다 |  |
| pass-3-R02 | `tests/modules/pass/decision.service.test.ts:304` | ● 대행 승인 경합의 재시도에서 교사가 적은 「확인 방법」 문장이 어디에도 안 남는데, 테스트가 그것을 정답으로 못 박는다 |  |
| pass-3-C07 | `tests/modules/pass/decision.service.test.ts:342` | ● approvePass·issuePass의 학생 거부 테스트만 repo 미호출을 확인하지 않는다 — 같은 파일의 다른 셋은 확인한다 |  |
| pass-3-C04 | `tests/modules/pass/decision.service.test.ts:405` | ● issuePass의 「시작은 DB 시각이다」에 단언이 닿지 않는다 — 목이 호출자의 now와 같은 값을 돌려줘서다 |  |
| pass-3-R09 | `tests/modules/pass/decision.service.test.ts:525` | 「결재 대기는 교사만 본다」만 거부 시 repo 미호출을 확인하지 않는다 — 바로 아래 쌍둥이 테스트는 확인한다 |  |
| pass-3-C08 | `tests/modules/pass/pass.export.test.ts:235` | ● 「반려·취소 사유는 비고 한 칸에 모인다」가 실제로 두 조각이 섞이는 유일한 갈래(승인 뒤 취소)를 검사하지 않는다 |  |
| pass-3-R11 | `tests/modules/pass/pass.labels.test.ts:2` | pass.labels.ts의 requesterRole·consenterRole은 저장소 전체에 테스트가 없다 — 화면의 호칭(선생님/학부모님/님)을 정하는 함수다 |  |
| pass-3-C09 | `tests/modules/pass/pass.qr.test.ts:25` | ● 「빈 매트릭스는 빈 문자열이다」가 빈 매트릭스가 아니라 전부 false인 1×2 행렬을 넣는다 |  |
| pass-3-R05 | `tests/modules/pass/request.service.test.ts:518` | ● getMyStudentQr의 「교사·학부모는 못 받는다」 테스트가 두 역할 모두 학생 프로필을 null로 강제해, 역할 제한을 전혀 검증하지 못한다 |  |
| auth-3-C05 | `tests/modules/registration/registration.repo.test.ts:150` | ● 「학년도 전환과 같은 순서로 잠근 뒤」라는 제목이 $queryRaw 호출 횟수만 세고 SQL을 보지 않는다 |  |
| auth-3-C03 | `tests/modules/registration/registration.service.test.ts:40` | ● 현재 학년도가 없을 때(NO_CURRENT_YEAR) 학생 가입이 어떻게 실패하는지 아무 테스트도 고정하지 않는다 |  |
| auth-3-C04 | `tests/modules/registration/registration.service.test.ts:195` | ● 학생 가입 트랜잭션의 timeout·maxWait을 단언하지 않아 소스가 길게 설명한 값이 지워져도 통과한다 |  |
| auth-3-R02 | `tests/modules/registration/registration.service.test.ts:472` | ● 가입 성공 경로 단언이 requireVerified의 채널↔필드 짝을 전혀 확인하지 않는다 |  |
| auth-3-C12 | `tests/modules/verification/aligo.test.ts:22` | ● 「셋 중 하나라도 없으면」이라는 제목이 SMS_SENDER 누락 한 가지만 검증한다 |  |
| auth-3-C13 | `tests/modules/verification/verification.service.test.ts:311` | ● requireVerified 테스트가 findVerified에 넘기는 30분 cutoff를 한 번도 단언하지 않는다 |  |

### 오류 코드와 화면 문구 (15건)

| # | 위치 | 무엇이 잘못됐나 | 지난 감사 |
|---|---|---|---|
| auth-1-C04 | `src/app/(app)/admin/invites/actions.ts:199` | 폐기 액션만 zod 오류에 한글 폴백이 없어 영문 기본 문구가 화면으로 샌다 |  |
| pass-1-R01 | `src/app/(app)/pass/actions.ts:139` | ● 철회 사유가 200자를 넘으면 「출입증을 찾을 수 없습니다」라는 엉뚱한 오류가 뜬다 |  |
| pass-1-C11 | `src/app/(app)/pass/decision-panel.tsx:34` | ● 승인이 먼저 실패하면 그 뒤의 반려 실패 문구가 결재 패널에 영영 뜨지 않는다 |  |
| pass-1-C02 | `src/app/(app)/pass/qr/student-qr.tsx:52` | ● 학생증 QR이 세션 만료(401)를 「연결이 끊겼다」로 알리고 약 3초마다 무한히 다시 부른다 |  |
| auth-1-R11 | `src/app/(auth)/login/submit/route.ts:76` | ● 인증 서버의 5xx 응답이 credentials로 떨어져 서버 장애를 「비밀번호가 맞지 않습니다」로 알린다 | 기존-미처리<br><sub>2026-09-01-full-read-audit.md RL-08</sub> |
| auth-1-R05 | `src/app/(auth)/register/actions.ts:76` | ● 최초 교사 생성 액션만 예상 못 한 오류를 로그 한 줄 없이 삼킨다 |  |
| community-1-R02 | `src/app/api/community/attachments/route.ts:50` | EXIF 벗기기 실패 문구가 「익명 게시판」 전용이라고 말하지만 그 오류는 실명 게시판에서도 난다 |  |
| community-2-C09 | `src/app/api/community/attachments/route.ts:158` | ● 업로드 라우트가 망가진 multipart 본문에 500을 낸다 — 같은 파일의 다른 입력 오류는 전부 4xx다 |  |
| community-1-R13 | `src/app/api/community/attachments/route.ts:160` | ● 손상된 multipart 본문이 코드화된 4xx가 아니라 500으로 샌다 |  |
| ui-1-R08 | `src/components/app-shell/sign-out-button.tsx:18` | 로그아웃이 실패하면 아무 표시 없이 버튼만 영구히 잠긴다 |  |
| ui-1-R13<br><sub>+ui-1-C02</sub> | `src/components/ui/confirm-dialog.tsx:101` | ● ConfirmDialog를 다시 열면 지난 실패의 오류 문구가 그대로 남아 있다 |  |
| auth-2-R04<br><sub>+auth-2-C02</sub> | `src/modules/invites/invite.schema.ts:115` · `src/modules/invites/invite.schema.ts:45` | revokeInviteSchema의 inviteId만 한글 문구가 없어 zod 영문 기본 문구가 폐기 화면으로 그대로 나간다 |  |
| auth-2-C03 | `src/modules/invites/invite.schema.ts:116` | revokeInviteSchema의 reason.max(500)에도 한글 문구가 없다 — 문구가 빠진 검사는 inviteId 하나가 아니다 |  |
| merit-3-R09<br><sub>+merit-3-C02</sub> | `src/modules/merit/merit.schema.ts:141` · `src/modules/merit/merit.schema.ts:39` | awardSchema·cancelSchema·updateRuleSchema의 id 필드에만 한국어 문구가 없어 zod 영문 기본 메시지가 화면으로 나간다 |  |
| auth-2-R02 | `src/modules/registration/registration.service.ts:160` | 현재 학년도가 없으면 가입이 AcademicYearError로 끝나는데 로그인 이전 화면에는 그 코드를 옮길 사전이 없어 「가입하지 못했습니다.」만 뜬다 |  |

### 문구·용어 (58건)

| # | 위치 | 무엇이 잘못됐나 | 지난 감사 |
|---|---|---|---|
| infra-R04 | `.env.example:42` | .env.example 주석이 SMS_TEST_MODE에 「Y」를 넣으라고 하지만 코드는 "true"만 인정한다 — 주석대로 하면 실제 발송·과금이 된다 |  |
| data-C04<br><sub>+data-C05</sub> | `CLAUDE.md:49` · `README.md:101` | CLAUDE.md가 소유권 규칙의 유일한 예시로 드는 `getMyAwards(sessionUser)`가 저장소에 존재하지 않는다 |  |
| data-R06 | `CLAUDE.md:91` | ● CLAUDE.md의 merit 서비스 목록이 threshold.service.ts를 빠뜨려 셋이라고 적는다 |  |
| data-R05 | `CLAUDE.md:109` | ● CLAUDE.md 폴더 구조 트리가 같은 문서의 다른 문단이 근거로 드는 라우트들을 빠뜨린다 |  |
| data-C11 | `CLAUDE.md:115` | ● CLAUDE.md 폴더 구조 트리의 `components/`·`tests/` 줄이 실제 디렉터리를 절반만 적는다 |  |
| data-C08 | `prisma/schema.prisma:323` | ● schema.prisma의 `Invite.studentId` 주석이 「학생 본인이 만들 때 세션에서 채운다」고만 적지만, 교사가 학생을 지정해 만드는 두 번째 경로가 있다 |  |
| data-R07 | `prisma/schema.prisma:509` | ● schema.prisma의 occurredOn 주석이 소급 입력을 전제하지만 부여 경로에 소급 입력이 없다 |  |
| pass-2-R08 | `prisma/schema.prisma:565` | ● Pass 모델 주석이 외박을 자정 눈금이라 적고 decisionNote를 반려 사유 전용이라 적어 둘 다 코드와 어긋난다 | 기존-미처리<br><sub>2026-08-31-codebase-audit-deep.md DL-85</sub> |
| data-R03 | `README.md:11` | ● README 첫 표의 규모·테스트 수치가 전부 실제보다 작다 (모델 15→20, 모듈 10→12, 화면 20→38) |  |
| data-R04 | `README.md:123` | ● README가 권한 액션이 13개라고 적지만 can.ts의 Action 유니온은 23개다 |  |
| data-C01 | `scripts/seed-demo.ts:8` | ● seed-demo의 머리 주석이 「Prisma를 직접 건드리는 곳은 두 군데뿐」이라고 하지만 build()에서만 여섯 곳이고, 아래 주석은 「여기만」이라고 해 서로도 어긋난다 |  |
| data-C03 | `scripts/seed-demo.ts:127` | ● seed-demo cleanUp의 「외래키가 이 순서를 요구한다」가 거짓이다 — 열거된 삭제는 전부 Cascade라 순서가 필요 없고, 정작 순서를 강제하는 Restrict 하나는 빠져 있다 |  |
| community-1-R10 | `src/app/(app)/admin/community/[communityId]/delete-community.tsx:35` | 게시판 제거 모달 제목이 조사 「을」을 고정해 모음으로 끝나는 게시판 이름에서 어긋난다 |  |
| community-1-R12 | `src/app/(app)/admin/community/community-form.tsx:229` | 익명 게시판 설정 안내가 「화면에서」를 빼고 「교사도 마찬가지」라고 적어 교사에게 실제보다 강한 약속을 한다 |  |
| adminops-1-C06 | `src/app/(app)/admin/logs/log-filters.tsx:49` | 동작 필터를 Select로 둔 근거 주석의 「스물여섯 가지」 수치가 실제와 두 배 가까이 어긋난다 |  |
| adminops-2-C07 | `src/app/(app)/admin/logs/page.tsx:43` | ● 행위자가 없는 기록에 「(알 수 없음)님 / 삭제된 계정」이 찍혀, 지워진 적 없는 계정을 지워졌다고 말한다 |  |
| adminops-1-R09 | `src/app/(app)/admin/settings/threshold-form.tsx:44` | ● `updatedLabel` 주석의 예시가 실제로 내려가는 문자열과 둘 다 다르다 |  |
| roster-1-C06 | `src/app/(app)/admin/students/import/import-form.tsx:43` | ● 빈 서식의 두 번째 예시 줄은 확정해도 아무것도 만들어지지 않는 모양이다 |  |
| adminops-1-C03 | `src/app/(app)/admin/users/[userId]/page.tsx:241` | ● 「계정 조치」 카드가 활성화도 세션을 끊는다고 단언한다 |  |
| adminops-1-R07 | `src/app/(app)/admin/users/admin-tabs.tsx:16` | 탭 줄 주석이 `ChipLink`를 가리키지만 코드는 `SegmentLink`다 | 기존-미처리<br><sub>2026-08-31-codebase-audit-deep.md DL-88</sub> |
| community-1-R11 | `src/app/(app)/community/[slug]/page.tsx:58` | ● 쪽 번호가 마지막 쪽을 넘으면 글이 있는 게시판에 「아직 글이 없습니다」와 「첫 글 쓰기」가 뜬다 |  |
| community-1-C04 | `src/app/(app)/community/board-list.tsx:64` | 게시판 카드의 「마지막」 날짜가 연도 없는 형식이라 작년 글과 올해 글이 같은 글자로 보인다 |  |
| shell-R03 | `src/app/(app)/error.tsx:25` | ● 앱 셸 안쪽 오류 화면이 교사에게도 「선생님께 알려 주세요」라고 말한다 |  |
| ui-2-R12 | `src/app/(app)/merit/admin-view.tsx:118` | ● 상벌점 부여 화면의 검색이 학년·반을 버리는데 바로 아래 안내는 「그대로 유지합니다」라고 말한다 |  |
| merit-2-R10 | `src/app/(app)/merit/stats/views/overview.tsx:256` | 벌점 기준 설정 링크의 aria-label이 있지도 않은 「이 반 기준」을 읽어 준다 |  |
| shell-R10 | `src/app/(app)/not-found.tsx:6` | ● 404 주석이 「이 파일이 없으면 영문 기본 화면이 나온다」고 하지만 실제로는 한국어 루트 404로 떨어진다 |  |
| pass-1-R02<br><sub>+pass-2-C05</sub> | `src/app/(app)/pass/[passId]/page.tsx:104` | 출입증 상세의 승인자·취소자 이름만 호칭 없이 맨이름으로 그린다 | 기존-미처리<br><sub>2026-08-31-codebase-audit-deep.md DL-52</sub> |
| pass-1-R04 | `src/app/(app)/pass/actions.ts:45` | PASS_BUSY 문구가 문구 규칙이 명시적으로 금지한 완충어 「일 수 있습니다」를 쓴다 | 기존-미처리<br><sub>2026-08-31-codebase-audit-deep.md DL-31</sub> |
| pass-1-C07 | `src/app/(app)/pass/admin-view.tsx:42` | ● 교사 승인 성공 배너의 둘째 문장이 「다음에 할 일」이 아니라 결과 설명이다 |  |
| pass-1-C05 | `src/app/(app)/pass/history/page.tsx:79` | ● 기간이 뒤집혀 조회를 아예 안 했는데 「총 0건」을 사실처럼 적는다 |  |
| merit-2-C07 | `src/app/(app)/students/[studentId]/merit-tab.tsx:158` | ● 학생 상벌점 뼈대의 주석이 loading.tsx와 모양을 맞춘다고 하지만 loading.tsx는 일부러 갈래 중립이다 |  |
| auth-1-R10 | `src/app/(auth)/error.tsx:25` | (auth) 오류 화면만 「학교 담당자」라고 부른다 — 같은 조각의 다른 두 화면은 「선생님」이다 |  |
| shell-R04 | `src/app/not-found.tsx:18` | ● 루트 404 안내가 두 문장이고, 바로 아래 버튼이 하는 말을 되풀이한다 |  |
| pass-1-R05 | `src/app/scan/page.tsx:11` | 판독 화면이 nav.ts가 소유하기로 한 제목을 무시하고 다른 이름을 쓴다 | 기존-미처리<br><sub>2026-08-31-codebase-audit-deep.md DL-94</sub> |
| merit-2-C08 | `src/components/merit/award-confirm-dialog.tsx:141` | ● 확인 모달의 w-12 주석이 드는 예시(「1-3 12」)는 formatSeat가 만들 수 없는 표기다 |  |
| ui-1-R12 | `src/components/ui/markdown.tsx:20` | Markdown 파일 머리 주석이 허용 프로토콜을 「http·https만」이라 적었지만 코드는 mailto도 허용하고, 스키마의 title 속성은 렌더러가 버려 죽은 설정이다 |  |
| adminops-1-C04 | `src/modules/audit-log/audit-log.labels.ts:106` | 감사로그 「동작」 목록에 「상벌점 규정 삭제」가 두 줄 나란히 서고 어느 쪽을 골라도 다른 쪽 기록이 빠진다 |  |
| adminops-1-R08 | `src/modules/audit-log/audit-log.labels.ts:190` | 감사로그 「대상」 칸에 권한 거부만 영문 `Authz`로 선다 | 기존-미처리<br><sub>2026-08-31-codebase-audit-deep.md DL-25</sub> |
| roster-2-C06 | `src/modules/audit-log/audit-log.labels.ts:269` | ● 감사로그 라벨 표가 enrollment:import의 deleted를 「옛 행에만 있는 키」라고 적어 두었으나 지금도 반영마다 기록된다 | 기존-미처리<br><sub>2026-08-31-codebase-audit-deep.md DL-27 · 2026-09-01-full-read-audit.md RL-17</sub> |
| community-1-R15<br><sub>+adminops-2-C06</sub> | `src/modules/audit-log/audit-log.labels.ts:486` | 감사로그 화면에 community 계열 metadata 포맷터가 하나도 없어 삭제 사유가 날것으로 찍힌다 |  |
| merit-3-C06 | `src/modules/audit-log/audit-log.labels.ts:503` | 감사로그 화면에 merit:rule:create 전용 문장이 없어 규정 추가 기록이 영문 키·값 나열로 뜬다 | 기존-미처리<br><sub>2026-09-01-full-read-audit.md RL-18</sub> |
| community-1-R05 | `src/modules/community/attachment.service.ts:31` | attachment.service.ts 머리 주석의 「익명 게시판이면」이 같은 파일 66~72줄과 정면으로 모순된다 |  |
| community-1-R06 | `src/modules/community/attachment.service.ts:161` | ● sweepMyOrphans 주석이 「남의 행은 건드리지 않는다」고 하지만 주인 없는 남의 첨부까지 지운다 |  |
| community-2-R05 | `src/modules/community/community.exif.ts:8` | ● community.exif.ts 머리말이 「부르는 자리는 익명 게시판의 업로드 하나뿐」이라고 적었지만 코드는 게시판을 가리지 않는다 |  |
| community-1-R04 | `src/modules/community/community.exif.ts:9` | community.exif.ts 머리 주석이 「실명 게시판은 원본 바이트를 그대로 저장한다」고 적어 실제 동작과 반대다 |  |
| community-2-C06 | `src/modules/community/community.schema.ts:156` | 글 본문 스키마 주석이 본문을 「줄바꿈만 살리는 평문」이라고 적었지만 화면은 마크다운으로 그린다 |  |
| merit-4-C08 | `src/modules/merit/merit.export.ts:125` | 학생 내역 시트만 「취소사유」로 붙여 쓴다 — 저장소의 다른 모든 자리는 「취소 사유」다 |  |
| merit-5-C12 | `src/modules/merit/merit.schema.ts:142` | hidden input에서 오는 세 필드에 한글 문구가 없어 zod 영문 기본 문구가 화면에 그대로 나간다 |  |
| pass-2-C02 | `src/modules/pass/pass.export.ts:56` | ● remarkCell 주석이 「학생 철회는 사유가 없다」고 단정하지만 철회 화면은 사유를 받아 cancelReason에 저장한다 |  |
| pass-2-R07 | `src/modules/pass/pass.repo.ts:627` | ● listHistory 주석이 보조 정렬키의 근거로 드는 「외박은 startAt이 KST 자정」이 더는 사실이 아니다 | 기존-미처리<br><sub>2026-08-31-codebase-audit-deep.md DL-85</sub> |
| pass-2-C01 | `src/modules/pass/pass.schema.ts:150` | ● withdrawPassSchema의 reason 주석은 「Pass 행에 담을 자리가 없다」고 적었지만 withdrawPass가 그 값을 Pass.cancelReason에 저장한다 | 기존-미처리<br><sub>2026-08-31-codebase-audit.md L-05</sub> |
| adminops-2-R07 | `tests/app/(app)/admin/users/actions.test.ts:192` | 같은 권한 거부에 대해 계정 관리 화면은 「권한이 없습니다.」, 설정 화면은 「이 작업을 할 권한이 없습니다.」로 갈리고 두 테스트가 각각 그것을 못박는다 |  |
| core-1-C05 | `tests/core/auth/login-eligibility.test.ts:15` | ● login-eligibility 테스트 이름이 이어붙기에서 구분자를 빠뜨려 「막는다정확히」로 출력된다 |  |
| core-2-C03 | `tests/core/authz/errors.test.ts:56` | ● errors.test.ts 주석이 invite:create:parent를 「학생에게 허용된 유일한 액션」이라 적었지만 넷이다 |  |
| core-2-C04 | `tests/core/db/unique-violation.test.ts:5` | unique-violation 테스트 머리글이 「저장소에서 단 하나뿐인 경로」라 적었지만 board.service.ts에 두 번째 구현이 있다 |  |
| roster-2-C04 | `tests/integration/roster.repo.apply-roster.integration.test.ts:101` | ● 통합 테스트의 픽스처 주석이 「PENDING 두 건만 revokedInvites로 돌아온다」고 적어 두었으나 같은 파일의 단언과 repo 코드는 소진된 코드까지 셋 다 돌려준다 |  |
| community-2-R06 | `tests/modules/community/exif.test.ts:5` | ● exif 테스트의 머리말과 첨부 서비스 테스트의 describe 제목이 아직 「익명 게시판」으로 갈린다고 말한다 |  |
| roster-3-C05 | `tests/modules/enrollment/roster.export.test.ts:151` | 내보내기 왕복 테스트의 주석이 missingFromFile 규칙을 정반대로 적었다 — 같은 조각의 다른 테스트가 반박한다 |  |

### 디자인 토큰·규격 (32건)

| # | 위치 | 무엇이 잘못됐나 | 지난 감사 |
|---|---|---|---|
| data-C10 | `README.md:140` | README의 「기준 문서」가 CLAUDE.md가 공동 기준으로 못 박은 `2026-08-30-ui-refresh.md`를 빠뜨린다 |  |
| auth-1-R09 | `src/app/(app)/admin/invites/invite-form.tsx:31` | ● 발급 대상 선택이 필터 칩으로 그려져 있다 — 끌 수 없는 전환이라 Segmented여야 한다 | 기존-미처리<br><sub>2026-08-31-codebase-audit-deep.md DL-43 (= 2026-08-31-codebase-audit.md C-21 클러스터)</sub> |
| adminops-1-R03 | `src/app/(app)/admin/logs/loading.tsx:19` | ● 감사로그 로딩 뼈대가 지금은 없는 「동작 칩 14개」를 두 줄로 그린다 |  |
| adminops-1-C05 | `src/app/(app)/admin/logs/page.tsx:215` | 감사로그 페이지 안의 필터 뼈대도 지금은 없는 동작 칩 14개를 그린다 (R03의 쌍둥이) |  |
| merit-1-C05 | `src/app/(app)/admin/merit/rules/loading.tsx:34` | ● 규정 관리 로딩 뼈대가 종류 필터 칩을 다섯 개 그리는데 실제 화면은 네 개다 |  |
| adminops-1-C07 | `src/app/(app)/admin/users/loading.tsx:17` | ● 계정 목록의 탭 줄 뼈대가 계정 **상세** 화면의 로딩 뼈대로도 쓰여 전혀 다른 모양이 먼저 뜬다 |  |
| adminops-1-C09 | `src/app/(app)/admin/users/user-table.tsx:151` | 칩 줄을 FilterRow 대신 그 클래스 문자열을 손으로 베껴 그린다 | 기존-미처리<br><sub>2026-08-31-codebase-audit.md §3.7 낮음 묶음(「FilterRow를 두고 손으로 그린 칩 줄 다섯」, C-18~C-22에 묶여 이월)</sub> |
| shell-C04 | `src/app/(app)/loading.tsx:14` | ● 대시보드 뼈대가 본문과 다른 컨테이너 분기점을 써서, 주석이 막겠다던 단 바뀜이 그대로 일어난다 |  |
| merit-1-R01 | `src/app/(app)/merit/class-roster.tsx:174` | ● 명단이 0명일 때 빈 상태 카드가 격자 배치 클래스를 잃어 학년·반 칩 위로(넓은 화면에서는 오른쪽 칸으로) 올라간다 |  |
| merit-1-C04<br><sub>+ui-2-R14</sub> | `src/app/(app)/merit/loading.tsx:15` | ● /merit 로딩 뼈대의 폭이 실제 교사 화면과 달라(5xl vs 6xl) 내용이 도착하면 화면이 통째로 옆으로 벌어진다 |  |
| ui-2-R15 | `src/app/(app)/merit/loading.tsx:20` | ● 검색 폼 뼈대 다섯 곳이 전부 SkeletonField size="sm"인데 SearchForm의 입력칸은 md다 |  |
| ui-2-R13 | `src/app/(app)/merit/own-view.tsx:58` | 같은 /merit 화면인데 교사 쪽은 PageHeader를 쓰고 학생·학부모 쪽은 손으로 다시 그렸다 | 기존-미처리<br><sub>2026-08-31-codebase-audit-deep.md DL-45 · 2026-08-31-codebase-audit.md C-22</sub> |
| merit-1-R04 | `src/app/(app)/merit/rules/loading.tsx:6` | 규정표 로딩 뼈대가 cardClass() 대신 카드 껍데기 클래스를 손으로 적었다 | 기존-미처리<br><sub>2026-08-31-codebase-audit-deep.md DL-47</sub> |
| merit-1-R03 | `src/app/(app)/merit/stats/loading.tsx:18` | ● 통계 로딩 뼈대가 머리글을 카드로 그리는데 실제 머리글(PageHeader)은 카드가 아니라 바탕 위에 앉는다 |  |
| merit-2-C03 | `src/app/(app)/merit/stats/views/overview.tsx:84` | ● 통계 개요의 합계 다섯 칸은 어느 폭에서도 줄이 딱 안 떨어져 허공에 세로 머리카락 선이 남는다 |  |
| merit-2-R08 | `src/app/(app)/merit/stats/views/rules.tsx:58` | 규정별 갈래의 합계 네 칸도 StatStrip 없이 테두리 넷을 그린다 | 기존-미처리<br><sub>2026-08-31-codebase-audit.md C-20</sub> |
| merit-2-R09 | `src/app/(app)/merit/stats/views/teachers.tsx:69` | ● 교사별 갈래는 부여가 0건이면 합계 칸과 카드 둘을 통째로 지운다 — 나머지 세 갈래는 카드 제목을 남긴다 |  |
| merit-2-R07 | `src/app/(app)/merit/stats/views/teachers.tsx:76` | 교사별 갈래의 합계 다섯 칸이 StatStrip 대신 테두리를 각자 그리는 격자로 서 있다 | 기존-미처리<br><sub>2026-08-31-codebase-audit.md C-20</sub> |
| merit-2-C02 | `src/app/(app)/merit/year-picker.tsx:32` | ● 학년도 칩 줄에 현재 학년도로 돌아올 칩이 없어, 지난 해를 한 번 누르면 그 화면에서 부여 폼으로 못 돌아간다 |  |
| shell-R06 | `src/app/(app)/page.tsx:342` | ● 학년도가 없을 때 순점수 자리의 「—」가 초록으로 칠해진다 |  |
| pass-1-C04 | `src/app/(app)/pass/history/loading.tsx:28` | ● 전체 내역 로딩 뼈대에 FilterRow 라벨 셋(유형·상태·기간) 자리가 없어 조건 줄이 통째로 왼쪽에서 튄다 |  |
| pass-1-R09 | `src/app/(app)/pass/history/loading.tsx:51` | ● 전체 내역의 로딩 뼈대가 page.tsx의 Suspense 폴백과 어긋나 표 머리글 띠가 나타났다 사라졌다 한다 |  |
| pass-1-C03 | `src/app/(app)/pass/qr/student-qr.tsx:100` | ● 코드가 굳었다고 알리면서 남은 시간 막대는 계속 처음부터 다시 돈다 |  |
| roster-1-C05 | `src/app/(app)/students/[studentId]/profile-tab.tsx:42` | ● 학생 정보 탭의 로딩 뼈대만 @container가 빠져 본문과 열 수가 달라진다 |  |
| ui-1-R07 | `src/components/app-shell/sidebar.tsx:148` | 사이드바와 모바일 서랍이 icons.tsx의 ChevronDownIcon 대신 같은 화살표를 각자 다시 그렸다(Rail·로고 블록도 같다) | 기존-미처리<br><sub>2026-09-01-full-read-audit.md RL-12 · 2026-08-31-codebase-audit-deep.md DL-92</sub> |
| ui-1-C06 | `src/components/app-shell/sidebar.tsx:224` | ● 사이드바 계정 줄이 flex-1을 TruncatedText의 className으로 줘, 컴포넌트 문서가 금지한 자리에 걸려 아무 효과가 없고 로그아웃 버튼이 오른쪽 끝에 붙지 않는다 |  |
| merit-2-C05 | `src/components/merit/charts.tsx:175` | ● 월별 추이만 빈 상태에서도 범례를 그린다 — 나머지 그래프 셋은 안 그린다 |  |
| ui-1-R10 | `src/components/ui/confirm-dialog.tsx:116` | globals.css가 「확인 모달의 등장」이라고 정의한 animate-modal-in을 정작 공용 확인 모달 둘이 쓰지 않는다 |  |
| ui-1-R09 | `src/components/ui/confirm-dialog.tsx:132` | ConfirmDialog가 Label 프리미티브 대신 같은 클래스를 손으로 적어 규격을 복제했다 |  |
| ui-1-R11 | `src/components/ui/confirm-submit.tsx:26` | ConfirmSubmit의 기본 size="lg"가 15개 호출부 중 2곳에만 맞아 대부분이 기본값을 덮어쓴다 |  |
| ui-2-C08 | `src/components/ui/segmented.tsx:37` | segmentClass의 rounded-[5px]는 src 전체에서 유일한 임의 모서리값인데 근거가 어디에도 없다 |  |
| ui-2-R03 | `src/components/ui/table.tsx:219` | ● DataTable의 className이 narrow="cards"의 카드 쪽에는 안 붙어 폰에서만 여백이 사라진다 |  |

### 접근성 (18건)

| # | 위치 | 무엇이 잘못됐나 | 지난 감사 |
|---|---|---|---|
| community-1-R08 | `src/app/(app)/community/[slug]/post-form.tsx:264` | ● 글 폼의 「첨부파일」 라벨이 존재하지 않는 id를 가리켜 클릭해도 파일 칸이 안 열린다 | 기존-미처리<br><sub>2026-08-31-codebase-audit-deep.md DL-05</sub> |
| shell-R09 | `src/app/(app)/layout.tsx:23` | ● 앱 셸에 본문으로 건너뛰는 링크가 없어 키보드 사용자가 매 화면마다 메뉴 전체를 지난다 |  |
| merit-1-C06 | `src/app/(app)/merit/class-roster.tsx:453` | ● 일괄 부여가 실패하면 같은 오류 문구가 확인창과 페이지에 동시에 서서 role="alert"가 두 번 울린다 |  |
| merit-2-C06 | `src/app/(app)/merit/stats/views/teacher-chart.tsx:95` | ● 교사별 막대의 aria-label이 상쇄점을 빼서, 초록 막대가 길게 뻗은 줄을 「상점 0 벌점 0」으로 읽어 준다 |  |
| shell-C06 | `src/app/(app)/page.tsx:167` | 대시보드에 h2가 하나도 없어 제목 계층이 h1에서 h3로 건너뛴다 |  |
| auth-1-R08 | `src/app/(app)/parent-invite/page.tsx:78` | ● 학생 화면의 폐기 버튼에는 ariaLabel이 없어 여러 행이 모두 「폐기」로만 읽힌다 | 기존-미처리<br><sub>2026-09-01-full-read-audit.md RL-07</sub> |
| pass-2-C07 | `src/app/(app)/pass/issue-form.tsx:115` | ● 직접 부여 폼의 「확인 방법」 입력칸에 라벨이 없어 낭독기에 이름이 없다 | 기존-미처리<br><sub>2026-08-31-codebase-audit-deep.md DL-41 · 2026-09-01-full-read-audit.md RL-05</sub> |
| pass-1-R07 | `src/app/(app)/pass/issue-form.tsx:116` | ● 바로 부여 폼의 「확인 방법」 칸만 라벨 없이 placeholder에 기댄다 | 기존-미처리<br><sub>2026-08-31-codebase-audit-deep.md DL-41</sub> |
| pass-1-C08 | `src/app/(app)/pass/student-view.tsx:50` | 세 역할 성공 배너 중 학생 것만 role="status"가 아니라 aria-live="polite"다 |  |
| roster-1-C08 | `src/app/(app)/students/[studentId]/print/page.tsx:95` | 상벌점 확인서 화면은 화면 상태에서 <h1>을 상단바와 둘 갖는다 | 기존-미처리<br><sub>2026-08-31-codebase-audit-deep.md DL-49</sub> |
| shell-C05 | `src/app/globals.css:96` | 로그인·가입 화면의 진입 애니메이션만 prefers-reduced-motion을 지키지 않는다 | 기존-미처리<br><sub>2026-08-31-codebase-audit-deep.md DL-53</sub> |
| ui-1-C05 | `src/components/app-shell/topbar.tsx:150` | ● 상단바 계정 이름의 lg:hidden이 TruncatedText 안쪽 span에만 붙어, 데스크톱에서도 sr-only 전문이 남아 낭독기에는 이름이 두 번 나온다 |  |
| merit-2-R04 | `src/components/merit/charts.tsx:357` | ● 학생별 순점수 막대의 링크가 학생 이름을 맨이름으로만 읽어 준다 — 짝이 되는 교사별 막대는 aria-label에 호칭을 붙인다 |  |
| ui-2-C05 | `src/components/ui/sheet-download.tsx:83` | ● SheetDownloadButton은 진행 중에 aria-busy를 안 붙인다 — 같은 키트의 ConfirmSubmit은 붙인다 |  |
| ui-2-C04 | `src/components/ui/skeleton.tsx:31` | ● SkeletonScreen·SkeletonRows가 「불러오는 중」을 실은 live region에 aria-busy="true"를 함께 걸고 끝까지 false로 돌리지 않는다 |  |
| ui-2-R07 | `src/components/ui/skeleton.tsx:122` | ● SkeletonRows는 「불러오는 중」을 알리고 SkeletonTable은 안 알린다 — 두 화면은 아무 알림이 없고 세 화면은 두 번 알린다 |  |
| ui-2-R01 | `src/components/ui/summary-list.tsx:49` | ● SummaryRow가 링크 안에 TruncatedText를 focusable인 채로 넣어 한 줄에 탭이 두 번 멈춘다 |  |
| ui-2-R02 | `src/components/ui/summary-list.tsx:50` | ● SummaryRow가 노드 제목을 받으면 낭독기에 아무 이름도 남지 않는다 | 기존-미처리<br><sub>2026-09-01-full-read-audit.md RL-16</sub> |

### 죽은 코드 (44건)

| # | 위치 | 무엇이 잘못됐나 | 지난 감사 |
|---|---|---|---|
| infra-C04 | `playwright.config.ts:54` | ● playwright.config.ts의 DATABASE_URL 조건부 전달이 절대 거짓이 될 수 없다 — 바로 아래 줄과 달리 이 삼항은 죽은 코드다 |  |
| data-R08 | `prisma/schema.prisma:671` | 커뮤니티 글·댓글의 deletedByUserId·deletedReason은 쓰기만 되고 읽는 곳이 없으며, 스키마의 사람 참조 규약도 혼자 따르지 않는다 | 기존-미처리<br><sub>2026-08-31-codebase-audit-deep.md DL-61</sub> |
| data-R09 | `scripts/seed-demo.ts:61` | seed-demo의 로컬 DB 판정에서 host === "::1" 가지는 절대 참이 되지 않는다 |  |
| merit-1-R06 | `src/app/(app)/admin/merit/rules/rule-table.tsx:33` | RuleRow.active는 아무도 읽지 않는 죽은 필드다 |  |
| roster-1-C07 | `src/app/(app)/admin/students/action-state.ts:14` | 학년도 액션의 성공 여부 필드(ok)를 아무도 읽지 않아 지정·추가가 성공해도 화면이 아무 말을 안 한다 |  |
| adminops-1-R05 | `src/app/(app)/admin/users/action-state.ts:19` | `UserActionState.targetId`는 채워지기만 하고 읽는 곳이 없다 |  |
| adminops-1-R06 | `src/app/(app)/admin/users/user-table.tsx:26` | 계정 표의 `UserRow.isSelf`는 계산만 되고 표 어디에도 안 쓰인다 |  |
| community-1-C02 | `src/app/(app)/community/[slug]/[postId]/comment-form.tsx:33` | 댓글 폼의 명시적 reset()은 React가 이미 하는 일을 되풀이하는 죽은 코드이고 의존성도 두 번째 성공에서 안 돈다 | 기존-미처리<br><sub>2026-09-01-full-read-audit.md RL-06</sub> |
| merit-2-C04 | `src/app/(app)/merit/stats/views/teacher-chart.tsx:79` | ● TeacherChart의 「부여된 상벌점이 없습니다」 분기는 호출부가 먼저 걸러 도달할 수 없는 죽은 코드다 |  |
| community-1-R09<br><sub>+community-2-C10·shell-R12·community-2-R04</sub> | `src/app/api/community/attachments/[...attachment]/route.ts:47` · `tests/app/api/community/attachments/route.test.ts:213` | 내려받기 라우트가 응답에 직접 건 CSP는 전역 headers()에 덮이는 죽은 코드이고 주석은 반대로 적혀 있다 | 기존-미처리<br><sub>2026-08-31-codebase-audit-deep.md DL-04 · 2026-09-01-full-read-audit.md RL-11</sub> |
| shell-C08 | `src/app/globals.css:51` | `--color-green-press` 토큰을 쓰는 곳이 한 군데도 없다 |  |
| shell-R02 | `src/app/globals.css:75` | `--text-display` 토큰은 쓰는 화면이 한 곳도 없고 값도 디자인 스펙과 다르다 | 기존-재발<br><sub>docs/design/2026-08-17-responsive-audit.md P3-5 · docs/reviews/README.md 「2026-08-17 리디자인 이후 무엇이 달라졌나」</sub> |
| ui-1-C03 | `src/components/app-shell/nav.ts:183` | EXTRA_TITLES의 /scan 항목은 아무도 읽지 않는 죽은 값이고, 그 화면이 스스로 쓰는 제목(「학생증 확인」)과 이름도 다르다 | 기존-미처리<br><sub>2026-08-31-codebase-audit-deep.md DL-94 (· 2026-08-31-codebase-audit.md §5 · 2026-09-01-fix-batch.md §6)</sub> |
| ui-1-R05 | `src/components/icons.tsx:119` | ScanIcon·InviteIcon·SettingsIcon 셋이 어디서도 쓰이지 않고, SlidersIcon 주석이 말하는 「사용자 관리의 톱니바퀴」는 실제로 존재하지 않는다 | 기존-미처리<br><sub>2026-09-01-full-read-audit.md RL-12 · 2026-08-31-codebase-audit-deep.md DL-91</sub> |
| merit-2-R05 | `src/components/merit/charts.tsx:185` | ClassNetChart 위에 문서 주석 블록이 둘 겹쳐 있고 앞의 것은 어디에도 안 쓰인다 |  |
| ui-1-R06 | `src/components/ui/badge.tsx:29` | Badge의 read·unread tone과 WITH_DOT의 unread 항목이 저장소 어디서도 쓰이지 않는다 |  |
| ui-2-R11 | `src/components/ui/pagination.tsx:78` | paginationItems가 테스트를 위해 export돼 있는데 부르는 곳도 테스트도 없다 |  |
| ui-2-R08 | `src/components/ui/section-card.tsx:32` | SectionCard의 headerAlign은 호출부가 하나도 없는 죽은 prop이다 |  |
| ui-2-C03 | `src/components/ui/select.tsx:27` | ● Select의 rows prop과 목록형 갈래는 부르는 곳이 하나도 없는 죽은 코드다 |  |
| core-1-C04 | `src/core/auth/auth-client.ts:9` | auth-client.ts의 adminClient 플러그인과 signIn·useSession 재수출은 부르는 곳이 없고, admin 엔드포인트는 라우트가 404로 막아 둔 것들이다 |  |
| core-1-R04 | `src/core/auth/credential-session-boundary.ts:47` | isCredentialSignInHookContext는 export되어 있지만 자기 테스트 말고 부르는 곳이 없다 |  |
| core-1-C03 | `src/lib/datetime.ts:189` | datetime.ts의 formatTimeInput·formatKstDay는 운영 코드에 호출자가 없고, 주석은 존재하지 않는 화면을 근거로 든다 |  |
| core-1-R03 | `src/lib/datetime.ts:217` | kstHour는 운영 코드에 호출자가 없고, 주석이 CLAUDE.md가 금지한 시각대별 인사말을 존재 근거로 든다 | 기존-미처리<br><sub>2026-08-31-codebase-audit-deep.md DL-89 · 2026-09-01-full-read-audit.md RL-20</sub> |
| core-2-R11 | `src/lib/temp-password.ts:22` | generateTempPassword의 length 인자는 호출부가 없고, 3보다 작은 값을 주면 요청한 길이를 조용히 무시한다 |  |
| adminops-1-C08 | `src/modules/admin-users/admin-user.repo.ts:43` | ● findById가 email·status를 select하지만 세 호출자 중 아무도 읽지 않는다 |  |
| community-2-C05 | `src/modules/community/post.service.ts:120` | ● PostPage.total을 서비스가 돌려주지만 읽는 화면이 하나도 없다 — 형제 목록 셋은 모두 「총 N건」을 그린다 |  |
| roster-2-R08 | `src/modules/enrollment/roster.repo.ts:56` | ● 내보내기 전용 참고 열(입학반·입학번호) 조회가 미리보기·확정 경로에서도, 그것도 학년도 잠금을 쥔 트랜잭션 안에서 돈다 |  |
| roster-2-R03 | `src/modules/enrollment/roster.service.ts:118` | listExisting이 늘 false인 deleted 필드를 계산하고 exportRoster가 그것으로 아무도 거르지 못하는 필터를 돌린다 |  |
| auth-2-R08 | `src/modules/invites/invite.schema.ts:72` | ● createParentInviteSchema의 expiresInDays는 부르는 곳이 없어 학생이 만든 학부모 코드는 무조건 무기한이다 | 기존-미처리<br><sub>2026-08-31-codebase-audit.md L-24</sub> |
| merit-3-R03 | `src/modules/merit/merit.repo.ts:233` | isThresholdCreateConflict의 첫 조건이 두 번째 조건에 완전히 흡수된다 |  |
| merit-3-R02 | `src/modules/merit/merit.repo.ts:268` | upsertThreshold는 호출부가 없는 죽은 코드다 | 기존-미처리<br><sub>2026-08-31-codebase-audit-deep.md DL-93</sub> |
| merit-5-C13 | `src/modules/merit/merit.repo.ts:269` | upsertThreshold는 호출자가 하나도 없는 죽은 코드다 | 기존-미처리<br><sub>2026-08-31-codebase-audit-deep.md DL-93</sub> |
| merit-3-R05 | `src/modules/merit/merit.repo.ts:1094` | findUserNames가 아무도 쓰지 않는 email까지 select한다 |  |
| merit-5-R07 | `src/modules/merit/threshold.service.ts:73` | listThresholdSettings의 isMeritTrack 필터는 아무 일도 하지 않는 죽은 코드다 |  |
| pass-2-R03<br><sub>+pass-1-R03·pass-3-C10</sub> | `src/modules/pass/pass.error.ts:23` · `src/app/(app)/pass/actions.ts:46` | PASS_NOT_ACTIVE는 아무 데서도 던지지 않는 죽은 오류 코드인데 오류표와 MESSAGES에 남아 있다 | 기존-미처리<br><sub>2026-08-31-codebase-audit.md L-25 · 2026-08-31-codebase-audit-deep.md DL-29</sub> |
| pass-2-C04 | `src/modules/pass/pass.repo.ts:458` | ● transitionUnexpired가 만료 기준 인자 _observedAt을 받고도 한 번도 쓰지 않는다 |  |
| merit-4-R04 | `tests/app/(app)/merit/actions.test.ts:89` | 존재하지 않는 헬퍼를 설명하는 고아 JSDoc이 남아 있다 — cancel-batch-button 픽스처는 지워졌다 | 기존-미처리<br><sub>2026-09-01-full-read-audit.md RL-25</sub> |
| merit-4-C01 | `tests/integration/merit.bulk-award.integration.test.ts:268` | 통합 테스트가 존재하지 않는 파일 `components/merit/recent-feed.ts`를 근거로 든다 |  |
| core-2-R03 | `tests/lib/datetime.timezone.test.ts:126` | kstHour probe의 주석이 지워진 greetingFor를 근거로 대고 있고, kstHour 자체는 src/에 호출부가 없다 | 기존-미처리<br><sub>2026-08-31-codebase-audit-deep.md DL-89 · 2026-09-01-full-read-audit.md RL-20</sub> |
| roster-3-R06 | `tests/modules/enrollment/roster.service.test.ts:747` | 같은 호출·같은 단언의 중복 테스트가 두 쌍 있다 |  |
| merit-4-R05 | `tests/modules/merit/award.service.test.ts:150` | ● 목 설정 주석이 엉뚱한 목 위에 붙어 있다 — 「취소된 것의 id만 돌려준다」가 listAwardYears를 설명한다 |  |
| merit-4-R06 | `tests/modules/merit/award.service.test.ts:622` | ● 일괄 부여 픽스처에 스키마에 없는 occurredOn 키가 남아 있다 — 발생일이 입력이던 시절의 잔재다 |  |
| pass-3-R10 | `tests/modules/pass/decision.service.test.ts:83` | ● decision.service.test.ts의 repo 목 절반이 그 서비스가 부르지 않는 함수이고, 목록 목의 반환 모양도 실제 repo와 다르다 | 기존-미처리<br><sub>2026-08-31-codebase-audit.md C-28 · 2026-09-01-verification-pass.md C-28</sub> |
| auth-3-R04 | `tests/modules/registration/registration.repo.test.ts:230` | ● registration.repo 테스트가 운영에서 아무도 타지 않는 학생코드 재시도 분기를 검증한다 |  |

### 설정·문서 (8건)

| # | 위치 | 무엇이 잘못됐나 | 지난 감사 |
|---|---|---|---|
| infra-R03 | `.env.example:43` | .env.example이 SMS_TEST_MODE="true"를 켠 채 배포된다 — 문서와 compose 주석이 둘 다 비워 두라고 하는 값이다 | 기존-미처리<br><sub>2026-08-31-codebase-audit-deep.md DL-67</sub> |
| data-C06 | `README.md:206` | ● README가 안내하는 `npm run seed:demo`는 README가 시키는 대로 설치하면 반드시 실패한다 — VERIFICATION_MOCK 전제를 어디에도 적지 않았다 |  |
| data-C07 | `scripts/seed-demo.ts:96` | seed-demo만 `.env` 존재 확인 없이 `loadEnvFile`을 부른다 — 형제 스크립트 둘은 모두 `existsSync`로 감싼다 |  |
| roster-1-R02 | `src/app/(app)/admin/students/actions.ts:59` | 학생 관련 네 액션이 리다이렉트만 하는 옛 주소 `/admin/students`를 revalidate한다 | 기존-미처리<br><sub>2026-08-31-codebase-audit-deep.md DL-30</sub> |
| merit-1-R05 | `src/app/(app)/merit/admin-view.tsx:302` | 반 고르기 칩이 1~4반으로 박혀 있어 5반 이상은 명단에서 고를 수도 내보낼 수도 없다 | 기존-미처리<br><sub>2026-08-31-codebase-audit-deep.md DL-09</sub> |
| roster-2-C03 | `src/modules/enrollment/roster.schema.ts:93` | 행 2000줄 상한이 roster.schema.ts와 roster.parse.ts에 각각 박혀 있어, 한쪽만 올리면 미리보기는 되는데 확정만 막히는 구간이 생긴다 |  |
| auth-1-R12<br><sub>+auth-2-R03</sub> | `src/modules/verification/verification.service.ts:35` | CLAUDE.md가 두 번 적은 「IP별 20회/시간」이 코드에서는 60이다 |  |
| auth-3-R05 | `tests/modules/account/account.repo.test.ts:2` | account.repo 테스트만 @/core/db/client를 목으로 대체하지 않아 vitest 설정이 적어 둔 전제를 깬다 |  |

---

## 6. 지난 감사가 이미 판단한 것

### 6.1 고치지 않기로 정했던 것 (5건) — 다시 올리지 않는다

아래는 이번 라운드가 독립적으로 다시 찾았지만 **지난 감사에서 이미 처분이 난** 항목이다.
위의 §3~§5에는 넣지 않았다 — 같은 결정을 두 번 하게 만들지 않기 위해서다.

**auth-1-C03 · [중간] 로그인 화면의 세션 게이트가 status만 보고 deletedAt을 빠뜨려 requireAuth와 조건이 어긋난다 — 무한 리다이렉트가 된다**

위치 `src/app/(auth)/login/page.tsx:26` · 근거 2026-08-31-codebase-audit.md L-14 · 2026-08-31-codebase-audit-deep.md §5-1(기각)·§4.3 상충3 · 2026-08-25-codebase-audit.md §8(기각 13건)

같은 자리(login/page.tsx의 status만 보는 게이트)와 같은 실패(/login↔/ 무한 리다이렉트)를 08-25 §8이 이미 기각했고, L-14로 다시 확정된 것을 deep §5-1이 재차 기각하며 §4.3에서 「결함이 아니라 정리 대상 메모」로 내렸다. 근거는 이번 항목이 든 legacy 행 반론까지 포함한다 — isLoginBlocked가 status·deletedAt을 독립으로 보아 세션 발급 자체를 막는다. deep §6이 「①(재적으로 막기)을 고르면 L-14는 영원히 정리 메모」라 적었고 fix-batch §2.2에서 사용자가 정확히 ①을 골랐으므로, 다시 올리면 이미 내린 결정을 두 번 판단하게 된다.


**core-2-C01 · [낮음] isSerializationConflict가 meta 없는 P2010에서 TypeError를 던져 catch 안의 원래 오류를 지운다**

위치 `src/core/db/transaction-conflict.ts:50` · 근거 2026-08-25-codebase-audit.md §7 (남긴 것 — 지금 고치지 않은 이유, 첫 항목)

그 문서가 정확히 이 자리를 이미 판단해 두었다: 「isSerializationConflict의 잠재 TypeError. "meta" in error는 통과하는데 meta가 null이면 meta.driverAdapterError에서 터진다. meta?.로 고치면 throw가 false로 바뀌어 동작이 바뀐다 — 옮기는 작업에서 동작을 함께 바꾸지 않았다. Prisma 오류에 meta가 null인 경우는 관측된 바 없다.」 코드는 그 뒤 바뀌지 않았음을 확인했다(transaction-conflict.ts:43 가드와 :50 역참조 그대로, 형제 isTransactionFatal:75와 unique-violation.ts:11만 옵셔널 체이닝). 이번 항목이 새로 더하는 것은 「Prisma가 클래스 필드로 meta를 무조건 대입하므로 "meta" in error가 항상 true」라는 기전 설명뿐이고, TypeError가 난다는 사실 자체는 결정 당시 이미 알려져 있었다. 다시 올리면 같은 결정을 두 번 하게 된다.


**auth-1-R04 · [낮음] 로그인·가입 공통 카드가 금지된 font-extrabold와 임의 글자크기를 쓴다**

위치 `src/app/(auth)/auth-panel.tsx:50` · 근거 2026-08-31-codebase-audit-deep.md DL-42 · 2026-09-01-full-read-audit.md RL-13 · 2026-09-01-fix-batch.md §6

같은 파일·같은 클래스(font-extrabold 3곳·text-[11px] 2곳·shadow-[…])를 DL-42와 RL-13이 이미 짚었고 verification-pass §5가 둘을 한 클러스터로 접었다. 처분은 두 감사 모두 「사람이 정할 것」으로 넘겼고(deep §6, fix-batch §6: 문서에 예외로 적을지 토큰으로 되돌릴지), 애초에 커밋 92056e8이 사용자가 일부러 되돌린 시안이라 2026-08-26 감사는 이것을 「문서화된 의도적 예외」로 감사 범위에서 제외했다. 다시 결함으로 올리면 그 결정을 두 번 하게 된다.


**roster-2-R05 · [낮음] 두 통합 테스트가 같은 학년도 8102를 쓰면서 한쪽은 「이 테스트 전용 값」이라고 적어 놨다**

위치 `tests/integration/roster.repo.apply-roster.integration.test.ts:17` · 근거 2026-09-01-verification-pass.md §3 RL-27 (원 항목 2026-09-01-full-read-audit.md RL-27)

같은 자리(roster.repo.apply-roster.integration.test.ts:17)·같은 값(8102)·같은 주장이다. 검증 라운드가 vitest.config.mts를 직접 열어 fileParallelism: false가 그 경합을 원천 차단함을 확인하고 기각했으며, 남는 「주석 문구 부정확」만으로는 낮음으로 확정할 결함이 아니라고 명시적으로 판단했다. 새 서술의 「beforeAll 실패로 정리가 불완전하면」도 결국 같은 잔여분이라, 다시 올리면 이미 내린 기각 결정을 두 번 판단하게 된다.


**shell-C03 · [낮음] 학년도가 없을 때 학생·학부모 대시보드가 교사만 할 수 있는 일을 시키고 /forbidden으로 보내는 링크를 준다**

위치 `src/app/(app)/page.tsx:365` · 근거 2026-08-25-codebase-audit.md §8 기각 「학년도 없을 때 학생·학부모에게 관리자 링크를 안내한다」

2026-08-25 §8이 이 지적을 그대로 받아 **기각**했다 — 사유는 「`isCurrent`를 내리는 코드가 없어 그 상태 자체가 앱 경로로 성립하지 않는다」로, 도달 불가 판단이다. 다시 올리면 사용자가 같은 결정을 두 번 하게 된다. **다만 기각 근거가 그 뒤 무너졌다는 사실은 함께 전한다** — 2026-09-01-full-read-audit.md R-03이 도달 경로(설치 직후·학년도 전환 사이·`AcademicYear_single_current`가 흔들려 `findCurrent()`가 빌 때)를 들어 같은 no-year 상태를 중간으로 확정했고 fix-batch가 그 수정을 반영했다(현재 page.tsx:364·451이 그 갈래를 실제로 그린다). 그래서 이 건은 「이미 정한 것」이되 **재심 가치가 있는 보류**다: 링크 대상이 `/admin/students`→`/admin/users?tab=students`로 리다이렉트되고 `requirePermission("student:manage")`가 학생·학부모를 `/forbidden`으로 튕기며 `authz:denied`가 쌓인다는 부분은 코드에서 확인했다.

### 6.2 고쳤다고 기록됐는데 지금 코드에 다시 있는 것 (2건)

**adminops-2-R03 · 액션 스캐너의 하한 39가 실제 42보다 세 개 낮아, 「하한을 실제 개수 바로 아래에 둔다」는 자기 주석을 어긴다**

위치 `tests/modules/audit-log/audit-log.labels.test.ts:67` · 근거 2026-09-01-full-read-audit.md R-08 (= 2026-08-31-codebase-audit.md C-02)

R-08이 확정한 결함의 절반이 정확히 이것이다 — 「스캐너가 통째로 망가지는 경우를 막으라고 둔 `>= 13` 하한도 실제로 잡히는 27보다 한참 낮아 방어가 안 된다」, 권장은 「하한을 실제로 잡히는 수(40)로 올린다」. fix-batch §2.7이 C-02를 고쳤다고 기록했고(8f11812) 정규식 절반은 실제로 고쳐졌지만, **같은 배치가 `auth:login`·`auth:login-failed`·`invite:create` 등 액션을 새로 남기면서** 하한 39가 다시 실제보다 낮아졌다. 현재 코드로 스캐너를 그대로 돌려 확인했다 — 42개(하한 39보다 3 많다). 파일이 스스로 세운 「하한을 실제 개수 바로 아래에 둔다」 규칙이 같은 자리에서 다시 깨진 상태다.


**shell-R02 · `--text-display` 토큰은 쓰는 화면이 한 곳도 없고 값도 디자인 스펙과 다르다**

위치 `src/app/globals.css:75` · 근거 docs/design/2026-08-17-responsive-audit.md P3-5 · docs/reviews/README.md 「2026-08-17 리디자인 이후 무엇이 달라졌나」

responsive-audit P3-5가 「`text-display`(28px) 토큰은 실사용 0곳 … **지운다**(두면 언젠가 아무 데나 쓰인다)」로 확정했고, reviews/README.md:62가 「**`text-display` 토큰은 삭제됐다.**」로 처리까지 기록했다. 현재 코드를 열어 확인: globals.css:75-77에 28px/1.15/-0.5px로 살아 있고 `grep -rn text-display src`는 globals.css 자신뿐이다. git으로 경로를 확정했다 — 1f63660이 스펙값(28/1.2/-0.42)으로 넣었고 250268c가 주석 「text-display는 쓰는 데가 0곳이라 지운다」와 함께 삭제했으며, 974914e(08-30 대시보드 개편)가 28/1.15/-0.5로 되살렸다(de6c877이 34px로 바꾼 것을 5ad7ff9이 되돌려 지금 값이 됐다). 지운 결정이 무효화된 채 값까지 스펙에서 벗어난 상태라 재발이다. 다만 같은 항목에 붙은 `--color-green-press` 미사용 지적은 어느 문서에도 기록이 없는 새 부분이다.

---

## 7. 이 축이 잡은 것과 못 잡은 것

**잡은 것.** 유일한 높음이 배포 설정이었고, 그것은 `Dockerfile`·`docker-compose.yml`·
`docs/deploy.md`·`.env.example`을 한 에이전트가 함께 읽었기 때문에 보였다. 지난 통독이
구조적으로 못 찾은 자리를 조각을 다시 그어 메운 것이다.

**테스트가 가장 큰 덩어리다** — 119건. 조각을 잘게 나눈 덕에 통독자가 대상 소스와
테스트를 함께 열고 **변이를 넣어 돌려 볼** 여유가 생겼고, 그래서 「통과할 수밖에 없는
단언」이 대량으로 드러났다. 지금 초록불인 스위트가 실제로는 지키지 못하는 것들이다 —
출입증 이어 붙이기를 막는 60분 여백(`CHAIN_GAP_MINUTES`)을 0으로 바꿔도, 상벌점 집계의
재적·학년도·트랙 조건을 지워도, 학생증 QR의 서명 대상을 바꿔도 2,281건이 전부 통과한다.

**못 잡은 것.** 세로 조각은 **모듈을 가로지르는 규격 균열**에 약하다 — 같은 잘못이 열 군데
있어도 각 조각은 자기 한 곳만 본다. 그것이 보인 자리는 `core`·`ui` 조각처럼 공용 코드를
쥐고 호출부를 훑으라고 따로 시킨 곳뿐이었다. 관심사 축
([`2026-08-31-codebase-audit-deep.md`](2026-08-31-codebase-audit-deep.md))이 여전히 그 자리를 맡는다.

**읽는 축이 넷이 됐다.** 모듈 축 · 관심사 축 · 파일 순서 축 · 기능 세로 축. 넷 다 같은 코드에서
서로 다른 것을 냈고, 대체 관계가 아니다.

## 8. 사람이 정할 것

- **§6.1의 다섯 항목을 계속 보류할 것인가.** 특히 `shell-C03`은 지난 기각의 근거(「그 상태에
  도달할 경로가 없다」)가 그 뒤 다른 감사에서 무너졌다 — 대조 단계가 그 사실을 함께 보고했다.
- **낮음 349건 중 어디까지 처리할 것인가.** 지난 두 라운드처럼 높음·중간만 고치고
  낮음은 문서에 남기는 방식이면, 이 문서가 그 목록이다.
- **`--text-display` 토큰**(§6.2)은 문서가 두 곳에서 삭제됐다고 적는데 코드에 살아 있다.
  지우는 쪽이든 문서를 고치는 쪽이든 한쪽으로 맞춰야 한다.
