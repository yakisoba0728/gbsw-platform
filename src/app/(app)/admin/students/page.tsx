import { redirect } from "next/navigation";

export default function StudentsRedirect() {
  redirect("/admin/users?tab=students");
}
