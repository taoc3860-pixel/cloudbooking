export async function apiFetch(path, method = "GET", body) {
  const headers = { "Content-Type": "application/json" };
  const token = localStorage.getItem("token");
  if (token) headers.Authorization = `Bearer ${token}`;

  const resp = await fetch(`/api${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  let data = null;
  try { data = await resp.json(); } catch {}
  if (!resp.ok) throw new Error((data && data.message) || `HTTP ${resp.status}`);
  return data;
}
