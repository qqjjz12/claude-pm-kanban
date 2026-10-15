import { expect, test } from "@playwright/test";

test("loads the kanban board", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Kanban Studio" })).toBeVisible();
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(5);
});

test("adds a card to a column", async ({ page }) => {
  await page.goto("/");
  const firstColumn = page.locator('[data-testid^="column-"]').first();
  await firstColumn.getByRole("button", { name: /add a card/i }).click();
  await firstColumn.getByPlaceholder("Card title").fill("Playwright card");
  await firstColumn.getByPlaceholder("Details").fill("Added via e2e.");
  await firstColumn.getByRole("button", { name: /add card/i }).click();
  await expect(firstColumn.getByText("Playwright card")).toBeVisible();
});

test("moves a card between columns", async ({ page }) => {
  await page.goto("/");
  const card = page.getByTestId("card-card-1");
  const targetColumn = page.getByTestId("column-col-review");
  const cardBox = await card.boundingBox();
  const columnBox = await targetColumn.boundingBox();
  if (!cardBox || !columnBox) {
    throw new Error("Unable to resolve drag coordinates.");
  }

  await page.mouse.move(
    cardBox.x + cardBox.width / 2,
    cardBox.y + cardBox.height / 2
  );
  await page.mouse.down();
  await page.mouse.move(
    columnBox.x + columnBox.width / 2,
    columnBox.y + 120,
    { steps: 12 }
  );
  await page.mouse.up();
  await expect(targetColumn.getByTestId("card-card-1")).toBeVisible();
});

test("renames a column", async ({ page }) => {
  await page.goto("/");
  const input = page.getByTestId("column-col-backlog").getByLabel("Column title");
  await input.fill("Ideas");
  await expect(input).toHaveValue("Ideas");
});

test("edits a card", async ({ page }) => {
  await page.goto("/");
  const card = page.getByTestId("card-card-1");
  await card.getByRole("button", { name: /edit/i }).click();
  await card.getByLabel("Edit card title").fill("Edited title");
  await card.getByRole("button", { name: "Save" }).click();
  await expect(card.getByText("Edited title")).toBeVisible();
});

test("deletes a card", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("card-card-2").getByRole("button", { name: /delete/i }).click();
  await expect(page.getByTestId("card-card-2")).toHaveCount(0);
});
