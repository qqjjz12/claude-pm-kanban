import { expect, test } from "@playwright/test";
import { register, uniqueName } from "./helpers";

test("a card keeps its priority, due date and labels across reload", async ({ page }) => {
  await register(page, uniqueName("fld"));
  const column = page.getByTestId(/column-/).first();

  await column.getByRole("button", { name: "Add a card" }).click();
  await column.getByPlaceholder("Card title").fill("Ship it");
  await column.getByLabel("Priority").selectOption("high");
  await column.getByLabel("Due date").fill("2000-01-02");
  await column.getByLabel("Labels").fill("release, urgent, release");
  await column.getByRole("button", { name: "Add card" }).click();

  const card = column.locator("article", { hasText: "Ship it" });
  await expect(card.getByText("high")).toBeVisible();
  await expect(card.getByText(/Overdue/)).toBeVisible();
  await expect(card.getByText("release")).toHaveCount(1);
  await expect(card.getByText("urgent")).toBeVisible();

  await page.reload();
  const reloaded = page.getByTestId(/column-/).first().locator("article", { hasText: "Ship it" });
  await expect(reloaded.getByText("high")).toBeVisible();
  await expect(reloaded.getByText(/Overdue/)).toBeVisible();
  await expect(reloaded.getByText("urgent")).toBeVisible();
});

test("editing a card changes and clears its fields", async ({ page }) => {
  await register(page, uniqueName("fld"));
  const column = page.getByTestId(/column-/).first();
  await column.getByRole("button", { name: "Edit Align roadmap themes", exact: true }).click();
  await column.getByLabel("Priority").selectOption("medium");
  await column.getByLabel("Due date").fill("2999-12-31");
  await column.getByLabel("Labels").fill("planning");
  await column.getByRole("button", { name: "Save", exact: true }).click();

  const card = column.locator("article", { hasText: "Align roadmap themes" });
  await expect(card.getByText("medium")).toBeVisible();
  await expect(card.getByText(/^Due /)).toBeVisible();
  await expect(card.getByText("planning")).toBeVisible();

  await page.reload();
  const again = page.getByTestId(/column-/).first().locator("article", { hasText: "Align roadmap themes" });
  await expect(again.getByText("planning")).toBeVisible();

  const first = page.getByTestId(/column-/).first();
  await again.getByRole("button", { name: "Edit Align roadmap themes", exact: true }).click();
  await first.getByLabel("Priority").selectOption("none");
  await first.getByLabel("Due date").fill("");
  await first.getByLabel("Labels").fill("");
  await first.getByRole("button", { name: "Save", exact: true }).click();
  await page.reload();
  const cleared = page.getByTestId(/column-/).first().locator("article", { hasText: "Align roadmap themes" });
  await expect(cleared.getByText("planning")).toHaveCount(0);
  await expect(cleared.getByText(/^Due /)).toHaveCount(0);
});
