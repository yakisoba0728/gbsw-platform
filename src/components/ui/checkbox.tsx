import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export function Checkbox({
  label,
  className,
  ...props
}: Omit<ComponentProps<"input">, "type"> & {
  label: string;
}) {
  return (
    <label className={cn("-m-2.5 inline-flex cursor-pointer p-2.5", className)}>
      <input
        type="checkbox"
        aria-label={label}
        className="size-4 accent-pri"
        {...props}
      />
    </label>
  );
}

export function CheckboxField({
  label,
  className,
  ...props
}: Omit<ComponentProps<"input">, "type"> & { label: string }) {
  return (
    <label
      className={cn(
        "inline-flex cursor-pointer items-center gap-2 py-2.5 text-xs font-medium text-mut",
        className,
      )}
    >
      <input type="checkbox" className="size-4 accent-pri" {...props} />
      {label}
    </label>
  );
}
