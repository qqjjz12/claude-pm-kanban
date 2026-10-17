import { expect, test } from "@playwright/test";
import { register, uniqueName, reloadSettled } from "./helpers";

test("search and filters narrow the board and clear again", async ({ page }) => {
  await register(page, uniqueName("flt"));
  const summary = page.getByTestId("board-summary");
  await expect(summary).toContainText("8 cards");

  // Give one card a priority and label so there is something to filter on.
  const backlog = page.getByTestId(/column-/).first();
  await backlog.getByRole("button", { name: "Edit Align roadmap themes", exact: true }).click();
  await backlog.getByLabel("Priority").selectOption("high");
  await backlog.getByLabel("Labels").fill("planning");
  await backlog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(summary).toContainText("1 high priority");

  await page.getByLabel("Search cards").fill("onboarding");
  await expect(page.getByText("Close onboarding sprint")).toBeVisible();
  await expect(page.getByText("Align roadmap themes")).toHaveCount(0);
  await expect(summary).toHaveText("Showing 1 of 8 cards");

  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(page.getByText("Align roadmap themes")).toBeVisible();

  await page.getByLabel("Filter by priority").selectOption("high");
  await expect(summary).toHaveText("Showing 1 of 8 cards");
  await page.getByRole("button", { name: "Clear filters" }).click();

  await page.getByLabel("Filter by label").selectOption("planning");
  await expect(summary).toHaveText("Showing 1 of 8 cards");
  await expect(page.getByText("Align roadmap themes")).toBeVisible();

  // Filters are per view: reload shows everything.
  await reloadSettled(page);
  await expect(summary).toContainText("8 cards");
});

test("the label filter says why it is disabled until a card has a label", async ({ page }) => {
  await register(page, uniqueName("flt"));
  const select = page.getByLabel("Filter by label");
  await expect(select).toBeDisabled();
  await expect(select.locator("option")).toHaveText(["No labels yet"]);

  const backlog = page.getByTestId(/column-/).first();
  await backlog.getByRole("button", { name: "Edit Align roadmap themes", exact: true }).click();
  await backlog.getByLabel("Labels").fill("planning");
  await backlog.getByRole("button", { name: "Save", exact: true }).click();

  await expect(select).toBeEnabled();
  await expect(select.locator("option")).toHaveText(["Any label", "planning"]);
  await select.selectOption("planning");
  await expect(page.getByTestId("board-summary")).toHaveText("Showing 1 of 8 cards");
});
