import { expect, test } from "@playwright/test";

test("데이터베이스까지 연결된 상태로 health check가 응답한다", async ({ request }) => {
  const response = await request.get("/api/health");

  expect(response.status()).toBe(200);
  await expect(response.json()).resolves.toEqual({ ok: true, db: "up" });
});

test("비로그인 사용자는 보호 화면 대신 로그인 흐름을 완료한다", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "로그인" })).toBeVisible();

  await page.getByLabel("이메일").fill("missing@example.invalid");
  await page.getByLabel("비밀번호").fill("not-a-real-password");
  await page.getByRole("button", { name: "로그인" }).click();

  await expect(page.getByText("이메일 또는 비밀번호가 맞지 않습니다.")).toBeVisible();
});
