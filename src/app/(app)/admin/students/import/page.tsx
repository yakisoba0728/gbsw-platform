import type { Metadata } from "next";
import { requirePermission } from "@/core/auth/session";
import { ImportForm } from "./import-form";

export const metadata: Metadata = { title: "명단 올리기" };

export default async function StudentsImportPage() {
  await requirePermission("student:manage");

  return (
    <div className="grid gap-5">
      <ImportForm />
    </div>
  );
}
