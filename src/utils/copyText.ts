/**
 * Copy text to the clipboard, on any origin.
 *
 * `navigator.clipboard` exists only in a secure context: HTTPS, or
 * `localhost`. A stack reached over a LAN address on plain HTTP has no
 * clipboard API at all, so a bare `navigator.clipboard.writeText` throws and a
 * copy button does nothing. This falls back to a selected, off-screen textarea
 * and `document.execCommand('copy')`, which works there.
 *
 * Resolves true when the text was copied, false when neither path could.
 * It never rejects.
 */
export async function copyText(text: string): Promise<boolean> {
  const clipboard =
    typeof navigator === 'undefined' ? undefined : navigator.clipboard;
  if (clipboard?.writeText) {
    try {
      await clipboard.writeText(text);
      return true;
    } catch {
      // Refused (permission, focus): try the fallback below.
    }
  }
  return copyThroughSelection(text);
}

function copyThroughSelection(text: string): boolean {
  if (typeof document === 'undefined') return false;
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.setAttribute('aria-hidden', 'true');
  area.style.position = 'fixed';
  area.style.top = '0';
  area.style.left = '-9999px';
  area.style.opacity = '0';
  const active =
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
  document.body.appendChild(area);
  try {
    area.select();
    area.setSelectionRange(0, text.length);
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    area.remove();
    active?.focus();
  }
}
