import { expect, test } from "@playwright/test";
import { register, uniqueName } from "./helpers";

test("activity log records changes by the user", async ({ page }) => {
  const name = uniqueName("act");
  await register(page, name);
  await page.getByRole("navigation", { name: "Views" }).getByRole("button", { name: "Activity", exact: true }).click();
  await expect(page.getByText(/No activity yet/)).toBeVisible();

  await page.getByRole("navigation", { name: "Views" }).getByRole("button", { name: "Board", exact: true }).click();
  const column = page.getByTestId(/column-/).first();
  await column.getByRole("button", { name: "Add a card" }).click();
  await column.getByPlaceholder("Card title").fill("Logged card");
  await column.getByRole("button", { name: "Add card" }).click();
  await expect(page.getByText("Logged card")).toBeVisible();
  await page.getByRole("button", { name: "Delete Logged card", exact: true }).click();
  await expect(page.getByText("Logged card")).toHaveCount(0);

  await page.getByRole("navigation", { name: "Views" }).getByRole("button", { name: "Activity", exact: true }).click();
  const panel = page.getByRole("region", { name: "Activity" });
  await expect(panel.getByText(/deleted card "Logged card"/)).toBeVisible();
  await expect(panel.getByText(/created card "Logged card" in "Backlog"/)).toBeVisible();
  await expect(panel.locator("strong", { hasText: name })).toHaveCount(2);
});

test("dashboard reflects the board and updates as it changes", async ({ page }) => {
  await register(page, uniqueName("dash"));
  const column = page.getByTestId(/column-/).first();
  await column.getByRole("button", { name: "Edit Align roadmap themes", exact: true }).click();
  await column.getByLabel("Priority").selectOption("high");
  await column.getByLabel("Due date").fill("2000-01-01");
  await column.getByLabel("Labels").fill("planning");
  await column.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByTestId("board-summary")).toContainText("1 overdue");

  await page.getByRole("navigation", { name: "Views" }).getByRole("button", { name: "Dashboard", exact: true }).click();
  const dashboard = page.getByRole("region", { name: "Dashboard" });
  await expect(dashboard.getByTestId("tile-Cards")).toContainText("8");
  await expect(dashboard.getByTestId("tile-Overdue")).toContainText("1");
  await expect(dashboard.getByRole("list", { name: "Needs attention" })).toContainText("Align roadmap themes");
  await expect(dashboard.getByText("planning (1)")).toBeVisible();
  await expect(dashboard.getByRole("list", { name: "Cards per column" })).toContainText("Backlog");
  await expect(page.getByTestId(/column-/)).toHaveCount(0);

  await page.getByRole("navigation", { name: "Views" }).getByRole("button", { name: "Board", exact: true }).click();
  await expect(page.getByTestId(/column-/)).toHaveCount(5);
});
