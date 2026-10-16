import { expect, test } from "@playwright/test";
import { register, uniqueName, reloadSettled } from "./helpers";

test("columns can be reordered and the order persists", async ({ page }) => {
  await register(page, uniqueName("ord"));
  const titles = () => page.getByLabel("Column title").evaluateAll((els) => els.map((el) => (el as HTMLInputElement).value));
  await expect(page.getByLabel("Column title").first()).toHaveValue("Backlog");

  await page.getByRole("button", { name: "Move Backlog right" }).click();
  await expect.poll(titles).toEqual(["Discovery", "Backlog", "In Progress", "Review", "Done"]);
  await page.getByRole("button", { name: "Move Done left" }).click();
  await expect.poll(titles).toEqual(["Discovery", "Backlog", "In Progress", "Done", "Review"]);
  await expect(page.getByRole("button", { name: "Move Discovery left" })).toBeDisabled();

  await reloadSettled(page);
  await expect.poll(titles).toEqual(["Discovery", "Backlog", "In Progress", "Done", "Review"]);
});

test("a board can be exported as a JSON file", async ({ page }) => {
  await register(page, uniqueName("exp"));
  const column = page.getByTestId(/column-/).first();
  await column.getByRole("button", { name: "Edit Align roadmap themes", exact: true }).click();
  await column.getByLabel("Priority").selectOption("high");
  await column.getByLabel("Labels").fill("planning");
  await column.getByRole("button", { name: "Save", exact: true }).click();
  await expect(column.getByText("planning")).toBeVisible();

  await page.waitForLoadState("networkidle"); // let the save above finish before exporting
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export board" }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe("my-board.json");

  const fs = await import("node:fs/promises");
  const data = JSON.parse(await fs.readFile((await download.path())!, "utf-8"));
  expect(data.name).toBe("My Board");
  expect(data.columns).toHaveLength(5);
  expect(data.columns[0].title).toBe("Backlog");
  expect(data.columns[0].cards[0]).toMatchObject({
    title: "Align roadmap themes",
    priority: "high",
    labels: ["planning"],
  });
});
