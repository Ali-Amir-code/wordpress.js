export function isSafeUrl(value: string, image = false): boolean {
  if (!value || /[\s\\\u0000-\u001f\u007f]/.test(value)) return false;
  if (/^\/(?!\/)/.test(value)) return true;
  if (!image && value.startsWith('#')) return true;
  try {
    const url = new URL(value);
    return (image ? ['https:', 'http:'] : ['https:', 'http:', 'mailto:', 'tel:']).includes(
      url.protocol,
    );
  } catch {
    return false;
  }
}
