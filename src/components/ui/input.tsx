import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export type FieldSize = "sm" | "md" | "lg";

const HEIGHTS: Record<FieldSize, string> = {
  sm: "h-9 lg:h-8",
  md: "h-9",
  lg: "h-11",
};

const FIELD_BASE = cn(
  "w-full rounded-field border border-line bg-surface",
  "text-sm text-ink outline-none",
  "user-invalid:border-rose-line aria-[invalid=true]:border-rose-line",
  "disabled:cursor-not-allowed disabled:bg-soft disabled:text-mut",
);

export function Input({
  size = "md",
  className,
  ...props
}: Omit<ComponentProps<"input">, "size"> & { size?: FieldSize }) {
  return <input className={cn(fieldClass(size), className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea className={cn(FIELD_BASE, "px-3 py-2.5", className)} {...props} />
  );
}

export function fieldClass(size: FieldSize): string {
  return cn(FIELD_BASE, HEIGHTS[size], "px-3");
}

export function Label({ className, ...props }: ComponentProps<"label">) {
  return (
    <label
      className={cn("mb-1.5 block text-caption font-medium text-ink", className)}
      {...props}
    />
  );
}
