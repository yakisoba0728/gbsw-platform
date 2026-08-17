import type { Metadata } from "next";
import { requirePermission } from "@/core/auth/session";
import { ImportForm } from "./import-form";

export const metadata: Metadata = { title: "명단 반영" };

export default async function StudentsImportPage() {
  await requirePermission("student:manage");

  return (
    // grid로 두면 암시적 열이 max-content라 표의 minWidth가 페이지를 밀어낸다.
    <div className="flex flex-col gap-4">
      <ImportForm />
    </div>
  );
}
