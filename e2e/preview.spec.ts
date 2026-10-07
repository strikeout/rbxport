/**
 * The browser's preview: a click on a row's preview waveform plays that track
 * from there on the engine's preview voice. The mock never loads that voice,
 * so this covers the controls, not the sound.
 */
import { expect, test } from "@playwright/test";

test("a click on a preview waveform starts a preview, and its stop button or Escape ends it", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("browser-title")).toContainText("Tracks)");
  const waveforms = page.locator('[role="gridcell"][data-col="preview"] canvas');
  await expect(waveforms.first()).toBeVisible();
  const stop = page.getByRole("button", { name: "Stop preview" });
  await expect(stop).toHaveCount(0);

  await waveforms.first().click({ position: { x: 60, y: 5 } });
  await expect(stop).toHaveCount(1);
  // The press is the preview's, not the row's: nothing is loaded onto a deck.
  await expect(page.getByRole("region", { name: "Preview player" }).getByRole("button", { name: "Play", exact: true })).toBeDisabled();

  await stop.click();
  await expect(stop).toHaveCount(0);

  await waveforms.first().click({ position: { x: 60, y: 5 } });
  await expect(stop).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(stop).toHaveCount(0);
});
