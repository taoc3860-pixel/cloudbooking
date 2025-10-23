// Global apiFetch for login/register pages
(function ensureApiFetch() {
  if (!window.apiFetch) {
    window.apiFetch = async function apiFetch(path, method = "GET", body) {
      const token = localStorage.getItem("token");
      const headers = { "Content-Type": "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await fetch(path, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });

      if (res.status === 401) localStorage.removeItem("token");

      const ct = res.headers.get("content-type") || "";
      const isJSON = ct.includes("application/json");

      if (!res.ok) {
        if (isJSON) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.message || j.error || `HTTP ${res.status}`);
        } else {
          const t = await res.text().catch(() => "");
          throw new Error(t || `HTTP ${res.status}`);
        }
      }

      return isJSON ? res.json() : res.text();
    };
  }
})();

// Switch Form
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
    const data = await window.apiFetch("/api/auth/login", "POST", { username, password });
    if (!data?.token) throw new Error("No token returned by server.");
    localStorage.setItem("token", data.token);
    await Promise.resolve();       // ensure storage flush
    location.replace("dashboard.html");
  } catch (err) {
    alert("Login failed: " + err.message);
  }
}

async function register() {
  const username = document.getElementById("reg-username").value.trim();
  const email    = document.getElementById("reg-email").value.trim();
  const password = document.getElementById("reg-password").value.trim();
  try {
    if (!username || !password) throw new Error("Username and password required.");
    const data = await window.apiFetch("/api/auth/register", "POST", { username, email, password });
    if (data?.token) {
      localStorage.setItem("token", data.token);
      await Promise.resolve();
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
