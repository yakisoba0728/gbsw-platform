"use client";

import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { MaskedInput } from "@/components/ui/masked-input";
import { Note } from "@/components/ui/note";
import { formatVerificationCode } from "@/lib/masks";
import {
  confirmVerificationAction,
  requestVerificationAction,
} from "./actions";

type Props = {
  channel: "EMAIL" | "PHONE";
  /** 1단계에서 확인한 가입코드. 발송 요청에 함께 실어 남용을 막는다 (I4). */
  inviteCode: string;
  id: string;
  name: string;
  label: string;
  placeholder: string;
  type: "email" | "tel";
  autoComplete: string;
  /** 전화번호처럼 자동 서식이 필요한 경우 */
  format?: (raw: string) => string;
};

/** 값 입력 + 확인 한 묶음. 폼 중첩이 안 되므로 액션을 직접 호출한다. */
export function VerifiedField({
  channel,
  inviteCode,
  id,
  name,
  label,
  placeholder,
  type,
  autoComplete,
  format,
}: Props) {
  const [value, setValue] = useState("");
  const [sent, setSent] = useState(false);
  const [verifiedValue, setVerifiedValue] = useState<string | null>(null);
  const [code, setCode] = useState("");
  /** 목업 모드가 인증번호를 대신 채웠다. 그 사실을 화면에 알린다. */
  const [mocked, setMocked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const verified = verifiedValue !== null && verifiedValue === value;

  function handleValueChange(next: string) {
    setValue(next);
    // 값이 바뀌면 앞선 인증은 무효다.
    if (next !== verifiedValue) {
      setSent(false);
      setCode("");
      setMocked(false);
      setError(null);
    }
  }

  function send() {
    setError(null);
    startTransition(async () => {
      const result = await requestVerificationAction(channel, value, inviteCode);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (result.verified) {
        setVerifiedValue(value);
        setSent(false);
        setCode("");
        setMocked(false);
        return;
      }
      setSent(true);

      // 재발송하면 서버가 앞선 코드를 만료시킨다. 칸도 함께 비운다.
      // 예전 목업이면 받은 코드를 그대로 채운다.
      setCode(result.mockCode ?? "");
      setMocked(result.mockCode !== undefined);
    });
  }

  function confirm() {
    setError(null);
    startTransition(async () => {
      const result = await confirmVerificationAction(channel, value, code);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setVerifiedValue(value);
    });
  }

  return (
    <div className="mb-3">
      <Label htmlFor={id}>{label}</Label>

      {/*
        이 칸들은 제어 입력이다. 가입 액션이 오류를 return하면 React 19가 폼을
        통째로 reset()하는데, 비제어면 칸만 비고 verified(readOnly와 「확인됨」의
        근거)는 state에 남아 앞뒤가 어긋난다 — 게다가 readOnly 칸은 제약 검증에서
        빠져 required도 빈 값 제출을 못 막는다.
      */}
      <div className="flex gap-2">
        {format ? (
          <MaskedInput
            id={id}
            name={name}
            type={type}
            size="lg"
            autoComplete={autoComplete}
            placeholder={placeholder}
            required
            readOnly={verified}
            format={format}
            value={value}
            onValueChange={handleValueChange}
            className="min-w-0 flex-1"
          />
        ) : (
          <Input
            id={id}
            name={name}
            type={type}
            size="lg"
            autoComplete={autoComplete}
            placeholder={placeholder}
            required
            readOnly={verified}
            value={value}
            onChange={(e) => handleValueChange(e.currentTarget.value)}
            className="min-w-0 flex-1"
          />
        )}

        {verified ? (
          <span className="flex shrink-0 items-center">
            <Badge tone="approved">확인됨</Badge>
          </span>
        ) : (
          <Button
            variant="secondary"
            size="lg"
            onClick={send}
            disabled={pending || value.length === 0}
            className="shrink-0"
          >
            {sent ? "재확인" : "확인"}
          </Button>
        )}
      </div>

      {sent && !verified && (
        <div className="mt-2 flex gap-2">
          <MaskedInput
            // 이 칸도 제어다 — 폼이 리셋돼도 화면과 code state가 갈라지지 않는다.
            value={code}
            aria-label={`${label} 인증번호`}
            size="lg"
            inputMode="numeric"
            placeholder="인증번호 6자리"
            format={formatVerificationCode}
            onValueChange={setCode}
            className="min-w-0 flex-1 font-mono"
          />
          {/* 이 화면의 초록은 가입 버튼 하나다. */}
          <Button
            variant="secondary"
            size="lg"
            onClick={confirm}
            disabled={pending || code.length !== 6}
            className="shrink-0"
          >
            확인
          </Button>
        </div>
      )}

      {sent && !verified && mocked && (
        <p className="mt-1.5 text-xs text-amber-ink">
          개발 목업 — 발송하지 않고 인증번호를 채웠습니다.
        </p>
      )}

      {error && (
        <Note tone="error" className="mt-1.5">
          {error}
        </Note>
      )}
    </div>
  );
}
