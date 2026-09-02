import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { hashPassword } from "better-auth/crypto";
import { Pool } from "pg";
import { MAX_YEAR, MIN_YEAR } from "../../src/modules/academic-year/academic-year.schema";

const suffix = randomUUID().replaceAll("-", "").slice(0, 16);
const userId = `e2e-academic-year-user-${suffix}`;
const accountId = `e2e-academic-year-account-${suffix}`;
const email = `e2e.academic-year.${suffix}@example.invalid`;
const password = "E2e-Academic-Year-2026!";

let pool: Pool | undefined;
let fixtureYears: [number, number] | undefined;
let originalCurrentYear: number | undefined;

test.beforeAll(async () => {
  const connectionString = process.env.PLAYWRIGHT_DATABASE_URL;
  if (!connectionString) {
    throw new Error("Playwright 전용 데이터베이스가 설정되지 않았습니다.");
  }

  pool = new Pool({ connectionString, max: 2 });
  const passwordHash = await hashPassword(password);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query('LOCK TABLE "AcademicYear" IN SHARE ROW EXCLUSIVE MODE');
    const years = await client.query<{ year: number; isCurrent: boolean }>(
      'SELECT "year", "isCurrent" FROM "AcademicYear" ORDER BY "year"',
    );
    const occupied = new Set(years.rows.map(({ year }) => year));
    const available = Array.from(
      { length: MAX_YEAR - MIN_YEAR + 1 },
      (_, index) => MAX_YEAR - index,
    ).filter((year) => !occupied.has(year));
    const [initialYear, nextYear] = available;
    if (initialYear === undefined || nextYear === undefined) {
      throw new Error("학년도 E2E에 필요한 미사용 학년도 두 개가 없습니다.");
    }
    const previousCurrent = years.rows.find(({ isCurrent }) => isCurrent)?.year;

    await client.query(
      `INSERT INTO "user"
        ("id", "name", "email", "emailVerified", "phone", "role", "status", "mustChangePassword", "updatedAt")
       VALUES ($1, $2, $3, true, $4, 'ADMIN', 'ACTIVE', false, CURRENT_TIMESTAMP)`,
      [userId, "학년도 E2E 교사", email, "010-0000-3100"],
    );
    await client.query(
      `INSERT INTO "account"
        ("id", "accountId", "providerId", "password", "userId", "updatedAt")
       VALUES ($1, $2, 'credential', $3, $2, CURRENT_TIMESTAMP)`,
      [accountId, userId, passwordHash],
    );
    if (previousCurrent !== undefined) {
      await client.query(
        'UPDATE "AcademicYear" SET "isCurrent" = false WHERE "year" = $1',
        [previousCurrent],
      );
    }
    await client.query(
      'INSERT INTO "AcademicYear" ("year", "isCurrent") VALUES ($1, true), ($2, false)',
      [initialYear, nextYear],
    );
    await client.query("COMMIT");
    originalCurrentYear = previousCurrent;
    fixtureYears = [initialYear, nextYear];
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

test.afterAll(async () => {
  if (!pool) return;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if (fixtureYears) {
      await client.query('LOCK TABLE "AcademicYear" IN SHARE ROW EXCLUSIVE MODE');
      await client.query(
        'UPDATE "AcademicYear" SET "isCurrent" = false WHERE "year" = ANY($1::int[])',
        [fixtureYears],
      );
      if (originalCurrentYear !== undefined) {
        await client.query(
          'UPDATE "AcademicYear" SET "isCurrent" = true WHERE "year" = $1',
          [originalCurrentYear],
        );
      }
      await client.query('DELETE FROM "AcademicYear" WHERE "year" = ANY($1::int[])', [
        fixtureYears,
      ]);
    }
    await client.query('DELETE FROM "AuditLog" WHERE "actorUserId" = $1', [userId]);
    await client.query('DELETE FROM "user" WHERE "id" = $1', [userId]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
});

test("현재 학년도를 연속 변경해도 선택값과 현재 표시가 일치한다", async ({ page }) => {
  if (!pool || !fixtureYears) throw new Error("학년도 E2E 픽스처가 준비되지 않았습니다.");
  const [initialYear, nextYear] = fixtureYears;

  await page.goto("/login");
  await page.getByLabel("이메일").fill(email);
  await page.getByLabel("비밀번호").fill(password);
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);

  await page.goto("/admin/users?tab=students");
  const select = page.getByRole("combobox", { name: "현재 학년도", exact: true });
  const designate = page.getByRole("button", { name: "현재로 지정", exact: true });
  await expect(select).toHaveValue(String(initialYear));
  await expect(designate).toBeDisabled();

  async function designateSelectedYear(year: number) {
    await expect(designate).toBeEnabled();
    await designate.click();
    const dialog = page.getByRole("dialog", { name: "현재 학년도 변경", exact: true });
    await expect(dialog).toContainText(`${year}학년도를 현재로 지정합니다.`);
    await dialog.getByRole("button", { name: "지정", exact: true }).click();
  }

  async function expectCurrentYear(year: number) {
    const currentLabel = `${year}학년도 (현재)`;
    await expect(select.getByRole("option", { name: currentLabel, exact: true })).toHaveCount(1);
    await expect(designate).toBeDisabled();
    await expect(select).toHaveValue(String(year));
    await expect(select.locator("option:checked")).toHaveText(currentLabel);
  }

  await select.selectOption(String(nextYear));
  await pool.query('DELETE FROM "AcademicYear" WHERE "year" = $1 AND "isCurrent" = false', [
    nextYear,
  ]);
  await designateSelectedYear(nextYear);
  const switchError = page.getByRole("alert").filter({
    hasText: "현재 학년도를 바꾸지 못했습니다.",
  });
  await expect(switchError).toBeVisible();
  await expect(select).toHaveValue(String(nextYear));
  await expect(designate).toBeEnabled();
  await expect(
    select.getByRole("option", { name: `${initialYear}학년도 (현재)`, exact: true }),
  ).toHaveCount(1);

  const newYear = page.getByRole("spinbutton", { name: "새 학년도", exact: true });
  await newYear.fill(String(nextYear));
  await page.getByRole("button", { name: "추가", exact: true }).click();
  const createDialog = page.getByRole("dialog", { name: "학년도 추가", exact: true });
  await createDialog.getByRole("button", { name: "추가", exact: true }).click();
  await expect(newYear).toHaveValue("");
  await expect(select).toHaveValue(String(nextYear));
  await expect(designate).toBeEnabled();
  await expect(
    select.getByRole("option", { name: `${initialYear}학년도 (현재)`, exact: true }),
  ).toHaveCount(1);

  await designateSelectedYear(nextYear);
  await expectCurrentYear(nextYear);
  await expect(switchError).toHaveCount(0);
  await select.selectOption(String(initialYear));
  await designateSelectedYear(initialYear);
  await expectCurrentYear(initialYear);
});
