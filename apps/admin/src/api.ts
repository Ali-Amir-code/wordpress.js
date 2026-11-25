export async function api<T>(
  path: string,
  options?: { method?: string; body?: unknown },
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method: options?.method || 'GET',
    credentials: 'same-origin',
    ...(options?.body !== undefined
      ? options.body instanceof FormData
        ? { body: options.body }
        : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(options.body) }
      : {}),
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(
      data.details?.join('\n') || data.error || 'The request failed. Please try again.',
    );
  return data as T;
}
export function message(error: unknown) {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}

// JSON object key order is not content. Arrays retain their meaningful order.
export function contentSignature(value: unknown): string {
  return JSON.stringify(value, (_key, item) =>
    item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(
          Object.keys(item)
            .sort()
            .map((key) => [key, item[key]]),
        )
      : item,
  );
}

export const navigation = { confirmLeave: null as (() => boolean) | null };
