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
  inviteCode: string;
  id: string;
  name: string;
  label: string;
  placeholder: string;
  type: "email" | "tel";
  autoComplete: string;
  format?: (raw: string) => string;
};

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
  const [mocked, setMocked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const verified = verifiedValue !== null && verifiedValue === value;

  function handleValueChange(next: string) {
    setValue(next);
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
            aria-label={
              sent
                ? `${label} 인증번호 다시 보내기`
                : `${label} 인증번호 보내기`
            }
            className="shrink-0"
          >
            {sent ? "재확인" : "확인"}
          </Button>
        )}
      </div>

      {sent && !verified && (
        <div className="mt-2 flex gap-2">
          <MaskedInput
            value={code}
            aria-label={`${label} 인증번호`}
            size="lg"
            inputMode="numeric"
            placeholder="인증번호 6자리"
            format={formatVerificationCode}
            onValueChange={setCode}
            className="min-w-0 flex-1 font-mono"
          />
          <Button
            variant="secondary"
            size="lg"
            onClick={confirm}
            disabled={pending || code.length !== 6}
            aria-label={`${label} 인증번호 확인`}
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
