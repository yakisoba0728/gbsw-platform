import { redirect } from "next/navigation";

/**
 * 옛 주소. 계정·초대·학생을 `/admin/users?tab=`으로 모으면서 자리를 옮겼다.
 * 남겨 두는 이유는 즐겨찾기와 이미 나간 링크다 — 지우면 조용히 404가 된다.
 */
export default function InvitesRedirect() {
  redirect("/admin/users?tab=invites");
}
