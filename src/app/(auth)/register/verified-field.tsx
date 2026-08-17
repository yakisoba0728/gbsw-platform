"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { MaskedInput } from "@/components/ui/masked-input";
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

/** 값 입력 + 인증번호 확인 한 묶음. 폼 중첩이 안 되므로 액션을 직접 호출한다. */
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
  /** 목업 모드에서 채워 넣은 값. 바뀔 때마다 코드 입력칸을 다시 그린다. */
  const [prefill, setPrefill] = useState<{ value: string; nonce: number } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const verified = verifiedValue !== null && verifiedValue === value;

  function handleValueChange(next: string) {
    setValue(next);
    // 값이 바뀌면 앞선 인증은 무효다.
    if (next !== verifiedValue) {
      setSent(false);
      setCode("");
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
      setSent(true);

      // 목업이면 받은 코드를 입력칸에 바로 채운다.
      if (result.mockCode) {
        setCode(result.mockCode);
        setPrefill((prev) => ({
          value: result.mockCode!,
          nonce: (prev?.nonce ?? 0) + 1,
        }));
      }
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

      <div className="flex gap-2">
        {format ? (
          <MaskedInput
            id={id}
            name={name}
            type={type}
            dense
            autoComplete={autoComplete}
            placeholder={placeholder}
            required
            readOnly={verified}
            format={format}
            onValueChange={handleValueChange}
            className="min-w-0 flex-1"
          />
        ) : (
          <Input
            id={id}
            name={name}
            type={type}
            dense
            autoComplete={autoComplete}
            placeholder={placeholder}
            required
            readOnly={verified}
            onChange={(e) => handleValueChange(e.currentTarget.value)}
            className="min-w-0 flex-1"
          />
        )}

        {verified ? (
          <span className="flex shrink-0 items-center rounded-btn border border-green-line bg-green-soft px-3 text-xs font-medium text-green">
            확인됨
          </span>
        ) : (
          <Button
            variant="secondary"
            size="sm"
            onClick={send}
            disabled={pending || value.length === 0}
            className="shrink-0"
          >
            {sent ? "재발송" : "인증"}
          </Button>
        )}
      </div>

      {sent && !verified && (
        <div className="mt-2 flex gap-2">
          <MaskedInput
            // 목업으로 값을 채울 때 다시 마운트시킨다 (비제어 인풋이라 key로 갱신).
            key={prefill?.nonce ?? 0}
            defaultValue={prefill?.value ?? ""}
            aria-label={`${label} 인증번호`}
            dense
            inputMode="numeric"
            placeholder="인증번호 6자리"
            format={formatVerificationCode}
            onValueChange={setCode}
            className="min-w-0 flex-1 font-mono"
          />
          <Button
            size="sm"
            onClick={confirm}
            disabled={pending || code.length !== 6}
            className="shrink-0"
          >
            확인
          </Button>
        </div>
      )}

      {sent && !verified && prefill && (
        <p className="mt-1.5 text-xs text-amber-ink">
          개발 목업 — 발송하지 않고 인증번호를 채웠습니다.
        </p>
      )}

      {error && (
        <p role="alert" className="mt-1.5 text-xs font-medium text-rose">
          {error}
        </p>
      )}
    </div>
  );
}
