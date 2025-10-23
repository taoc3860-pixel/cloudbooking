async function apiFetch(path, method = "GET", body) {
  const token = localStorage.getItem("token");
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401) {
    localStorage.removeItem("token");
    alert("Please login again.");
    location.replace("./index.html");
    throw new Error("401 Unauthorized");
  }

  const ct = res.headers.get("content-type") || "";
  const isJSON = ct.includes("application/json");
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { msg = isJSON ? (await res.json()).message || msg : await res.text() || msg; } catch {}
    throw new Error(msg);
  }
  return isJSON ? res.json() : res.text();
}

let elUserName, elLogout, elRoomSel, elDate, elStart, elEnd, elNotes, elForm, elFormMsg, elSlots, elRoomsList;
let elSearchId, elBtnSearch, elSearchRes;

const pad2 = (n) => String(n).padStart(2, "0");
function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
function escapeAttr(s) { return escapeHtml(s).replaceAll("\"", "&quot;"); }

function setPlaceholders() {
  elUserName.textContent = "Loading…";
  elRoomsList.textContent = "Loading…";
  elSlots.textContent = "Loading…";
}

/* ---------- Renderers ---------- */
function renderRooms(rooms = []) {
  if (!Array.isArray(rooms) || rooms.length === 0) {
    elRoomsList.innerHTML = `<div class="slot-item">No rooms available.</div>`;
    elRoomSel.innerHTML = `<option value="" disabled selected>No rooms</option>`;
    return;
  }
  elRoomSel.innerHTML = rooms.map(r =>
    `<option value="${escapeAttr(r.id || r._id)}">${escapeHtml(r.name || "Room")}</option>`
  ).join("");

  elRoomsList.innerHTML = rooms.map(r => `
    <div class="slot-item">
      <strong>${escapeHtml(r.name || "Room")}</strong><br/>
      Capacity: ${escapeHtml(String(r.capacity ?? "-"))}<br/>
      Location: ${escapeHtml(r.location || "-")}<br/>
      ${Array.isArray(r.tags) && r.tags.length ? `Tags: ${r.tags.map(escapeHtml).join(", ")}` : ""}
    </div>
  `).join("");
}

function renderBookings(list = []) {
  if (!Array.isArray(list) || list.length === 0) {
    elSlots.innerHTML = `<div class="slot-item">You have no bookings.</div>`;
    return;
  }
  elSlots.innerHTML = list.map(b => `
    <div class="slot-item" data-id="${escapeHtml(String(b.id || ""))}">
      <div><strong>${escapeHtml(b.roomName || "Room")}</strong></div>
      <div>ID: <code>${escapeHtml(String(b.id || ""))}</code></div>
      <div>${escapeHtml(b.date)} · ${escapeHtml(b.start)} - ${escapeHtml(b.end)}</div>
      <div>Status: ${escapeHtml(b.status || "confirmed")}</div>
      ${Array.isArray(b.participants) ? `<div>Participants: ${b.participants.length}</div>` : ""}
      ${b.notes ? `<div>Notes: ${escapeHtml(b.notes)}</div>` : ""}
      <div style="margin-top:8px; display:flex; gap:8px; flex-wrap: wrap;">
        <button type="button" data-act="cancel">Delete (owner)</button>
        <button type="button" data-act="copy-id">Copy ID</button>
      </div>
    </div>
  `).join("");

  elSlots.querySelectorAll('button[data-act="cancel"]').forEach(btn => {
    btn.addEventListener("click", async (e) => {
      const wrap = e.currentTarget.closest(".slot-item");
      const id = wrap?.dataset.id;
      if (!id) return;
      if (!confirm("Delete this booking? (Owner only)")) return;
      try {
        await apiFetch(`/api/bookings/${encodeURIComponent(id)}`, "DELETE");
        await loadMyBookings();
      } catch (err) {
        alert("Delete failed: " + err.message);
      }
    });
  });
  elSlots.querySelectorAll('button[data-act="copy-id"]').forEach(btn => {
    btn.addEventListener("click", async (e) => {
      const id = e.currentTarget.closest(".slot-item")?.dataset.id;
      try { await navigator.clipboard.writeText(String(id || "")); alert("Copied: " + id); }
      catch { alert("Copy failed"); }
    });
  });
}

function renderSearchedBooking(b) {
  if (!b) {
    elSearchRes.innerHTML = `<div class="muted">No result.</div>`;
    return;
  }
  const joined = Array.isArray(b.participants) && b.participants.includes(localStorage.getItem("uid"));
  elSearchRes.innerHTML = `
    <div class="slot-item" data-id="${escapeHtml(String(b.id))}">
      <div><strong>${escapeHtml(b.roomName || "Room")}</strong></div>
      <div>ID: <code>${escapeHtml(String(b.id))}</code></div>
      <div>${escapeHtml(b.date)} · ${escapeHtml(b.start)} - ${escapeHtml(b.end)}</div>
      <div>Status: ${escapeHtml(b.status || "confirmed")}</div>
      ${Array.isArray(b.participants) ? `<div>Participants: ${b.participants.length}</div>` : ""}
      ${b.notes ? `<div>Notes: ${escapeHtml(b.notes)}</div>` : ""}
      <div style="margin-top:8px; display:flex; gap:8px; flex-wrap:wrap;">
        ${joined
          ? `<button type="button" data-act="leave">Leave</button>`
          : `<button type="button" data-act="join">Join</button>`}
      </div>
    </div>
  `;

  const wrap = elSearchRes.querySelector(".slot-item");
  wrap?.querySelector('button[data-act="join"]')?.addEventListener("click", async () => {
    const id = wrap.dataset.id;
    try {
      await apiFetch(`/api/bookings/${encodeURIComponent(id)}/join`, "POST");
      await searchById();
      await loadMyBookings();
    } catch (e) {
      alert("Join failed: " + e.message);
    }
  });

  wrap?.querySelector('button[data-act="leave"]')?.addEventListener("click", async () => {
    const id = wrap.dataset.id;
    try {
      await apiFetch(`/api/bookings/${encodeURIComponent(id)}/leave`, "POST");
      await searchById();
      await loadMyBookings();
    } catch (e) {
      alert("Leave failed: " + e.message);
    }
  });
}

// API calls
async function loadMe() {
  try {
    const me = await apiFetch("/api/auth/me");
    const name = me?.username || me?.name || "User";
    localStorage.setItem("uid", me?.uid || "");
    elUserName.textContent = name;
  } catch (err) {
    elUserName.textContent = "Unknown";
  }
}
async function loadRooms() {
  try {
    const list = await apiFetch("/api/rooms");
    renderRooms(list);
  } catch (err) {
    elRoomsList.innerHTML = `<div class="slot-item">Failed to load rooms: ${escapeHtml(err.message)}</div>`;
  }
}
async function loadMyBookings() {
  try {
    const list = await apiFetch("/api/bookings?mine=1");
    renderBookings(list);
  } catch (err) {
    elSlots.innerHTML = `<div class="slot-item">Failed to load bookings: ${escapeHtml(err.message)}</div>`;
  }
}

async function searchById() {
  const id = (elSearchId.value || "").trim();
  if (!id) {
    renderSearchedBooking(null);
    return;
  }
  try {
    const data = await apiFetch(`/api/bookings/${encodeURIComponent(id)}`);
    renderSearchedBooking(data.booking);
  } catch (e) {
    renderSearchedBooking(null);
    elSearchRes.innerHTML = `<div class="slot-item">Not found: ${escapeHtml(e.message)}</div>`;
  }
}

/* ---------- Form / Events ---------- */
function bindForm() {
  elForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const submitBtn = elForm.querySelector('button[type="submit"], input[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;

    elFormMsg.textContent = "Submitting…";
    try {
      const payload = {
        roomId: elRoomSel.value,
        date: elDate.value,
        start: elStart.value,
        end: elEnd.value,
        notes: elNotes.value.trim() || undefined,
      };
      console.log("[Create] payload:", payload);
      if (!payload.roomId) throw new Error("Please select a room.");
      if (payload.end <= payload.start) throw new Error("End time must be later than start time.");
      await apiFetch("/api/bookings", "POST", payload);
      elFormMsg.textContent = "Created successfully.";
      elForm.reset();
      setDefaultDateTime();
      await loadMyBookings();
    } catch (err) {
      elFormMsg.textContent = "Failed: " + err.message;
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });
}

function bindLogout() {
  localStorage.removeItem("token");
  localStorage.removeItem("uid");
  location.replace("./index.html");
}

function setDefaultDateTime() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = pad2(now.getMonth() + 1);
  const dd = pad2(now.getDate());
  const hh = pad2(now.getHours());
  const m2 = pad2(Math.floor(now.getMinutes() / 15) * 15);
  elDate.value = `${yyyy}-${mm}-${dd}`;
  elStart.value = `${hh}:${m2}`;
  let endH = (parseInt(hh, 10) + 1) % 24;
  elEnd.value = `${pad2(endH)}:${m2}`;
}

// Boot: verify first, then load 
window.addEventListener("DOMContentLoaded", async () => {
  // elements
  elUserName  = document.getElementById("user-name");
  elLogout    = document.getElementById("logout-btn");
  elRoomSel   = document.getElementById("room");
  elDate      = document.getElementById("date");
  elStart     = document.getElementById("start");
  elEnd       = document.getElementById("end");
  elNotes     = document.getElementById("notes");
  elForm      = document.getElementById("form-book");
  elFormMsg   = document.getElementById("form-msg");
  elSlots     = document.getElementById("slot-list");
  elRoomsList = document.getElementById("rooms-list");
  elSearchId  = document.getElementById("search-id");
  elBtnSearch = document.getElementById("btn-search");
  elSearchRes = document.getElementById("search-result");

  setPlaceholders();
  setDefaultDateTime();

  elBtnSearch.addEventListener("click", (e) => { e.preventDefault(); searchById(); });
  elSearchId.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); searchById(); }});
  bindForm();
  elLogout.addEventListener("click", bindLogout);

  if (!localStorage.getItem("token")) return location.replace("./index.html");

  await loadMe(); // verify token first
  await Promise.allSettled([loadRooms(), loadMyBookings()]);
});
