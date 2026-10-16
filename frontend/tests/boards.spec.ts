import { expect, test, type Page } from "@playwright/test";
import { register, uniqueName, reloadSettled } from "./helpers";

const newBoard = async (page: Page, name: string, template?: string) => {
  await page.getByRole("button", { name: "New board" }).click();
  await page.getByLabel("Board name").fill(name);
  if (template) {
    await page.getByLabel("Template").selectOption(template);
  }
  await page.getByRole("button", { name: "Save board" }).click();
};

test("create boards, switch between them, rename and delete", async ({ page }) => {
  await register(page, uniqueName("brd"));
  await expect(page.getByTestId(/column-/)).toHaveCount(5);

  await newBoard(page, "Roadmap");
  await expect(page.getByTestId(/column-/)).toHaveCount(3);
  await expect(page.getByLabel("Column title").first()).toHaveValue("To Do");

  // Cards belong to the board they were added to.
  await page.getByRole("button", { name: "Add a card" }).first().click();
  await page.getByPlaceholder("Card title").fill("Roadmap only");
  await page.getByRole("button", { name: "Add card" }).click();
  await expect(page.getByText("Roadmap only")).toBeVisible();

  await page.getByLabel("Board", { exact: true }).selectOption({ label: "My Board" });
  await expect(page.getByTestId(/column-/)).toHaveCount(5);
  await expect(page.getByText("Roadmap only")).toHaveCount(0);

  await page.getByLabel("Board", { exact: true }).selectOption({ label: "Roadmap" });
  await expect(page.getByText("Roadmap only")).toBeVisible();

  await page.getByRole("button", { name: "Rename board" }).click();
  await page.getByLabel("Board name").fill("Q4 Plan");
  await page.getByRole("button", { name: "Save board" }).click();
  await expect(page.getByRole("option", { name: "Q4 Plan" })).toHaveCount(1);

  await page.getByRole("button", { name: "Delete board" }).click();
  await page.getByRole("button", { name: "Delete board" }).click();
  await expect(page.getByRole("option", { name: "Q4 Plan" })).toHaveCount(0);
  await expect(page.getByTestId(/column-/)).toHaveCount(5);
  await expect(page.getByRole("button", { name: "Delete board" })).toBeDisabled();
});

test("a new board's columns survive a reload", async ({ page }) => {
  await register(page, uniqueName("rel"));
  await newBoard(page, "Empty one", "empty");
  await expect(page.getByTestId(/column-/)).toHaveCount(0);
  await page.getByRole("button", { name: "Add a column" }).click();
  await page.getByLabel("New column title").fill("Ideas");
  await page.getByRole("button", { name: "Add column" }).click();
  await expect(page.getByLabel("Column title")).toHaveValue("Ideas");

  await reloadSettled(page);
  // Reload returns to the first board; the new one still has its column.
  await page.getByLabel("Board", { exact: true }).selectOption({ label: "Empty one" });
  await expect(page.getByLabel("Column title")).toHaveValue("Ideas");
});

test("add and delete columns, confirming when cards would be lost", async ({ page }) => {
  await register(page, uniqueName("col"));
  await page.getByRole("button", { name: "Add a column" }).click();
  await page.getByLabel("New column title").fill("Blocked");
  await page.getByRole("button", { name: "Add column" }).click();
  await expect(page.getByTestId(/column-/)).toHaveCount(6);

  // The new, empty column is deleted straight away.
  await page.getByTestId(/column-/).last().getByRole("button", { name: "Delete column" }).click();
  await expect(page.getByTestId(/column-/)).toHaveCount(5);

  // A column with cards needs a second click.
  const backlog = page.getByTestId(/column-/).first();
  await expect(backlog.getByText("Align roadmap themes")).toBeVisible();
  await backlog.getByRole("button", { name: "Delete column" }).click();
  await expect(page.getByTestId(/column-/)).toHaveCount(5);
  await backlog.getByRole("button", { name: "Confirm delete column" }).click();
  await expect(page.getByTestId(/column-/)).toHaveCount(4);
  await expect(page.getByText("Align roadmap themes")).toHaveCount(0);

  await reloadSettled(page);
  await expect(page.getByTestId(/column-/)).toHaveCount(4);
});

test("users cannot see each other's boards", async ({ page, browser }) => {
  await register(page, uniqueName("iso"));
  await newBoard(page, "Private plans");
  await expect(page.getByRole("option", { name: "Private plans" })).toHaveCount(1);

  const context = await browser.newContext();
  const other = await context.newPage();
  await register(other, uniqueName("iso"));
  await expect(other.getByRole("heading", { name: "Kanban Studio" })).toBeVisible();
  await expect(other.getByRole("option", { name: "Private plans" })).toHaveCount(0);
  await context.close();
});
