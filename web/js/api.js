// api.js —— 所有请求都用它
async function apiFetch(path, method = "GET", body) {
  const headers = { "Content-Type": "application/json" };
  // ✅ 每次调用时，现从 localStorage 取 token，不要在模块顶层缓存
  const token = localStorage.getItem("token");
  if (token) headers.Authorization = `Bearer ${token}`;

  const resp = await fetch(`/api${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  // 尝试解析 JSON（有些错误响应未必是 JSON）
  let data = null;
  try { data = await resp.json(); } catch { data = null; }

  if (!resp.ok) {
    const msg = (data && data.message) || `HTTP ${resp.status}`;
    throw new Error(msg);
  }
  return data;
}
