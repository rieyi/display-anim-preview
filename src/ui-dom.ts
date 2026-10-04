/** Shared small DOM helpers for plugin panels. */

export function el(tag: string, text?: string): HTMLElementLike {
  const node = document.createElement(tag);
  if (text) node.innerText = text;
  return node;
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[character]!));
}

/** Applies the shared border highlight on focus used by all form controls. */
export function applyFocusHighlight(control: HTMLElementLike): void {
  const focusable = control as unknown as { onfocus: () => void; onblur: () => void };
  focusable.onfocus = () => { control.style.borderColor = "var(--color-accent)"; };
  focusable.onblur = () => { control.style.borderColor = "var(--color-border)"; };
}
