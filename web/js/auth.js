// web/js/auth.js — use /api prefix everywhere
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
    body: body ? JSON.stringify(body) : undefined,
  });

  // 401 -> 清掉本地 token
  if (res.status === 401) localStorage.removeItem("token");

  const text = await res.text();
  if (!res.ok) throw new Error(text || res.statusText);
  try { return JSON.parse(text); } catch { return {}; }
}

// 切换表单
function showRegister() {
  document.getElementById("form-login").style.display = "none";
  document.getElementById("form-register").style.display = "block";
}
function showLogin() {
  document.getElementById("form-register").style.display = "none";
  document.getElementById("form-login").style.display = "block";
}

// 登录
async function login() {
  const username = document.getElementById("login-username").value.trim();
  const password = document.getElementById("login-password").value.trim();
  try {
    if (!username || !password) throw new Error("Username and password required.");
    const data = await apiFetch("/auth/login", "POST", { username, password });
    if (!data?.token) throw new Error("No token returned by server.");
    localStorage.setItem("token", data.token);
    alert("Login success");
    location.replace("dashboard.html");
  } catch (err) {
    alert("Login failed: " + err.message);
  }
}

// 注册
async function register() {
  const username = document.getElementById("reg-username").value.trim();
  const email    = document.getElementById("reg-email").value.trim();
  const password = document.getElementById("reg-password").value.trim();
  try {
    if (!username || !password) throw new Error("Username and password required.");
    const data = await apiFetch("/auth/register", "POST", { username, email, password });
    if (data?.token) {
      localStorage.setItem("token", data.token);
      alert("Register success!");
      location.replace("dashboard.html");
    } else {
      alert("Register success! Please login now.");
      showLogin();
    }
  } catch (err) {
    alert("Register failed: " + err.message);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("btn-login")?.addEventListener("click", (e) => {
    e.preventDefault(); login();
  });
  document.getElementById("btn-register")?.addEventListener("click", (e) => {
    e.preventDefault(); register();
  });
  document.getElementById("link-register")?.addEventListener("click", (e) => {
    e.preventDefault(); showRegister();
  });
  document.getElementById("link-login")?.addEventListener("click", (e) => {
    e.preventDefault(); showLogin();
  });
});
