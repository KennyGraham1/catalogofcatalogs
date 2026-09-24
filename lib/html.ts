/** Escape text inserted into HTML strings by libraries outside React. */
export function escapeHtml(value: string): string {
  return String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]!));
}
