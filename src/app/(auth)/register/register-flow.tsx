"use client";

import Link from "next/link";
import { useActionState } from "react";
import { BackLink } from "@/components/ui/back-link";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { MaskedInput } from "@/components/ui/masked-input";
import { Note } from "@/components/ui/note";
import { formatInviteCodeInput, formatPhone } from "@/lib/masks";
import type { Role } from "@/core/authz/roles";
import {
  checkInviteAction,
  completeRegistrationAction,
  type CheckInviteState,
  type RegisterState,
} from "./actions";
import { VerifiedField } from "./verified-field";

const CHECK_INITIAL: CheckInviteState = { code: null, role: null, error: null };
const REGISTER_INITIAL: RegisterState = {
  error: null,
  values: { name: "", birthDate: "" },
};

export function RegisterFlow() {
  const [check, checkAction, checking] = useActionState(
    checkInviteAction,
    CHECK_INITIAL,
  );

  // 폼 action에는 서버 액션을 그대로 물린다 — 클라이언트 함수를 끼우면 JS 없이
  // 동작하지 않는다. 그래서 "뒤로"도 상태가 아니라 /register 재진입으로 푼다.
  return check.code && check.role ? (
    <ProfileStep code={check.code} role={check.role} />
  ) : (
    <CodeStep formAction={checkAction} pending={checking} error={check.error} />
  );
}

/** 라벨 옆에 옅게 붙는 보조 문구. */
function Hint({ children }: { children: React.ReactNode }) {
  return <span className="font-normal text-mut">{children}</span>;
}

function CodeStep({
  formAction,
  pending,
  error,
}: {
  formAction: (formData: FormData) => void;
  pending: boolean;
  error: string | null;
}) {
  return (
    <form action={formAction} className="animate-auth-in">
      <h1 className="mb-8 text-title font-semibold text-ink">가입</h1>

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

      {error && (
        <Note tone="error" className="mb-4">
          {error}
        </Note>
      )}

      <Button type="submit" size="lg" full disabled={pending}>
        {pending ? "확인 중…" : "다음"}
      </Button>

      <p className="mt-6 text-center text-caption text-mut">
        이미 계정이 있으신가요?{" "}
        <Link
          href="/login"
          className="text-ink underline decoration-line-strong underline-offset-2 hover:decoration-ink"
        >
          로그인
        </Link>
      </p>
    </form>
  );
}

function ProfileStep({ code, role }: { code: string; role: Role }) {
  const [state, formAction, pending] = useActionState(
    completeRegistrationAction,
    REGISTER_INITIAL,
  );

  return (
    <form action={formAction} className="animate-auth-in">
      <input type="hidden" name="code" value={code} />

      {/* 같은 주소로 되돌아가 1단계부터 다시 시작한다 (JS 없이도 동작). */}
      <BackLink href="/register" reload className="mb-3">
        가입코드 다시 입력
      </BackLink>

      <h1 className="mb-6 text-title font-semibold text-ink">정보 입력</h1>

      {/*
        비제어 칸이라 실패 뒤 폼 자동 리셋(React 19)에 지워진다. 액션이 되돌려준
        제출값을 defaultValue로 다시 심어 살린다 — 리셋은 이 커밋의 DOM 갱신이
        끝난 뒤에 돌아서 새 defaultValue를 본다. 비밀번호 두 칸은 일부러 뺐다.
      */}
      {role === "STUDENT" ? (
        <div className="mb-3 grid grid-cols-2 gap-2">
          <div>
            <Label htmlFor="name">이름</Label>
            <Input
              id="name"
              name="name"
              size="lg"
              autoComplete="name"
              placeholder="이름"
              maxLength={50}
              required
              defaultValue={state.values.name}
            />
          </div>
          <div>
            <Label htmlFor="birthDate">생년월일</Label>
            <Input
              id="birthDate"
              name="birthDate"
              type="date"
              size="lg"
              required
              defaultValue={state.values.birthDate}
            />
          </div>
        </div>
      ) : (
        <>
          <Label htmlFor="name">이름</Label>
          <Input
            id="name"
            name="name"
            size="lg"
            autoComplete="name"
            placeholder="이름"
            maxLength={50}
            required
            defaultValue={state.values.name}
            className="mb-3"
          />
        </>
      )}

      <VerifiedField
        channel="EMAIL"
        inviteCode={code}
        id="email"
        name="email"
        label="이메일"
        type="email"
        autoComplete="username"
        placeholder="name@gbsw.hs.kr"
      />

      <VerifiedField
        channel="PHONE"
        inviteCode={code}
        id="phone"
        name="phone"
        label="전화번호"
        type="tel"
        autoComplete="tel"
        placeholder="010-0000-0000"
        format={formatPhone}
      />

      <Label htmlFor="password">
        비밀번호 <Hint>(10자 이상)</Hint>
      </Label>
      <Input
        id="password"
        name="password"
        type="password"
        size="lg"
        autoComplete="new-password"
        placeholder="비밀번호"
        minLength={10}
        required
        className="mb-3"
      />

      <Label htmlFor="confirmPassword">비밀번호 확인</Label>
      <Input
        id="confirmPassword"
        name="confirmPassword"
        type="password"
        size="lg"
        autoComplete="new-password"
        placeholder="비밀번호 확인"
        required
        className="mb-6"
      />

      {state.error && (
        <Note tone="error" className="mb-4">
          {state.error}
        </Note>
      )}

      <Button type="submit" size="lg" full disabled={pending}>
        {pending ? "가입 중…" : "가입"}
      </Button>
    </form>
  );
}
