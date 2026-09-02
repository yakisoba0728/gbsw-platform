import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";
import { fieldClass, type FieldSize } from "./input";

export function Select({
  size = "md",
  className,
  ...props
}: Omit<ComponentProps<"select">, "size"> & {
  size?: FieldSize;
}) {
  return (
    <select
      className={cn(fieldClass(size), "field-chevron", className)}
      {...props}
    />
  );
}
