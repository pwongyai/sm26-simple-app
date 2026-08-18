// Server-only AgroAPI helper. The token lives in the environment and never
// reaches the browser — every call the app makes goes through a route that
// imports this.
export async function agroFetch(path, options = {}) {
  const res = await fetch(`${process.env.AGROAPI_BASE_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${process.env.AGROAPI_TOKEN}`,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
    cache: "no-store",
  });

  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  return { ok: res.ok, status: res.status, body };
}
