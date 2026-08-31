import { randomUUID } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { hashPassword } from "better-auth/crypto";
import { Pool } from "pg";

const suffix = randomUUID().replaceAll("-", "").slice(0, 16);
const userId = `e2e-attachment-user-${suffix}`;
const accountId = `e2e-attachment-account-${suffix}`;
const communityId = `e2e-attachment-community-${suffix}`;
const email = `e2e.attachment.${suffix}@example.invalid`;
const password = "E2e-Attachment-2026!";
const userName = "첨부 E2E 교사";
const communitySlug = `e2e-files-${suffix}`;
const filename = "standalone-smoke.txt";
const payload = Buffer.from("standalone attachment round-trip\n", "utf8");

type StoredAttachment = {
  id: string;
  storageKey: string;
  storageYear: string;
  storageMonth: string;
};

let pool: Pool | undefined;

function storedPath(attachment: StoredAttachment): string {
  const uploadRoot = process.env.UPLOAD_DIR;
  if (!uploadRoot) throw new Error("Playwright UPLOAD_DIR가 설정되지 않았습니다.");

  return path.join(
    uploadRoot,
    attachment.storageYear,
    attachment.storageMonth,
    attachment.storageKey,
  );
}

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
    await client.query(
      `INSERT INTO "user"
        ("id", "name", "email", "emailVerified", "phone", "role", "status", "mustChangePassword", "updatedAt")
       VALUES ($1, $2, $3, true, $4, 'ADMIN', 'ACTIVE', false, CURRENT_TIMESTAMP)`,
      [userId, userName, email, "010-0000-3200"],
    );
    await client.query(
      `INSERT INTO "account"
        ("id", "accountId", "providerId", "password", "userId", "updatedAt")
       VALUES ($1, $2, 'credential', $3, $2, CURRENT_TIMESTAMP)`,
      [accountId, userId, passwordHash],
    );
    await client.query(
      `INSERT INTO "Community"
        ("id", "slug", "name", "readRoles", "writeRoles", "allowAttachments", "updatedAt")
       VALUES ($1, $2, $3, $4::text[], $5::text[], true, CURRENT_TIMESTAMP)`,
      [communityId, communitySlug, "첨부 E2E 게시판", [], []],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

test.afterAll(async () => {
  if (!pool) return;

  const attachments = await findStoredAttachments();

  for (const attachment of attachments) {
    await rm(storedPath(attachment), { force: true });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`DELETE FROM "AuditLog" WHERE "actorUserId" = $1`, [userId]);
    await client.query(`DELETE FROM "CommunityAttachment" WHERE "uploaderUserId" = $1`, [
      userId,
    ]);
    await client.query(`DELETE FROM "Community" WHERE "id" = $1`, [communityId]);
    await client.query(`DELETE FROM "user" WHERE "id" = $1`, [userId]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
});

async function findStoredAttachments(id?: string): Promise<StoredAttachment[]> {
  if (!pool) throw new Error("E2E 데이터베이스 풀이 준비되지 않았습니다.");

  const result = await pool.query<StoredAttachment>(
    `SELECT
       "id",
       "storageKey",
       TO_CHAR("createdAt", 'YYYY') AS "storageYear",
       TO_CHAR("createdAt", 'MM') AS "storageMonth"
     FROM "CommunityAttachment"
     WHERE "uploaderUserId" = $1
       AND ($2::text IS NULL OR "id" = $2)`,
    [userId, id ?? null],
  );
  return result.rows;
}

test("로그인한 교사가 standalone 저장소에 첨부를 올리고 다시 내려받는다", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByLabel("이메일").fill(email);
  await page.getByLabel("비밀번호").fill(password);
  await page.getByRole("button", { name: "로그인" }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText(userName).first()).toBeVisible();

  const upload = await page.context().request.post(
    `/api/community/attachments?slug=${encodeURIComponent(communitySlug)}`,
    {
      multipart: {
        file: {
          name: filename,
          mimeType: "text/plain",
          buffer: payload,
        },
      },
    },
  );

  expect(upload.status()).toBe(201);
  const uploaded = (await upload.json()) as {
    id?: unknown;
    filename?: unknown;
    size?: unknown;
    mimeType?: unknown;
  };
  expect(uploaded).toMatchObject({
    filename,
    size: payload.byteLength,
    mimeType: "text/plain",
  });
  expect(typeof uploaded.id).toBe("string");
  if (typeof uploaded.id !== "string") throw new Error("첨부 id가 응답에 없습니다.");

  const [attachment] = await findStoredAttachments(uploaded.id);
  expect(attachment).toBeDefined();
  if (!attachment) throw new Error("업로드한 첨부 행이 없습니다.");

  await expect(readFile(storedPath(attachment))).resolves.toEqual(payload);

  const download = await page.context().request.get(
    `/api/community/attachments/${attachment.id}/${encodeURIComponent(filename)}`,
  );

  expect(download.status()).toBe(200);
  expect(download.headers()["content-type"]).toBe("text/plain");
  expect(download.headers()["content-disposition"]).toContain(`filename="${filename}"`);
  await expect(download.body()).resolves.toEqual(payload);
});
