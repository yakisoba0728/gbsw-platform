import Form from "next/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function SearchForm({
  action,
  name = "q",
  defaultValue,
  placeholder,
  ariaLabel,
  maxLength,
  hidden,
  submitLabel = "검색",
  className = "flex gap-2",
}: {
  action: string;
  name?: string;
  defaultValue?: string;
  placeholder?: string;
  ariaLabel: string;
  maxLength?: number;
  hidden?: Record<string, string | null | undefined>;
  submitLabel?: string;
  className?: string;
}) {
  return (
    <Form action={action} className={className}>
      {Object.entries(hidden ?? {}).map(([key, value]) =>
        value == null ? null : (
          <input key={key} type="hidden" name={key} value={value} />
        ),
      )}

      <Input
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        aria-label={ariaLabel}
        maxLength={maxLength}
        className="min-w-0 flex-1"
      />
      <Button type="submit" variant="secondary" className="shrink-0">
        {submitLabel}
      </Button>
    </Form>
  );
}
