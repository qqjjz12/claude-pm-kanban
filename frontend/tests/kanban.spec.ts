import { expect, test, type Page } from "@playwright/test";
import { login } from "./helpers";

// Data persists in the backend, so each test creates its own uniquely named
// card and removes it at the end, leaving the seeded board untouched.

const column = (page: Page, index: number) =>
  page.locator('[data-testid^="column-"]').nth(index);

const card = (page: Page, title: string) =>
  page.locator('[data-testid^="card-"]', { hasText: title });

const addCard = async (page: Page, index: number, title: string) => {
  const col = column(page, index);
  await col.getByRole("button", { name: /add a card/i }).click();
  await col.getByPlaceholder("Card title").fill(title);
  await col.getByPlaceholder("Details").fill("Added via e2e.");
  await col.getByRole("button", { name: /add card/i }).click();
  await expect(card(page, title)).toBeVisible();
};

const removeCard = async (page: Page, title: string) => {
  await card(page, title).getByRole("button", { name: /^delete/i }).click();
  await expect(card(page, title)).toHaveCount(0);
};

const uniqueTitle = (label: string) => `${label} ${Date.now()}`;

test.beforeEach(async ({ page }) => {
  await login(page);
});

test("loads the kanban board", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "Kanban Studio" })).toBeVisible();
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(5);
});

test("a new card persists across reload", async ({ page }) => {
  const title = uniqueTitle("Persist");
  await addCard(page, 0, title);
  await page.reload();
  await expect(column(page, 0).getByText(title)).toBeVisible();
  await removeCard(page, title);
});

test("a deleted card stays deleted after reload", async ({ page }) => {
  const title = uniqueTitle("Delete");
  await addCard(page, 0, title);
  await removeCard(page, title);
  await page.reload();
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(5);
  await expect(card(page, title)).toHaveCount(0);
});

test("an edited card persists across reload", async ({ page }) => {
  const title = uniqueTitle("Edit");
  const edited = `${title} edited`;
  await addCard(page, 0, title);
  await card(page, title).getByRole("button", { name: /^edit/i }).click();
  // While editing, the title is an input value rather than text.
  await column(page, 0).getByLabel("Edit card title").fill(edited);
  await column(page, 0).getByRole("button", { name: "Save", exact: true }).click();
  await expect(card(page, edited)).toBeVisible();
  await page.reload();
  await expect(card(page, edited)).toBeVisible();
  await removeCard(page, edited);
});

test("a renamed column persists across reload", async ({ page }) => {
  const original = await column(page, 1).getByLabel("Column title").inputValue();
  const renamed = uniqueTitle("Renamed");
  const rename = async (title: string) => {
    const input = column(page, 1).getByLabel("Column title");
    const saved = page.waitForResponse(
      (r) => r.url().includes("/api/columns/") && r.request().method() === "PUT"
    );
    await input.fill(title);
    await input.blur();
    await saved;
  };

  try {
    await rename(renamed);
    await page.reload();
    await expect(column(page, 1).getByLabel("Column title")).toHaveValue(renamed);
  } finally {
    // Always put the real board back, even if an assertion above failed.
    await rename(original);
  }
});

test("a moved card stays in its new column after reload", async ({ page }) => {
  const title = uniqueTitle("Move");
  await addCard(page, 0, title);

  const source = await card(page, title).boundingBox();
  const target = await column(page, 3).boundingBox();
  if (!source || !target) {
    throw new Error("Unable to resolve drag coordinates.");
  }
  await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x + target.width / 2, target.y + 120, { steps: 12 });
  const saved = page.waitForResponse((r) => r.url().includes("/move"));
  await page.mouse.up();
  await saved;
  await expect(column(page, 3).getByText(title)).toBeVisible();

  await page.reload();
  await expect(column(page, 3).getByText(title)).toBeVisible();
  await removeCard(page, title);
});

test("long unbroken text stays inside the card", async ({ page }) => {
  const title = uniqueTitle("Long");
  const col = column(page, 0);
  await col.getByRole("button", { name: /add a card/i }).click();
  await col.getByPlaceholder("Card title").fill(title);
  await col.getByPlaceholder("Details").fill("r".repeat(200));
  await col.getByRole("button", { name: /add card/i }).click();

  const box = (await card(page, title).boundingBox())!;
  const details = (await card(page, title).locator("p").boundingBox())!;
  expect(details.x + details.width).toBeLessThanOrEqual(box.x + box.width);
  await removeCard(page, title);
});
