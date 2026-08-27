# 커뮤니티 설계

날짜: 2026-08-28
상태: 승인됨

## 문제

지금 이 시스템에는 **사람이 사람에게 말을 거는 자리가 없다.** 상벌점도 출입증도
학교가 학생에게 내리는 기록이고, 학생이 남길 수 있는 것은 출입증 신청 사유
한 줄뿐이다. 공지는 종이와 교실 앞 게시판에 붙고, 학생회 안내는 단체 대화방으로
흐르고, 하고 싶은 말은 아무 데도 안 남는다.

커뮤니티는 그 자리를 만든다. **핵심은 게시판을 코드가 아니라 교사가 만든다는
것**이다 — 「1학년 공지」가 필요해지면 교사가 화면에서 만들고 누가 읽고 누가 쓸지
정한다. 새 게시판마다 마이그레이션을 돌리는 구조면 그 자리는 결국 안 쓰인다.

## 범위

**만드는 것**

- 커뮤니티(게시판) — 교사가 추가·수정·제거하고 **커뮤니티마다 읽기·쓰기 역할을 정한다**
- 글 — 쓰기·읽기·수정·삭제, 페이지 번호로 넘기는 목록
- 댓글 — 쓰기·삭제
- 첨부파일 — 글마다 5개까지, 파일당 5MB
- 익명 게시판 — 켜면 그 게시판의 글·댓글에서 **아무도 작성자를 못 본다** (교사도)

**만들지 않는 것 (그리고 그래서 잃는 것)**

- **좋아요·조회수·고정글·말머리를 두지 않는다.** 게시판이 굴러가는 데 없어도 되고,
  하나씩 넣기 시작하면 어느 것도 안 쓰이면서 표와 화면만 넓어진다. 잃는 것은
  「어떤 글이 관심을 받았는가」를 알 방법이다.
- **마크다운도 서식 편집기도 없다. 본문은 평문이다.** 줄바꿈만 살린다. 서식을
  넣으면 그 순간부터 HTML 살균이 이 모듈의 가장 위험한 코드가 되는데, 학교
  게시판이 얻는 것은 굵은 글씨뿐이다.
- **구성원 명단을 두지 않는다.** 권한은 역할 셋(교사·학생·학부모)으로만 가른다.
  동아리처럼 「이 사람들만」이 필요해지는 날에는 이 결정을 다시 연다. 잃는 것은
  학년·반·동아리 단위 게시판이다.
- **알림이 없다.** 내 글에 댓글이 달려도 아무 데도 안 뜬다. 알림은 이 모듈이
  아니라 시스템 전체가 한 번에 가져야 할 기능이라 여기서 반쪽으로 만들지 않는다.
- **검색이 없다.** 게시판이 커지면 필요해진다. 페이지 번호로 넘기는 것으로 시작한다.

## 결정 1 — 커뮤니티 권한은 `can()`이 담지 못한다

`core/authz/can.ts`는 **컴파일 시점의 표**다: `Action → Role[]`. 액션이 타입으로
고정돼 있어야 `can.test.ts`가 표 전체를 대조할 수 있고, 그 대조가 이 저장소에서
권한이 조용히 새지 않는 이유다.

커뮤니티 권한은 그 표에 안 들어간다. **게시판마다 다르고, 교사가 화면에서 바꾸고,
행이 늘어난다.** 액션을 동적으로 발급하는 순간 타입이 성립하지 않는다.

그래서 판정을 둘로 나눈다.

| 무엇을 | 어디서 판정하나 |
|---|---|
| 게시판을 만들고·고치고·없애고·권한을 정한다 | `can(actor, "community:manage")` — 교사 전용 |
| 남의 글·댓글을 지운다 | `can(actor, "community:moderate")` — 교사 전용 |
| 이 게시판을 읽는다 | `community.access.ts`의 `canRead(actor, community)` |
| 이 게시판에 쓴다 | 같은 파일의 `canWrite(actor, community)` |

아래 둘은 **순수 함수**다. 커뮤니티 행과 세션 사용자만 받고 DB를 모른다.
거부는 `ForbiddenError`를 직접 던지고 `authz:denied` 감사로그를 남긴다 —
`invite.service.ts`의 `revokeInvite`가 소유권 검사에서 이미 쓰는 길이고,
CLAUDE.md의 오류 규약이 명시적으로 허용하는 갈래다.

**대안을 버린 이유.** `can(user, action, subject?)`로 3번째 인자를 받게 넓히면
판정 경로는 하나로 남는다. 그러나 기존 호출부 전부와 `can.test.ts`의 액션×역할
이차원 표가 함께 깨진다. 커뮤니티 하나 때문에 코어 권한 검사기를 흔드는 값이
치를 만하지 않다.

**대신 경계를 문서에 적는다.** CLAUDE.md의 「권한 판정 경로는 `core/authz/can.ts`
하나뿐」 문단 옆에 커뮤니티가 예외인 이유와 그 예외가 어디까지인지를 적는다.
다른 모듈이 이것을 따라하면 안 된다 — 역할로 가를 수 있는 권한은 `can()`에 넣는다.

### `canWrite`만으로는 부족하다

`canRead`·`canWrite`는 **역할만 보는 순수 함수**다. 없앤 게시판인지, 지워진 글인지는
모른다. 그래서 쓰기를 하는 서비스는 권한 검사 **다음에** 상태를 함께 본다.

- 글쓰기·댓글쓰기: `community.active`가 false면 거부한다 (`COMMUNITY_NOT_FOUND`).
- 댓글쓰기·글 수정·삭제: `post.deletedAt`이 있으면 거부한다 (`ALREADY_DELETED`).

이 두 줄을 순수 함수 안으로 넣지 않는다 — 넣는 순간 「역할 판정」과 「행 상태」가
한 함수에 섞여, 판정 표를 DB 없이 테스트하던 이점이 사라진다.

### 교사는 무조건 통과한다

`can()`이 ADMIN을 무조건 통과시키는 것과 **같은 규칙을 커뮤니티 판정에도 그대로
쓴다.** 교사는 모든 게시판을 읽고, 모든 게시판에 쓰고, 모든 글을 지운다.
`readRoles`·`writeRoles`에 ADMIN을 넣을 자리 자체를 두지 않는다.

교직원 사이에 권한 차등이 없다는 이 시스템의 전제가 여기서도 그대로 선다.
「교사가 못 읽는 게시판」은 학교가 운영하는 시스템에서 성립하지 않는다 —
성립한다고 믿게 만드는 쪽이 더 위험하다. **익명 게시판은 이 규칙의 예외가
아니다**: 교사도 글은 읽되 작성자를 못 볼 뿐이다.

**다만 교사도 남의 글을 고치지는 못한다.** 조정은 지우는 일이지 대신 쓰는 일이
아니다. 지운 자국(`deletedAt`)은 남지만 고친 자국은 안 남으므로, 교사가 학생 글의
내용을 바꿀 수 있으면 그 게시판의 글은 아무것도 증명하지 못하게 된다.

## 결정 2 — 익명은 게시판 단위이고, 가리는 자리는 한 곳이다

익명은 `Community.anonymous` 한 칸이다. 켜면 **그 게시판의 모든 글과 댓글이**
익명이다. 글마다 고르는 체크박스를 두지 않는다 — 같은 목록에 실명과 익명이 섞이면
「이 글은 왜 이름을 감췄나」가 그 자체로 정보가 된다.

### 가리는 자리를 하나로 모은다

행에는 작성자가 늘 들어 있다(`authorUserId`·`authorName`·`authorRole`).
그 행이 화면으로 나가기 전에 **`community.view.ts`의 `toPostView` 하나를 반드시
거친다.** 익명 게시판이면 이 함수가 작성자 필드를 **지운 객체**를 만든다.

```
toPostView(row, community, viewer) → {
  id, title, body, createdAt,
  author: { name, role } | null,   // 익명이면 null
  isMine: boolean,
  canEdit: boolean, canDelete: boolean,
  attachments: [...]
}
```

화면 코드가 실수로 흘릴 열 자체가 없게 만드는 것이 이 함수의 목적이다.
**페이지·서버 액션·라우트 핸들러 어느 것도 repo 행을 직접 화면으로 넘기지 않는다.**
`view.test.ts`가 「익명 게시판의 결과 객체에 작성자 이름이 어떤 형태로도 없다」를
검증한다.

`isMine`은 익명에서도 계산한다 — 자기 글의 수정·삭제 버튼이 필요하다. 글쓴이가
자기 글에 단 댓글에는 「글쓴이」 배지를 단다. 누구인지는 여전히 아무도 모른다.

### 익명은 감사로그로 뚫린다 — 그 사실을 여기 적는다

**익명 게시판의 쓰기도 `recordAudit`을 남긴다.** 이 저장소에서 「모든 생성/수정/
삭제는 감사로그를 남긴다」의 예외는 `verification` 모듈 하나뿐이고, CLAUDE.md는
다른 모듈이 그것을 따라하지 말라고 명시한다. 커뮤니티는 업무 데이터를 만드는
모듈이라 예외에 해당하지 않는다.

**그래서 잃는 것을 분명히 적어 둔다. 교사가 감사로그 화면에서 시각을 대조하면
익명 글의 작성자를 알아낼 수 있다.** 09시 12분에 「익명게시판」에 글이 올라왔고
감사로그에 같은 시각 `community:post:create`가 한 줄 있으면 그 줄의 행위자가
작성자다. 화면은 완전히 막히지만 「아예 못 본다」는 화면까지다.

이것을 감수하는 근거는 둘이다.

- **감사로그를 안 남기면 욕설·협박 글의 작성자를 학교가 찾을 방법이 없다.**
  익명 게시판이 실제로 문제를 일으키는 자리가 거기다.
- 감사로그는 교사 전용이고, 감사로그를 읽는 행위 자체가 기록으로 남는 화면이다.
  「마음만 먹으면 볼 수 있다」와 「목록에 이름이 떠 있다」는 다르다.

**학생에게 이 사실을 숨기지 않는다.** 익명 게시판 글쓰기 화면에 한 줄로 적는다.

### 익명은 켤 수만 있다

**켠 게시판을 실명으로 되돌릴 수 없다** (`ANONYMOUS_IRREVERSIBLE`). 되돌리는
순간 이미 쌓인 모든 글과 댓글의 작성자가 화면에 뜨기 때문이다 — 뷰 변환기는
저장된 이름을 **지금의** 플래그로만 가리므로, 체크박스 하나가 감사로그보다
훨씬 싼 우회로가 된다. 감사로그 대조는 한 건씩 시각을 맞춰야 하지만 이쪽은
게시판 전체가 한 번에 열린다.

켜는 방향은 막지 않는다 — 이름이 더 감춰질 뿐 드러나지 않는다. 게시판을 만들 때
정하는 것이 원칙이고, 켤 때는 폼과 확인 모달이 되돌릴 수 없다고 알린다.

## 결정 3 — 제거는 지우는 것이 아니다

커뮤니티 제거는 `active = false`다. `MeritRule`과 같은 규약이다 — 글이 매달려
있는 행을 지우면 그 글들이 갈 곳이 없다. 글·댓글 삭제도 `deletedAt`이다.

| 무엇이 | 무슨 일이 | 그 결과 |
|---|---|---|
| 커뮤니티 제거 | `active = false` | 목록·주소에서 사라진다. 글은 DB에 남는다 |
| 글 삭제 | `deletedAt` | 목록에서 빠진다. 댓글도 함께 안 보인다 |
| 댓글 삭제 | `deletedAt` | 그 자리에 「삭제된 댓글입니다」가 남지 않는다 — 그냥 빠진다 |
| 첨부 제거 (글 수정 중) | 행 삭제 + **디스크에서도 지운다** | 되돌릴 수 없다 |

**글을 지워도 첨부 파일은 디스크에 남긴다.** soft delete는 되돌릴 수 있어야 뜻이
있는데 파일을 지우면 못 되돌린다. 실제 디스크 삭제가 일어나는 곳은 위 표의 마지막
줄과 고아 정리, 둘뿐이다.

## 데이터 모델

모델 이름에 접두어를 붙인다 — `MeritRule`·`MeritAward`와 같은 규약이고,
`Post`·`Comment`처럼 일반적인 이름은 인증 코어 테이블과 한 스키마에 섞이면
무엇의 글인지 읽히지 않는다.

### Community

```prisma
model Community {
  id   String @id @default(cuid())
  /// 주소에 쓰는 이름. 소문자 영숫자와 하이픈만, 2~32자.
  slug String @unique
  name String
  description String?

  /// 읽기·쓰기 허용 역할. ADMIN은 늘 통과하므로 여기 넣지 않는다.
  readRoles  String[]
  writeRoles String[]

  /// 켜면 이 게시판의 모든 글·댓글에서 작성자를 감춘다.
  anonymous Boolean @default(false)
  allowAttachments Boolean @default(true)

  /// 목록 순서. 같으면 name 순.
  sortOrder Int @default(0)
  /// false면 없앤 게시판. 글이 매달려 있어 행은 지우지 않는다.
  active Boolean @default(true)

  posts CommunityPost[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([active, sortOrder])
}
```

**`slug`를 두는 이유.** `/community/notice`가 `/community/clx7a9k2...`보다 낫다.
게시판은 오래 사는 이름이라 다른 화면과 공지에서 주소로 가리키게 된다. 교사가
직접 적고, 만든 뒤에는 바꿀 수 없다 — 바꾸면 그동안 붙은 링크가 전부 죽는다.

`readRoles`·`writeRoles`는 Postgres 배열이다. 역할이 셋뿐이라 별도 테이블을 둘
값이 없다. **`writeRoles ⊆ readRoles`를 zod가 강제한다** — 못 읽는 곳에 쓰게
두면 자기가 쓴 글을 자기가 못 본다.

### CommunityPost

```prisma
model CommunityPost {
  id String @id @default(cuid())
  communityId String
  community Community @relation(fields: [communityId], references: [id], onDelete: Cascade)

  title String
  body  String @db.Text

  /// 계정이 지워지면 null. 이름·역할 스냅샷이 남는다.
  authorUserId String?
  authorUser   User?  @relation(fields: [authorUserId], references: [id], onDelete: SetNull)
  authorName   String
  /// ADMIN | STUDENT | PARENT — 계정이 지워진 뒤에도 호칭을 그려야 한다.
  authorRole   String

  deletedAt       DateTime?
  deletedByUserId String?
  deletedReason   String?

  comments    CommunityComment[]
  attachments CommunityAttachment[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([communityId, deletedAt, createdAt])
}
```

**`SetNull` + 이름 스냅샷**은 `MeritThreshold.updatedByName`·`AuditLog.actorName`과
같은 규약이다 — 과거의 사실이 살아 있는 외래키에 기대면 안 된다. 역할까지
저장하는 이유는 계정이 지워진 뒤에도 `honorificName(name, role)`을 그려야 해서다.
`authorUserId`는 남겨 둔다: 소유권 검사(`isMine`)의 유일한 근거다.

`@@index([communityId, deletedAt, createdAt])`가 목록 조회를 받는다.

### CommunityComment

글과 같은 모양이다. `deletedByUserId`·`deletedReason`까지 같다.

```prisma
model CommunityComment {
  id     String @id @default(cuid())
  postId String
  post   CommunityPost @relation(fields: [postId], references: [id], onDelete: Cascade)

  body String @db.Text

  authorUserId String?
  authorUser   User?  @relation(fields: [authorUserId], references: [id], onDelete: SetNull)
  authorName   String
  authorRole   String

  deletedAt       DateTime?
  deletedByUserId String?
  deletedReason   String?

  createdAt DateTime @default(now())

  @@index([postId, deletedAt, createdAt])
}
```

댓글에 대댓글을 두지 않는다. 트리 구조는 화면과 조회를 한 단계 복잡하게 만드는데
학교 게시판에서 얻는 것이 적다.

### CommunityAttachment

```prisma
model CommunityAttachment {
  id String @id @default(cuid())

  /// 글에 붙기 전에는 null. 올린 직후 ~ 폼 제출 사이의 상태다.
  postId String?
  post   CommunityPost? @relation(fields: [postId], references: [id], onDelete: Cascade)

  /// 올린 사람. 글에 붙일 때 글쓴이와 같은지 확인하는 데 쓴다.
  /// **Cascade가 아니라 SetNull이다** — 글이 SetNull로 살아남는데 첨부만 계정을
  /// 따라 사라지면, 남은 글에서 첨부가 조용히 없어지고 디스크 파일은 그 파일을
  /// 가리키는 행이 사라져 영영 못 지운다. 붙은 뒤의 첨부는 올린 사람이 아니라
  /// 글의 것이다.
  uploaderUserId String?
  uploaderUser   User?  @relation(fields: [uploaderUserId], references: [id], onDelete: SetNull)

  /// 디스크의 파일 이름. 랜덤 32자. 원래 이름은 절대 디스크에 쓰지 않는다.
  storageKey String @unique
  /// 올린 사람이 붙인 원래 이름. 화면에만 쓴다.
  filename String
  mimeType String
  size     Int

  createdAt DateTime @default(now())

  @@index([uploaderUserId, postId])
}
```

`postId`가 nullable인 이유는 아래 「첨부」 절에 있다.

**`User`에 역참조 세 줄이 붙는다** — `communityPosts` · `communityComments` ·
`communityAttachments`. Prisma가 관계마다 양쪽 선언을 요구한다. `User`는 Better Auth가
소유하는 테이블이라 손대기 전에 `npm run auth:generate`로 대조한다.

**글 수정에서 첨부를 더하고 뺄 수 있다.** 더하는 길은 새로 쓸 때와 같고(라우트
핸들러로 올린 뒤 폼에 id를 싣는다), 빼면 행과 디스크 파일이 함께 사라진다.

## 첨부

### 서버 액션으로 받지 않는다

`next.config.ts`의 `serverActions.bodySizeLimit`은 **6mb**이고, 이 값은 서버 액션
전체에 걸린다. 첨부를 위해 올리면 명단 업로드를 포함한 모든 서버 액션의 상한이
함께 올라간다. 앱 컨테이너는 `mem_limit: 512m`이고 Next는 액션 본문을 메모리에
담는다 — 인증된 사용자 몇이 동시에 큰 본문을 보내면 컨테이너가 죽는다.

그래서 첨부만 **라우트 핸들러**로 받는다. `bodySizeLimit`은 6mb 그대로 둔다.

### 올리는 흐름

1. 글쓰기 폼에서 파일을 고르면 클라이언트가 곧바로 `POST /api/community/attachments`로
   보낸다. **어느 게시판에 쓸 것인지(`slug`)를 함께 보낸다.** 서버는 디스크에 쓰고
   `postId: null`인 행을 만들어 id를 돌려준다.
2. 폼을 제출하면 서버 액션이 첨부 id 목록을 받는다. `post.service`가 글을 만들면서
   그 첨부들에 `postId`를 채운다 — **`uploaderUserId`가 글쓴이와 같은 것만.**
   남의 첨부 id를 실어 보내도 붙지 않는다.
3. 붙지 못한 첨부는 고아다. **업로드가 일어날 때마다 그 사용자의 고아만 정리한다** —
   `postId: null`이고 1시간 지난 것. 크론 없이 수렴하고, 남의 행은 건드리지 않는다.

### 업로드 라우트가 직접 막는 것

이 라우트는 **글이 생기기 전에** 돌고 서버 액션이 아니다. 그래서 다른 쓰기 경로가
당연히 가지고 있는 문 셋을 스스로 세워야 한다. 하나라도 빠지면 로그인한 아무나
디스크를 채울 수 있다.

- **권한.** 세션을 확인하고, 받은 `slug`의 커뮤니티에 대해 `canWrite(actor, community)`와
  `community.allowAttachments`와 `community.active`를 **바이트 하나 쓰기 전에**
  확인한다. 이것이 없으면 쓸 수 있는 게시판이 하나도 없는 학부모도 파일을 올린다.
- **용량.** **`bodySizeLimit`은 라우트 핸들러에 걸리지 않는다.** 5MB 상한은 이
  라우트가 직접 재고 넘으면 거부한다 — 아무도 안 재면 아무 제한이 없다.
- **미결 첨부 수.** 한 사람의 `postId: null` 행이 **10개를 넘으면 거부한다.**
  위의 고아 정리는 「그 사람이 다음에 올릴 때」만 도는지라, 50분 동안 500개를
  올리고 그만두는 사람에게는 영영 안 돈다. 이 상한이 묶는 것은 **글에 붙지 않은
  채 떠 있는 파일**뿐이다 — 글에 붙은 첨부에는 상한이 없고 글쓰기에도 속도
  제한이 없어서, 「5개 올린다 → 글을 쓴다」를 되풀이하면 한 계정이 볼륨을 채울
  수 있다. 그쪽은 글이 남으므로 교사가 보고 지울 수 있다는 것이 지금의 답이고,
  용량 관리는 「다시 열어야 할 때」 목록에 있다.

**프록시가 먼저 막을 수 있다.** 앱 앞의 리버스 프록시가 요청 본문 상한을 5MB보다
낮게 두고 있으면(nginx 기본값은 `client_max_body_size 1m`이다) 업로드가 앱에 닿기도
전에 죽고 앱 로그에는 아무것도 안 남는다. 배포 때 프록시 설정을 함께 올린다 —
`docs/deploy.md`에 적는다.

### 저장

도커 named volume `gbsw-uploads`를 `/app/uploads`에 마운트하고,
`/app/uploads/<연>/<월>/<storageKey>`에 쓴다. 연·월로 나누는 이유는 한 디렉터리에
파일이 무한정 쌓이지 않게 하기 위해서다.

- **`storageKey`는 랜덤 32자다. 원래 파일명은 디스크에 절대 쓰지 않는다.** 경로
  탈출(`../../etc/passwd`)과 확장자 위조를 애초에 불가능하게 만든다. 검증으로
  막는 대신 그 값이 파일 이름에 닿지 않게 한다.
- **Dockerfile에서 `USER nextjs` 앞에 `/app/uploads`를 만들고 소유권을 넘긴다.**
  안 하면 볼륨이 root 소유로 생겨 비루트로 도는 앱이 못 쓴다. 컨테이너는
  `cap_drop: ALL`이라 나중에 고칠 방법도 없다.
- 상한: **파일당 5MB, 글당 5개.**
- 허용 목록: 이미지 `png` `jpg` `gif` `webp`, 문서 `pdf` `hwp` `hwpx` `docx`
  `xlsx` `pptx` `txt` `zip`.
- **`svg`는 금지한다.** 같은 출처에서 열리면 그 안의 스크립트가 세션 쿠키에 닿는다.

### 내려받는 흐름

`GET /api/community/attachments/[attachmentId]`가 세션을 확인하고, 그 첨부가 붙은
글의 커뮤니티에 대해 `canRead`를 확인한 뒤 흘려보낸다. 지워진 글의 첨부는 막는다.

| 헤더 | 값 | 이유 |
|---|---|---|
| `Content-Type` | 이미지 허용 목록이면 그 타입, 아니면 `application/octet-stream` | 이미지는 화면에서 바로 보여야 한다 |
| `Content-Disposition` | 이미지가 아니면 `attachment; filename*=UTF-8''…` | 브라우저가 같은 출처에서 열지 않게 |
| `X-Content-Type-Options` | `nosniff` | 브라우저가 타입을 추측해 실행하지 않게 |
| `Content-Security-Policy` | `default-src 'none'; sandbox` | 뚫려서 HTML이 흘러도 아무것도 못 하게 |
| `Cache-Control` | `private, no-store` | 권한이 붙은 자료라 프록시가 안 들고 있게 |

`next.config.ts`의 전역 CSP는 `img-src 'self' data: blob:`이라 같은 출처의 첨부
이미지가 그대로 통과한다. 손댈 것이 없다.

## 오류

`CommunityError`는 **코드**를 `message`에 담고, 화면 문구는 액션의 `MESSAGES`
사전이 맡는다 — `MeritError`·`PassError`와 같은 규약이다.

```
SLUG_TAKEN · COMMUNITY_NOT_FOUND · COMMUNITY_CONFLICT · ANONYMOUS_IRREVERSIBLE
POST_NOT_FOUND · POST_CONFLICT · COMMENT_NOT_FOUND · REASON_REQUIRED
ATTACHMENT_NOT_FOUND · ATTACHMENT_NOT_ALLOWED · ATTACHMENT_TYPE
ATTACHMENT_TOO_LARGE · ATTACHMENT_LIMIT (글당 5개)
ATTACHMENT_PENDING_LIMIT (미결 10개)
```

권한 거부는 `ForbiddenError`다 — 위 목록에 넣지 않는다.

`POST_CONFLICT`는 낙관적 잠금이다. 글 수정 폼이 읽은 시점의 `updatedAt`을 함께
보내고, DB의 값과 다르면 쓰지 않고 되돌린다 — `rule.service.updateRule`과 같은
방식이다. 두 사람이 같은 글을 동시에 고치는 일은 드물지만, 교사가 조정 중인 글을
작성자가 고치는 경우가 실제로 생긴다.

## 감사로그

| 액션 | 대상 | metadata |
|---|---|---|
| `community:create` | Community | slug · name · readRoles · writeRoles · anonymous |
| `community:update` | Community | 바뀐 항목 이름들 · 권한 전/후 |
| `community:delete` | Community | slug · name · reason |
| `community:post:create` | CommunityPost | communityId · title · 첨부 수 |
| `community:post:update` | CommunityPost | 바뀐 항목 이름들 |
| `community:post:delete` | CommunityPost | communityId · title · byModerator · reason |
| `community:comment:create` | CommunityComment | postId |
| `community:comment:delete` | CommunityComment | postId · byModerator · reason |
| `community:attachment:create` | CommunityAttachment | filename · size · mimeType |
| `community:attachment:delete` | CommunityAttachment | filename |

**익명 게시판의 글도 제목을 metadata에 남긴다.** 감사로그로 익명이 뚫린다는
사실은 위에 적었고, 제목을 빼도 시각으로 대조되므로 빼서 얻는 것이 없다.

`byModerator`는 교사가 남의 글을 지웠는지 여부다. 본인 삭제와 조정을 감사로그에서
구분할 수 있어야 한다.

`audit-log.labels.ts`에 열 줄의 한글 라벨을 함께 넣는다.

## 화면

```
/community                       읽을 수 있는 게시판 목록
/community/[slug]                글 목록 (?page=, 20개씩)
/community/[slug]/new            글쓰기
/community/[slug]/[postId]       글 + 댓글
/community/[slug]/[postId]/edit  수정
/admin/community                 커뮤니티 목록 + 추가
/admin/community/[communityId]   수정 · 권한 · 제거
```

페이지 크기 20은 감사로그(`PAGE_SIZE = 50`)와 같은 방식이되 글이 세로로 길어
더 작게 잡았다. 커서가 아니라 페이지 번호인 것도 감사로그·출입증 전체 내역과 같다.

`/community/[slug]/new`는 정적 구간이라 `[postId]`보다 먼저 잡힌다. cuid가
`new`가 될 수 없어 충돌은 애초에 없다.

### 있는 조각을 쓴다

새로 그리지 않는다 — `SectionCard`(게시판 카드·글 상세), `DataTable narrow="cards"`
(글 목록·관리 목록), `EmptyState`(글 없는 게시판), `Note`(오류 배너),
`BackLink`, `ConfirmDialog`·`ConfirmSubmit`(아래).

폭에 따른 재배치는 `@container`로 한다. `lg:`는 표↔카드 전환에만 쓴다.

### 확인 모달

지난 작업에서 **쓰는 동작 전부에 확인 모달**이 붙었다. 커뮤니티도 그 규약을 따른다.

| 동작 | 모달 | 사유 |
|---|---|---|
| 커뮤니티 추가 | 있음 | 없음 |
| 커뮤니티 수정·권한 변경 | 있음 | 없음 |
| 커뮤니티 제거 | 있음 (`tone="danger"`) | **필수** |
| 글쓰기·댓글 쓰기 | **없음** | — |
| 글 수정 | 있음 | 없음 |
| 내 글·댓글 삭제 | 있음 | 없음 |
| 남의 글·댓글 삭제 (교사) | 있음 (`tone="danger"`) | **필수 — 서비스가 강제한다** |
| 첨부 빼기 (글 수정 중) | **없음** — 저장할 때 글 수정 모달이 한 번 묻는다 | — |

**글쓰기와 댓글 쓰기에는 모달을 달지 않는다.** 되돌릴 수 있고(수정·삭제), 게시판에서
가장 자주 하는 동작이라 한 번 더 누르게 하면 그 자리가 안 쓰인다. 지난 작업에서
비밀번호 변경을 뺀 것과 같은 판단이다.

### 메뉴

```ts
{ href: "/community", label: "커뮤니티", icon: BoardIcon, children: [
    { href: "/community", label: "게시판" },
    { href: "/admin/community", label: "커뮤니티 관리", roles: ["ADMIN"] },
] }
```

상벌점의 「규정」↔「규정 관리」와 같은 모양이다. 하위 메뉴 첫 줄이 부모와 같은
경로인 것도 같은 이유다 — 펼쳤을 때 관리 줄만 보이면 「게시판은 어디 갔나」가 된다.
학생·학부모에게는 하위가 하나도 없어 「커뮤니티」가 평범한 링크로 그려진다.

**하위 메뉴는 게시판 목록을 담지 않는다.** `nav.ts`는 클라이언트 컴포넌트가 직접
import하는 정적 모듈이라 DB를 못 읽는다. 게시판 목록은 `/community` 화면이 낸다.

**바텀탭이 상한에 닿는다.** 교사 4→5, 학생 4→5, 학부모 3→4다. `nav.ts`가 적어 둔
상한이 5이므로 **이것이 마지막 자리다.** 다음 최상위 메뉴를 세우는 사람은
`bottomTabItems`가 무엇을 뺄지 고르는 일부터 해야 한다.

## 모듈 구성

`merit` 모양이다 — repo·schema·error는 하나, 서비스는 책임별로 나눈다.

```
src/modules/community/
  community.schema.ts    zod. writeRoles ⊆ readRoles를 여기서 강제한다
  community.repo.ts      Prisma 호출만
  community.error.ts     CommunityError
  community.access.ts    canRead · canWrite — 순수 함수, DB를 모른다
  community.view.ts      toPostView · toCommentView — 익명을 가리는 유일한 자리
  community.storage.ts   디스크 I/O. 파일만 다루고 DB를 모른다
  board.service.ts       커뮤니티 CRUD · 권한 설정
  post.service.ts        글
  comment.service.ts     댓글
  attachment.service.ts  첨부 (storage와 repo를 잇는다)
```

`access.ts`·`view.ts`·`storage.ts`가 순수하거나 한 가지만 하는 것이 이 구성의
핵심이다. 권한 판정과 익명 마스킹은 **DB 없이 테스트된다.**

## 검증

| 무엇 | 어디 |
|---|---|
| 액션 둘이 표에 있는가 | `tests/core/authz/can.test.ts`의 `EXPECTED` |
| 역할별 읽기·쓰기 판정 | `tests/modules/community/access.test.ts` (순수) |
| **익명 결과에 작성자가 없는가** | `tests/modules/community/view.test.ts` |
| 권한 거부·허용 + 감사로그 | `board` · `post` · `comment` · `attachment` 서비스 넷 (repo·audit은 목) |
| 경로 탈출 · 확장자 · 용량 | `tests/modules/community/storage.test.ts` |

익명 검증은 **결과 객체를 통째로 훑어 작성자 이름 문자열이 어디에도 없는 것**을
본다. 필드 하나를 짚어 `null`인지 보면 다른 필드로 새는 것을 못 잡는다.

종료 조건은 `npm run verify` 통과다.

## 구현 순서

각 단계가 끝나면 화면에서 실제로 동작하는 것이 늘어난다.

1. **모델 + 권한 + 커뮤니티 관리** — 마이그레이션, `can.ts` 두 줄, `access.ts`,
   `board.service`, `/admin/community` 두 화면, 메뉴. 교사가 게시판을 만들 수 있게
   된다.
2. **글** — `post.service`, `view.ts`, 목록·쓰기·읽기·수정·삭제 화면, 익명.
3. **댓글** — `comment.service`, 글 상세 화면 안.
4. **첨부** — `storage.ts`, `attachment.service`, 라우트 핸들러 둘, Dockerfile과
   `docker-compose.yml`의 볼륨.

**1단계의 마이그레이션에서 생성된 SQL을 눈으로 확인한다.** `AcademicYear_single_current`
부분 인덱스를 지우는 줄이 있으면 지운다 — Prisma가 표현하지 못해 매번 군더더기로
본다. **마이그레이션 후 `next dev`를 재시작하고 `.next`를 지운다.**

## 다시 열어야 할 때

- **구성원 명단이 필요해질 때** — 동아리·프로젝트팀 게시판. `readRoles`·`writeRoles`
  옆에 구성원 테이블이 붙는 모양이 된다.
- **알림이 생길 때** — 시스템 전체의 알림 기능이 생기면 댓글이 첫 사용처다.
- **게시판이 커질 때** — 검색과 첨부 용량 관리(오래된 파일 정리)가 필요해진다.
- **익명이 실제로 문제를 일으킬 때** — 감사로그로 뚫린다는 사실이 학생에게 알려진
  뒤에도 익명 게시판이 쓰이는지가 이 설계의 시험대다.
