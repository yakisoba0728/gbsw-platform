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
  await expect(page.getByLabel("이메일")).toHaveValue("missing@example.invalid");
  await expect(page.getByLabel("비밀번호")).toHaveValue("");
  expect(new URL(page.url()).searchParams.has("password")).toBe(false);
});

test("자바스크립트가 없어도 로그인 자격 증명을 POST로만 보낸다", async ({
  browser,
}, testInfo) => {
  // browser에서 직접 만든 context에는 config의 `use.baseURL`이 자동 상속되지 않는다.
  const context = await browser.newContext({
    javaScriptEnabled: false,
    baseURL: testInfo.project.use.baseURL,
  });
  const page = await context.newPage();

  try {
    await page.goto("/login");
    const form = page.locator("form");
    expect(await form.getAttribute("method")).toBe("post");
    expect(
      new URL((await form.getAttribute("action")) ?? "", page.url()).pathname,
    ).toBe("/login/submit");

    await page.getByLabel("이메일").fill("no-js@example.invalid");
    await page.getByLabel("비밀번호").fill("fake-password-for-no-js");
    // JS를 끈 Next dev 문서는 웹폰트 로딩 중 버튼 위치가 계속 흔들릴 수 있다.
    // 실제 native form 제출 자체를 검증하려고 비밀번호 칸의 Enter로 보낸다.
    await page.getByLabel("비밀번호").press("Enter");

    await expect(page.getByText("이메일 또는 비밀번호가 맞지 않습니다.")).toBeVisible();
    await expect(page.getByLabel("이메일")).toHaveValue("no-js@example.invalid");
    await expect(page.getByLabel("비밀번호")).toHaveValue("");

    const url = new URL(page.url());
    expect(url.pathname).toBe("/login");
    expect(url.searchParams.has("email")).toBe(false);
    expect(url.searchParams.has("password")).toBe(false);
  } finally {
    await context.close();
  }
});

test("없는 주소는 한국어 복구 화면을 404로 응답한다", async ({ page }) => {
  const response = await page.goto("/route-that-does-not-exist");

  expect(response?.status()).toBe(404);
  await expect(
    page.getByRole("heading", { name: "페이지를 찾을 수 없습니다" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "처음 화면으로" })).toBeVisible();
});
