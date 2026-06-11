/**
 * Shared scroll-and-flash primitive used by the KB viewer (section jumps)
 * and the chat pane (message jumps). Kept here so neither caller imports
 * from the other — no weird coupling between components/ and lib/.
 */

/** Duration the kb-flash-target class stays active (matches the CSS animation). */
const FLASH_MS = 1600;

/**
 * Scrolls `el` to the top of the visible area and flashes it with the
 * `kb-flash-target` class for `FLASH_MS` milliseconds. Runs synchronously —
 * callers that need the element committed to the DOM first must defer on
 * their own (e.g. `setTimeout(..., 0)`).
 */
export function scrollAndFlash(el: HTMLElement): void {
  el.scrollIntoView({ block: "start" });
  el.classList.add("kb-flash-target");
  setTimeout(() => el.classList.remove("kb-flash-target"), FLASH_MS);
}
