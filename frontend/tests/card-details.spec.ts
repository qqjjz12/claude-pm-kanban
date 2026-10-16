import { expect, test } from "@playwright/test";
import { register, uniqueName, reloadSettled } from "./helpers";

const openDetails = async (page: import("@playwright/test").Page, title: string) => {
  await page.getByRole("button", { name: `Details for ${title}`, exact: true }).click();
  return page.getByRole("dialog", { name: "Card details" });
};

test("checklist and comments persist and show as badges", async ({ page }) => {
  await register(page, uniqueName("det"));
  const dialog = await openDetails(page, "Align roadmap themes");

  await dialog.getByLabel("New checklist item").fill("Draft themes");
  await dialog.getByRole("button", { name: "Add item" }).click();
  await dialog.getByLabel("New checklist item").fill("Review themes");
  await dialog.getByRole("button", { name: "Add item" }).click();
  await dialog.getByRole("checkbox", { name: "Draft themes" }).click();
  await expect(dialog.getByText("1/2 done")).toBeVisible();

  await dialog.getByLabel("New comment").fill("Needs a second pass");
  await dialog.getByRole("button", { name: "Add comment" }).click();
  await expect(dialog.getByText("Needs a second pass")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  const card = page.getByTestId(/^card-/).filter({ hasText: "Align roadmap themes" });
  await expect(card.getByText("Checklist 1/2")).toBeVisible();
  await expect(card.getByText("1 comment")).toBeVisible();

  await reloadSettled(page);
  const again = page.getByTestId(/^card-/).filter({ hasText: "Align roadmap themes" });
  await expect(again.getByText("Checklist 1/2")).toBeVisible();
  const reopened = await openDetails(page, "Align roadmap themes");
  await expect(reopened.getByRole("checkbox", { name: "Draft themes" })).toBeChecked();
  await expect(reopened.getByRole("checkbox", { name: "Review themes" })).not.toBeChecked();
  await expect(reopened.getByText("Needs a second pass")).toBeVisible();
});

test("remove checklist items and comments", async ({ page }) => {
  await register(page, uniqueName("det"));
  const dialog = await openDetails(page, "Gather customer signals");
  await dialog.getByLabel("New checklist item").fill("Temporary");
  await dialog.getByRole("button", { name: "Add item" }).click();
  await dialog.getByLabel("New comment").fill("Temporary note");
  await dialog.getByRole("button", { name: "Add comment" }).click();
  await expect(dialog.getByText("Temporary note")).toBeVisible();

  await dialog.getByRole("button", { name: "Remove Temporary" }).click();
  await dialog.getByRole("button", { name: "Delete comment" }).click();
  await expect(dialog.getByText("No comments yet.")).toBeVisible();
  await dialog.getByRole("button", { name: "Close details" }).click();

  const card = page.getByTestId(/^card-/).filter({ hasText: "Gather customer signals" });
  await expect(card.getByText(/Checklist|comment/)).toHaveCount(0);
});

test("deleting a card closes nothing else and its details go with it", async ({ page }) => {
  await register(page, uniqueName("det"));
  const dialog = await openDetails(page, "Prototype analytics view");
  await dialog.getByLabel("New comment").fill("bye");
  await dialog.getByRole("button", { name: "Add comment" }).click();
  await expect(dialog.getByText("bye")).toBeVisible();
  await dialog.getByRole("button", { name: "Close details" }).click();
  await page.getByRole("button", { name: "Delete Prototype analytics view", exact: true }).click();
  await expect(page.getByText("Prototype analytics view")).toHaveCount(0);
  await reloadSettled(page);
  await expect(page.getByText("Prototype analytics view")).toHaveCount(0);
});
