import { expect, test } from "@playwright/test";
import { register, uniqueName } from "./helpers";

test("register, see the sample board, log out and log back in", async ({ page }) => {
  const name = uniqueName("reg");
  await register(page, name);
  await expect(page.getByRole("heading", { name: "Kanban Studio" })).toBeVisible();
  await expect(page.getByTestId(/column-/)).toHaveCount(5);

  await page.getByRole("button", { name: /log out/i }).click();
  await page.getByLabel("Username").fill(name);
  await page.getByLabel("Password").fill("e2e-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByTestId(/column-/)).toHaveCount(5);
});

test("registration rejects mismatched passwords and a taken username", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /create an account/i }).click();
  await page.getByLabel("Username").fill("user");
  await page.getByLabel("Password", { exact: true }).fill("e2e-password");
  await page.getByLabel("Confirm password").fill("different-password");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.locator("form").getByRole("alert")).toContainText("do not match");

  await page.getByLabel("Confirm password").fill("e2e-password");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.locator("form").getByRole("alert")).toContainText("already taken");
});

test("change password, then the old one stops working", async ({ page }) => {
  const name = uniqueName("pw");
  await register(page, name);
  await page.getByRole("button", { name: new RegExp(name) }).click();
  const panel = page.getByRole("region", { name: "Account" });
  await panel.getByLabel("Current password").fill("wrong-password");
  await panel.getByLabel("New password").fill("brand-new-pass");
  await panel.getByRole("button", { name: "Change password" }).click();
  await expect(panel.getByRole("alert")).toContainText("current password is wrong");

  await panel.getByLabel("Current password").fill("e2e-password");
  await panel.getByRole("button", { name: "Change password" }).click();
  await expect(panel.getByRole("status")).toContainText("Password changed");

  await page.getByRole("button", { name: /log out/i }).click();
  await page.getByLabel("Username").fill(name);
  await page.getByLabel("Password").fill("e2e-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Invalid username or password.")).toBeVisible();
  await page.getByLabel("Password").fill("brand-new-pass");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Kanban Studio" })).toBeVisible();
});

test("delete account removes it", async ({ page }) => {
  const name = uniqueName("del");
  await register(page, name);
  await page.getByRole("button", { name: new RegExp(name) }).click();
  const panel = page.getByRole("region", { name: "Account" });
  await panel.getByRole("button", { name: "Delete account" }).click();
  await panel.getByLabel("Confirm with your password").fill("e2e-password");
  await panel.getByRole("button", { name: "Permanently delete" }).click();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();

  await page.getByLabel("Username").fill(name);
  await page.getByLabel("Password").fill("e2e-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Invalid username or password.")).toBeVisible();
});
