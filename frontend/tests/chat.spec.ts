import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("chat shows the reply and updates the board without reload", async ({ page }) => {
  await login(page);
  await expect(page.getByTestId(/^column-/)).toHaveCount(5);

  // Mocked chat endpoint: return the current board with the first column renamed.
  await page.route("**/api/chat", async (route) => {
    const board = await (await page.request.get("/api/board")).json();
    board.columns[0].title = "Renamed by AI";
    await route.fulfill({ json: { reply: "I renamed the column.", board } });
  });

  await page.getByLabel("Chat message").fill("Rename the first column");
  await page.getByRole("button", { name: "Send" }).click();

  await expect(page.getByTestId("chat-assistant")).toHaveText("I renamed the column.");
  await expect(page.getByTestId("chat-user")).toHaveText("Rename the first column");
  await expect(page.getByLabel("Column title").first()).toHaveValue("Renamed by AI");
});

test("chat shows an error when the endpoint fails", async ({ page }) => {
  await login(page);
  await page.route("**/api/chat", (route) =>
    route.fulfill({ status: 502, json: { detail: "AI request failed" } })
  );
  await page.getByLabel("Chat message").fill("Hello");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "could not respond" })).toBeVisible();
});

test("chat sidebar collapses", async ({ page }) => {
  await login(page);
  await page.getByRole("button", { name: "Collapse chat" }).click();
  await expect(page.getByLabel("Chat message")).toBeHidden();
  await page.getByRole("button", { name: "Expand chat" }).click();
  await expect(page.getByLabel("Chat message")).toBeVisible();
});
