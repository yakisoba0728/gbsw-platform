# 교내 서버 배포

이 문서의 명령은 **로컬에서 실제로 돌려 확인한 것**이다. 다만 도메인·인증서가
붙은 진짜 서버에서는 아직 돌려보지 않았으므로, §5의 확인 절차를 반드시 거친다.

---

## 0. 준비물

| | 필요한 것 |
|---|---|
| 서버 | 리눅스, Docker + Docker Compose v2. 메모리 2GB 이상 |
| 주소 | 교내에서 닿는 도메인 (예: `gbsw.example.hs.kr`) |
| 인증서 | HTTPS용. Caddy를 쓰면 자동 발급된다 (§3) |
| 포트 | 외부는 443만 연다. 3000·5433은 열지 않는다 |

**앱과 DB는 루프백(`127.0.0.1`)에만 묶여 있다.** 리버스 프록시가 같은 호스트에서
받아 넘기는 구조다. 이 전제가 깨지면 두 가지가 함께 무너진다 — 세션 쿠키가 평문으로
흐르고, 감사로그의 접속 IP를 누구나 위조할 수 있다(`x-forwarded-for`는 클라이언트가
보내는 값이라 프록시가 덮어써야 믿을 수 있다).

---

## 1. 코드와 환경변수

```bash
git clone https://github.com/yakisoba0728/gbsw-platform.git
cd gbsw-platform
cp .env.example .env
```

`.env`를 열어 아래 셋을 채운다. **`.env`는 절대 커밋하지 않는다** (`.gitignore`에 있다).

```bash
# 비밀번호와 세션 키는 반드시 새로 만든다
openssl rand -base64 24    # POSTGRES_PASSWORD 에 넣는다
openssl rand -base64 32    # BETTER_AUTH_SECRET 에 넣는다
```

| 변수 | 값 | 빠뜨리면 |
|---|---|---|
| `POSTGRES_PASSWORD` | 위에서 만든 값 | compose가 기동을 거부한다 |
| `BETTER_AUTH_SECRET` | 위에서 만든 값 | 〃 |
| `BETTER_AUTH_URL` | `https://실제도메인` | 〃 — **`http://`로 두면 세션 쿠키에 Secure가 안 붙는다** |

**`DATABASE_URL`은 여기서 채우지 않는다.** compose가 `POSTGRES_*` 셋으로 컨테이너용
접속 문자열을 직접 조립해 `migrate`·`app`에 넣는다 — `.env`의 `DATABASE_URL`은 무시된다.

### 호스트에서 prisma CLI를 쓸 때만 필요하다

`npx prisma studio`처럼 컨테이너 밖에서 DB에 붙는 명령에만 `DATABASE_URL`이 쓰인다.
그때는 컨테이너가 아니라 **호스트에서 보이는 주소**를 적는다.

```
DATABASE_URL=postgresql://gbsw:<POSTGRES_PASSWORD와 같은 값>@localhost:5433/gbsw
```

> compose 안에서는 호스트 이름이 `localhost`가 아니라 **`db`**, 포트도 5432다
> (컨테이너끼리는 서비스 이름으로 찾는다). 그 값은 compose가 알아서 만들므로
> 위 표에 적지 않는다.

### 문자 발송 (보류)

현재 가입 흐름은 임시로 인증번호 발송을 쓰지 않는다. 유효한 초대코드로 이메일·휴대폰
확인을 누르면 서버가 즉시 확인 proof를 만들고, 가입 완료 때 그 proof를 한 번 소진한다.
아래 값은 실제 SMS 확인을 다시 켤 때만 채운다.

| 변수 | 설명 |
|---|---|
| `SMS_KEY` · `SMS_USER_ID` · `SMS_SENDER` | 알리고 계정 정보 |
| `SMS_TEST_MODE` | **비워 둔다.** `true`면 알리고가 접수만 하고 실제로 안 보낸다 |

> `SMS_TEST_MODE`를 켠 채 운영하면 가장 알아채기 힘든 실패가 된다 — 시스템은
> 성공했다고 하는데 학부모에게 문자가 안 간다.

---

## 2. 띄우기

```bash
docker compose up -d --build
```

`db` → `migrate`(1회성) → `app` 순으로 뜬다. **마이그레이션이 성공해야 앱이 시작된다.**

```bash
docker compose ps
# app: Up (healthy) / db: Up (healthy) 두 줄이 나와야 한다
# migrate는 Exited (0)이 정상이다 — 1회성 작업이다
```

확인:

```bash
curl http://127.0.0.1:3000/api/health
# {"ok":true,"db":"up"}
```

문제가 있으면:

```bash
docker compose logs migrate   # 마이그레이션이 멈췄나
docker compose logs app       # 앱이 뜨다 죽었나
```

---

## 3. 리버스 프록시

앱은 `127.0.0.1:3000`에만 있으므로 프록시가 반드시 필요하다.

### Caddy (인증서 자동 발급 — 권장)

`/etc/caddy/Caddyfile`:

```
gbsw.example.hs.kr {
    reverse_proxy 127.0.0.1:3000
}
```

Caddy는 `X-Forwarded-For`·`X-Forwarded-Proto`를 알아서 덮어쓰고 인증서도 자동으로
받는다. 교내망이 외부 인터넷을 막고 있으면 Let's Encrypt 발급이 안 되므로, 학교에서
쓰는 인증서를 직접 지정한다:

```
gbsw.example.hs.kr {
    tls /경로/인증서.crt /경로/개인키.key
    reverse_proxy 127.0.0.1:3000
}
```

### nginx

```nginx
server {
    listen 443 ssl;
    server_name gbsw.example.hs.kr;

    ssl_certificate     /경로/인증서.crt;
    ssl_certificate_key /경로/개인키.key;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;

        # 이 셋이 없으면 감사로그의 접속 IP가 전부 프록시 주소로 찍힌다.
        # $proxy_add_x_forwarded_for가 아니라 $remote_addr를 쓴다 — 클라이언트가
        # 보낸 값에 덧붙이면 위조된 IP가 첫 항목으로 남는다.
        proxy_set_header X-Forwarded-For   $remote_addr;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_set_header Host $host;
    }
}

# 평문 접속은 https로 넘긴다
server {
    listen 80;
    server_name gbsw.example.hs.kr;
    return 301 https://$host$request_uri;
}
```

> **`X-Forwarded-For`를 반드시 프록시가 덮어써야 한다.** 앱은 이 헤더의 첫 항목을
> 접속 IP로 믿고 감사로그에 남긴다(`src/core/audit/request-context.ts`).

---

## 4. 최초 관리자 만들기

계정이 하나도 없을 때만, 서버가 뜰 때 콘솔에 1회성 토큰이 찍힌다.

```bash
docker compose logs app | grep -A6 "등록된 사용자가 없습니다"
```

```
   주소: https://gbsw.example.hs.kr/register?token=
   토큰: Xk9f3aQ2...c21b
   (주소 끝에 토큰을 이어 붙여 접속하세요)
```

주소와 토큰을 이어 붙여 접속하고 이름·이메일·비밀번호를 넣으면 관리자가 만들어진다.

- 토큰은 **서버 콘솔에만** 나온다 — 서버에 접근할 수 있는 사람만 최초 관리자가 된다
- 서버를 재시작하면 토큰이 새로 발급된다
- 계정이 하나라도 생기면 더는 발급되지 않는다

### 상벌점 규정 넣기

설치 직후 한 번만 돌린다 (규정 114개, 멱등이라 여러 번 돌려도 안전하다).

```bash
docker compose run --rm migrate npx tsx scripts/seed-merit-rules.ts
```

### 학년도 확인

마이그레이션이 **2026학년도**를 현재 학년도로 심어 둔다. 다른 해에 설치했다면
`/admin/students`에서 학년도를 새로 만들고 전환한다.

---

## 5. 배포 후 확인 (전부 통과해야 한다)

```bash
# ① 앱과 DB가 외부에 직접 열려 있지 않은가 — 서버 밖 다른 기기에서
curl -m 5 http://<서버IP>:3000/api/health   # 연결 거부되어야 정상
curl -m 5 http://<서버IP>:5433              # 연결 거부되어야 정상

# ② HTTPS로 들어가지는가
curl -I https://gbsw.example.hs.kr/login     # 200

# ③ 평문 접속이 https로 넘어가는가
curl -I http://gbsw.example.hs.kr            # 301

# ④ 세션 쿠키에 Secure가 붙는가 — 로그인 후 브라우저 개발자도구에서 확인
#    안 붙으면 BETTER_AUTH_URL이 http://로 돼 있다
```

**⑤ 감사로그의 접속 IP가 실제 사용자 IP인가.** 관리자로 로그인한 뒤
`/admin/logs`를 열어 방금 기록의 IP를 본다. 프록시 주소(`127.0.0.1` 등)로
찍혀 있으면 §3의 헤더 설정이 빠진 것이다.

---

## 6. 운영

### 갱신

```bash
git pull
docker compose up -d --build     # 마이그레이션이 자동으로 먼저 돈다
```

### 백업 — **가장 중요하다**

상벌점 기록과 감사로그는 되살릴 방법이 없다.

```bash
# 받기
docker exec gbsw-db pg_dump -U gbsw -d gbsw -Fc > backup-$(date +%F).dump

# 되돌리기
# 1) 먼저 쓰기를 멈춘다. 앱을 내리고, 복구 중 프록시도 점검 화면으로 돌린다.
docker compose stop app migrate

# 2) 기존 운영 DB에 바로 덮어쓰지 말고 깨끗한 임시 DB로 복구한다.
docker exec gbsw-db createdb -U gbsw gbsw_restore
docker exec -i gbsw-db pg_restore \
  -U gbsw \
  -d gbsw_restore \
  --exit-on-error \
  --single-transaction \
  < backup-2026-08-18.dump

# 3) 검증한다. 최소한 마이그레이션 상태, 관리자 로그인에 필요한 계정, 최근 감사로그 수를 본다.
docker exec gbsw-db psql -U gbsw -d gbsw_restore -v ON_ERROR_STOP=1 -c 'select count(*) from "User";'
docker exec gbsw-db psql -U gbsw -d gbsw_restore -v ON_ERROR_STOP=1 -c 'select count(*) from "AuditLog";'

# 4) 검증이 끝난 뒤 짧은 점검 시간에 이름을 바꿔 전환한다.
# 두 ALTER 중 두 번째가 실패하면 앱을 올리지 말고
# `ALTER DATABASE gbsw_before_restore RENAME TO gbsw;`로 원래 이름부터 복구한다.
docker exec -i gbsw-db psql -U gbsw -d postgres -v ON_ERROR_STOP=1 <<'SQL'
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname IN ('gbsw', 'gbsw_restore') AND pid <> pg_backend_pid();
ALTER DATABASE gbsw RENAME TO gbsw_before_restore;
ALTER DATABASE gbsw_restore RENAME TO gbsw;
SQL

# 5) 앱을 올리고 확인한다. 문제가 없으면 이전 DB는 일정 기간 보관 후 직접 지운다.
docker compose up -d app
docker exec gbsw-db psql -U gbsw -d gbsw_before_restore -c '\dt'
```

cron으로 매일 돌리고 **다른 장비에도 복사해 둔다.** 서버가 통째로 죽으면 같은
디스크의 백업은 함께 사라진다.

### 로그

```bash
docker compose logs -f app        # 실시간
docker compose logs --tail 100 app
```

실제 인증코드 발송을 다시 켜면 발송 기록은 여기에만 남는다(감사로그에는 남기지 않는다 —
근거는 `CLAUDE.md`의 「verification 모듈은 감사로그 예외다」). 대상은 가려져 있고
코드 자체는 절대 찍히지 않는다.

### 재시작

`db`와 `app`은 `restart: unless-stopped`라 서버가 재부팅되면 자동으로 뜬다.
직접 멈춘 경우에는 다시 안 뜨므로 `docker compose up -d`로 올린다.

---

## 알아둘 것

- **DB 볼륨은 `docker compose down`으로 지워지지 않는다.** 데이터를 정말 지우려면
  `docker compose down -v`인데, 이건 **되돌릴 수 없다.**
- **마이그레이션을 새로 만들면 생성된 SQL을 눈으로 확인한다.** 부분 유니크 인덱스
  `AcademicYear_single_current`가 마이그레이션 SQL에만 있어서, Prisma가 이것을
  군더더기로 보고 `DROP INDEX`를 넣을 수 있다. 드롭돼도 오류는 안 나고, 현재 학년도가
  둘이 되어 전교 집계 범위가 요청마다 흔들린다.
- **감사로그의 접속 IP는 지금 무기한 보관된다.** 보존 기간 정책이 아직 없다.
- 앱 컨테이너는 `mem_limit: 512m`이다. 전교 300명 규모에는 충분하지만, 느려지면
  `docker stats`로 실제 사용량을 보고 조정한다.
