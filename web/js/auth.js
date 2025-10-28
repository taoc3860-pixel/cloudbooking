// web/auth.js — frontend API layer (with /api prefix)
const API_BASE = "/api";

function apiFetch(path, method = "GET", body = null, withAuth = false) {
  const headers = { "Content-Type": "application/json" };
  if (withAuth) {
    const t = localStorage.getItem("token");
    if (t) headers.Authorization = `Bearer ${t}`;
  }
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);

  return fetch(`${API_BASE}${path}`, opts).then(async (r) => {
    const text = await r.text();
    if (!r.ok) throw new Error(text || r.statusText);
    try { return JSON.parse(text); } catch { return {}; }
  });
}

function showRegister() {
  document.getElementById("form-login").style.display = "none";
  document.getElementById("form-register").style.display = "block";
}
function showLogin() {
  document.getElementById("form-register").style.display = "none";
  document.getElementById("form-login").style.display = "block";
}

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

async function register() {
  const username = document.getElementById("reg-username").value.trim();
  const email = document.getElementById("reg-email").value.trim();
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
