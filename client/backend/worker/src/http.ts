/** Generic JSON response helper for the household API routes (index.ts keeps its own ExtractionResponse-typed one for the extraction route). */
export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** Never throws — a malformed/missing JSON body just becomes null for the caller to reject with a 400. */
export async function readJsonBody<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}
