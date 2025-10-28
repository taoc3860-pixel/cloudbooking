// web/js/api.js
// Simple fetch helper with optional auth; JSON-safe parsing.

(function () {
  const API_BASE = "/api";

  async function apiFetch(path, method = "GET", body = null, withAuth = false) {
    const headers = { "Content-Type": "application/json" };
    if (withAuth) {
      const t = localStorage.getItem("token");
      if (t) headers.Authorization = `Bearer ${t}`;
    }

    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : null,
    });

    // Clear token on 401
    if (res.status === 401) localStorage.removeItem("token");

    const text = await res.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch { data = { ok: false, message: text }; }

    if (!res.ok) {
      throw new Error(data?.message || `HTTP ${res.status}`);
    }
    return data;
  }

  // expose globally
  window.apiFetch = apiFetch;
})();
