// Automatically match the current port using relative paths
const API_BASE = "/api";

window.apiFetch = async function apiFetch(path, method = "GET", body = null) {
  const url = path.startsWith("/api/") ? path : `${API_BASE}${path.startsWith("/") ? path : "/" + path}`;

  // set header
  const headers = { "Content-Type": "application/json" };
  const token = localStorage.getItem("token");
  if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    throw new Error("Failed to fetch — Please verify that the server is running.");
  }

  // 
  if (res.status === 401) {
    localStorage.removeItem("token");
    window.location.href = "index.html";
    return;
  }

  // Exception Handling
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const errData = await res.json();
      msg = errData.message || errData.error || msg;
    } catch {}
    throw new Error(msg);
  }

  // 自动识别返回类型
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    return res.json();
  } else {
    return res.text();
  }
};
