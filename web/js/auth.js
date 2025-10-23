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

      if (res.status === 401) {
        // Not logged in or token expired
        localStorage.removeItem("token");
      }

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        try {
          const j = JSON.parse(text);
          throw new Error(j.message || j.error || `HTTP ${res.status}`);
        } catch {
          throw new Error(text || `HTTP ${res.status}`);
        }
      }

      const ct = res.headers.get("content-type") || "";
      return ct.includes("application/json") ? res.json() : res.text();
    };
  }
})();

//Switch Form
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
    localStorage.setItem("token", data.token);     // ✅ 关键
    alert("Login success!");
    window.location.href = "dashboard.html";
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
      // returned a token: Direct login
      localStorage.setItem("token", data.token);
      alert("Register success! You are logged in.");
      window.location.href = "dashboard.html";
    } else {
      // No token: Go back to login
      alert("Register success! Please login now.");
      showLogin();
    }
  } catch (err) {
    alert("Register failed: " + err.message);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("btn-login").addEventListener("click", (e) => {
    e.preventDefault(); login();
  });
  document.getElementById("btn-register").addEventListener("click", (e) => {
    e.preventDefault(); register();
  });
  document.getElementById("link-register").addEventListener("click", e => {
    e.preventDefault(); showRegister();
  });
  document.getElementById("link-login").addEventListener("click", e => {
    e.preventDefault(); showLogin();
  });
});
