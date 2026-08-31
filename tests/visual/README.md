# main ↔ redesign 화면 비교

기존 `playwright.config.ts`의 smoke와 분리된 로컬 전용 비교다. 두 production
standalone 서버, 서로 다른 visual DB와 역할별 `*.localhost` 세션을 사용한다.
DB·계정 준비 없이 구조만 확인하려면 `npm run test:visual:list`를 실행한다.

## 필요한 환경변수

다음 값은 셸이나 ignored `dev-local/visual.env`에서 주입한다. 로드 우선순위는
`셸 > dev-local/visual.env > .env`다.

```dotenv
VISUAL_BASELINE_DATABASE_URL=postgresql://...@127.0.0.1:5433/gbsw_visual_main
VISUAL_REDESIGN_DATABASE_URL=postgresql://...@127.0.0.1:5433/gbsw_visual_redesign
VISUAL_TEACHER_EMAIL=teacher@demo.invalid
VISUAL_TEACHER_PASSWORD=...
VISUAL_STUDENT_EMAIL=demo1-eab980@demo.invalid
VISUAL_STUDENT_PASSWORD=...
VISUAL_PARENT_EMAIL=parent1@demo.invalid
VISUAL_PARENT_PASSWORD=...
```

`VISUAL_ADMIN_EMAIL/PASSWORD`를 생략하면 teacher 계정을 쓴다. 이 앱에서 교사와
관리 화면 사용자는 모두 `ADMIN`이며 hostname은 리포트와 쿠키 경계만 나눈다.

## 실행 순서

1. 같은 seed template에서 `gbsw_visual_main`, `gbsw_visual_redesign`을 clone한다.
2. `npm run visual:fixtures -- --yes-local-visual-db`로 두 DB에 고정 ID fixture를
   멱등 생성하고 `dev-local/visual-fixtures.json`을 만든다.
3. `npm run visual:build:baseline`, `npm run visual:build:redesign`을 실행한다.
4. `npm run test:visual`을 실행한다.

결과는 `test-results/visual-compare/index.html`과 그 아래 screenshot에만 생긴다.
storage state에는 세션 쿠키가 있으므로 `test-results` 밖으로 복사하거나 CI 공개
artifact로 올리지 않는다.
