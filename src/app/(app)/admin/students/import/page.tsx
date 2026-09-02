import type { Metadata } from "next";
import { requirePermission } from "@/core/auth/session";
import { ImportForm } from "./import-form";

export const metadata: Metadata = { title: "명단 반영" };

export default async function StudentsImportPage() {
  await requirePermission("student:manage");

  return (
    <div className="flex flex-col gap-4">
      <ImportForm />
    </div>
  );
}
