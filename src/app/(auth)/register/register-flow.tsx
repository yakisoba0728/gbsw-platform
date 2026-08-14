"use client";

import Link from "next/link";
import { useActionState } from "react";
import { ChevronLeftIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { MaskedInput } from "@/components/ui/masked-input";
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
const REGISTER_INITIAL: RegisterState = { error: null };

export function RegisterFlow() {
  const [check, checkAction, checking] = useActionState(
    checkInviteAction,
    CHECK_INITIAL,
  );

  /*
   * 폼 action에는 서버 액션을 그대로 물린다. 여기에 클라이언트 함수를 끼우면
   * React가 progressive enhancement용 히든 필드를 심지 못해 JS 없이는 동작하지 않는다.
   * 그래서 "뒤로"는 상태가 아니라 /register 재진입으로 처리한다.
   */
  return check.code && check.role ? (
    <ProfileStep code={check.code} role={check.role} />
  ) : (
    <CodeStep formAction={checkAction} pending={checking} error={check.error} />
  );
}

function ErrorNote({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="mb-4 rounded-btn bg-rose-soft px-3 py-2.5 text-[13px] font-semibold text-rose"
    >
      {message}
    </p>
  );
}

/** 라벨 옆에 옅게 붙는 보조 문구. 시안의 `비밀번호 (8자 이상)` 패턴. */
function Hint({ children }: { children: React.ReactNode }) {
  return <span className="font-medium text-mut">{children}</span>;
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
      <h1 className="mb-1.5 text-2xl font-extrabold tracking-[-0.02em] text-ink">
        가입코드 확인
      </h1>
      <p className="mb-[26px] text-[13.5px] text-mut">
        발급받은 가입코드를 입력하세요.
      </p>

      <Label htmlFor="code">가입코드</Label>
      <MaskedInput
        id="code"
        name="code"
        placeholder="GBSW-0000-0000"
        autoComplete="off"
        autoCapitalize="characters"
        required
        format={formatInviteCodeInput}
        className="mb-[22px]"
      />

      {error && <ErrorNote message={error} />}

      <Button type="submit" size="lg" full disabled={pending}>
        {pending ? "확인 중…" : "코드 확인 후 계속"}
      </Button>

      <p className="mt-5 text-center text-[13px] text-mut">
        이미 계정이 있으신가요?{" "}
        <Link href="/login" className="font-bold text-pri hover:underline">
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
      <a
        href="/register"
        className="mb-3 inline-flex items-center gap-1 text-[12.5px] font-semibold text-mut transition-colors hover:text-ink"
      >
        <ChevronLeftIcon size={15} />
        가입코드 다시 입력
      </a>

      <h1 className="mb-4 text-2xl font-extrabold tracking-[-0.02em] text-ink">
        정보 입력
      </h1>

      {role === "STUDENT" ? (
        <div className="mb-[13px] grid grid-cols-2 gap-2">
          <div>
            <Label htmlFor="name">이름</Label>
            <Input
              id="name"
              name="name"
              dense
              autoComplete="name"
              placeholder="이름"
              maxLength={50}
              required
            />
          </div>
          <div>
            <Label htmlFor="birthDate">생년월일</Label>
            <Input id="birthDate" name="birthDate" type="date" dense required />
          </div>
        </div>
      ) : (
        <>
          <Label htmlFor="name">이름</Label>
          <Input
            id="name"
            name="name"
            dense
            autoComplete="name"
            placeholder="이름"
            maxLength={50}
            required
            className="mb-[13px]"
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
        dense
        autoComplete="new-password"
        placeholder="비밀번호"
        minLength={10}
        required
        className="mb-[13px]"
      />

      <Label htmlFor="confirmPassword">비밀번호 확인</Label>
      <Input
        id="confirmPassword"
        name="confirmPassword"
        type="password"
        dense
        autoComplete="new-password"
        placeholder="비밀번호 확인"
        required
        className="mb-5"
      />

      {state.error && <ErrorNote message={state.error} />}

      <Button type="submit" size="lg" full disabled={pending}>
        {pending ? "가입 중…" : "가입하고 시작하기"}
      </Button>
    </form>
  );
}
