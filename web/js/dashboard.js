/* ===== apiFetch (unchanged) ===== */
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
    try { msg = isJSON ? (await res.json()).message || msg : (await res.text()) || msg; } catch {}
    throw new Error(msg);
  }
  return isJSON ? res.json() : res.text();
}

/* ===== globals ===== */
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

/* ===== helpers ===== */
// normalize any array (ObjectId/string/mixed) into array of strings
function toStrArr(arr) {
  return Array.isArray(arr) ? arr.map(x => String(x)) : [];
}

/* ======== minimal additions for MyBookings buttons ======== */
function normId(x) {
  return x == null ? "" : String(x);
}
function pickUidLike(obj) {
  // 兼容多种 owner/uid 字段命名
  return normId(
    (obj && (obj.uid ?? obj.id ?? obj._id ?? obj.userId ?? obj.ownerId ?? obj.createdBy)) ?? ""
  );
}
function tryExtractUidFromToken() {
  const t = localStorage.getItem("token");
  if (!t || t.split(".").length !== 3) return "";
  try {
    const payload = JSON.parse(atob(t.split(".")[1]));
    // token 里也做同样字段挑选
    return pickUidLike(payload);
  } catch {
    return "";
  }
}
/* ======== end minimal additions ======== */

/* ===== room map for capacity lookup ===== */
let ROOMS_MAP = {};
function getCapacity(roomId) {
  const r = ROOMS_MAP[roomId];
  return r && typeof r.capacity === "number" ? r.capacity : 9999; // 保持你原来的默认值
}

/* ===== Renderers ===== */
function renderRooms(rooms = []) {
  // build map for capacity lookup
  ROOMS_MAP = {};
  if (Array.isArray(rooms)) {
    for (const r of rooms) {
      if (!r) continue;
      const id = (r.id || r._id || "").toString();
      if (id) ROOMS_MAP[id] = r;
    }
  }

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

/* === My Bookings: ONLY Delete(owner) / Leave; NO Join === */
function renderBookings(list = []) {
  if (!Array.isArray(list) || list.length === 0) {
    elSlots.innerHTML = `<div class="slot-item">You have no bookings.</div>`;
    return;
  }

  const my = normId(localStorage.getItem("uid") || "");
  elSlots.innerHTML = list.map(b => {
    const parts = toStrArr(b.participants).map(normId);
    const count = typeof b.participantCount === "number" ? b.participantCount : parts.length;
    const joined = !!(my && parts.includes(my));
    const isOwner = !!(my && pickUidLike(b) === my);
    const cap = getCapacity(normId(b.roomId));

    // My Bookings page: no Join
    let actionBtn = "";
    if (isOwner) {
      actionBtn = `<button type="button" data-act="cancel">Delete (owner)</button>`;
    } else if (joined) {
      actionBtn = `<button type="button" data-act="leave">Leave</button>`;
    } // else: no button

    return `
      <div class="slot-item" data-id="${escapeHtml(String(b.id || b._id || ""))}">
        <div><strong>${escapeHtml(b.roomName || "Room")}</strong></div>
        <div>ID: <code>${escapeHtml(String(b.id || b._id || ""))}</code></div>
        <div>${escapeHtml(b.date)} · ${escapeHtml(b.start)} - ${escapeHtml(b.end)}</div>
        <div>Status: ${escapeHtml(b.status || "confirmed")}</div>
        <div>Participants: ${count}${Number.isFinite(cap) ? ` / ${cap}` : ""}</div>
        ${b.notes ? `<div>Notes: ${escapeHtml(b.notes)}</div>` : ""}
        <div style="margin-top:8px; display:flex; gap:8px; flex-wrap: wrap;">
          ${actionBtn}
          <button type="button" data-act="copy-id">Copy ID</button>
        </div>
      </div>
    `;
  }).join("");

  // Owner delete
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

  // Copy ID
  elSlots.querySelectorAll('button[data-act="copy-id"]').forEach(btn => {
    btn.addEventListener("click", async (e) => {
      const id = e.currentTarget.closest(".slot-item")?.dataset.id;
      try { await navigator.clipboard.writeText(String(id || "")); alert("Copied: " + id); }
      catch { alert("Copy failed"); }
    });
  });

  // Leave (only rendered for joined && !owner)
  elSlots.querySelectorAll('button[data-act="leave"]').forEach(btn => {
    btn.addEventListener("click", async (e) => {
      const id = e.currentTarget.closest(".slot-item")?.dataset.id;
      if (!id) return;
      try {
        await apiFetch(`/api/bookings/${encodeURIComponent(id)}/leave`, "POST");
        await loadMyBookings();
      } catch (err) {
        alert("Leave failed: " + err.message);
      }
    });
  });
}

/* === Search view: Join / Leave / Delete(owner) === */
function renderSearchedBooking(b) {
  if (!b) {
    elSearchRes.innerHTML = `<div class="muted">No result.</div>`;
    return;
  }
  const my = String(localStorage.getItem("uid") || "");
  const parts = toStrArr(b.participants);
  const count = typeof b.participantCount === "number" ? b.participantCount : parts.length;
  const joined = my && parts.includes(my);
  const isOwner = my && String(b.uid || "") === my;
  const cap = getCapacity(b.roomId);
  const canJoin = !isOwner && !joined && count < cap;

  const actionBtn = isOwner
    ? `<button type="button" data-act="cancel">Delete (owner)</button>`
    : (joined
        ? `<button type="button" data-act="leave">Leave</button>`
        : `<button type="button" data-act="join" ${canJoin ? "" : "disabled"}>Join</button>`);

  elSearchRes.innerHTML = `
    <div class="slot-item" data-id="${escapeHtml(String(b.id))}">
      <div><strong>${escapeHtml(b.roomName || "Room")}</strong></div>
      <div>ID: <code>${escapeHtml(String(b.id))}</code></div>
      <div>${escapeHtml(b.date)} · ${escapeHtml(b.start)} - ${escapeHtml(b.end)}</div>
      <div>Status: ${escapeHtml(b.status || "confirmed")}</div>
      <div>Participants: ${count}${Number.isFinite(cap) ? ` / ${cap}` : ""}</div>
      ${b.notes ? `<div>Notes: ${escapeHtml(b.notes)}</div>` : ""}
      <div style="margin-top:8px; display:flex; gap:8px; flex-wrap:wrap;">
        ${actionBtn}
        <button type="button" data-act="copy-id">Copy ID</button>
      </div>
    </div>
  `;

  const wrap = elSearchRes.querySelector(".slot-item");
  const id = wrap?.dataset.id;

  // Owner delete
  wrap?.querySelector('button[data-act="cancel"]')?.addEventListener("click", async () => {
    if (!id) return;
    if (!confirm("Delete this booking? (Owner only)")) return;
    try {
      await apiFetch(`/api/bookings/${encodeURIComponent(id)}`, "DELETE");
      await searchById();
      await loadMyBookings();
    } catch (err) {
      alert("Delete failed: " + err.message);
    }
  });

  // Join (only allowed on search view)
  wrap?.querySelector('button[data-act="join"]')?.addEventListener("click", async () => {
    if (!id) return;
    try {
      await apiFetch(`/api/bookings/${encodeURIComponent(id)}/join`, "POST");
      await searchById();
      await loadMyBookings();
    } catch (e) {
      alert("Join failed: " + e.message);
    }
  });

  // Leave
  wrap?.querySelector('button[data-act="leave"]')?.addEventListener("click", async () => {
    if (!id) return;
    try {
      await apiFetch(`/api/bookings/${encodeURIComponent(id)}/leave`, "POST");
      await searchById();
      await loadMyBookings();
    } catch (e) {
      alert("Leave failed: " + e.message);
    }
  });

  // Copy ID
  wrap?.querySelector('button[data-act="copy-id"]')?.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(String(id || "")); alert("Copied: " + id); }
    catch { alert("Copy failed"); }
  });
}

/* ===== API calls ===== */
async function loadMe() {
  try {
    const me = await apiFetch("/api/auth/me");
    const name = me?.username || me?.name || "User";
    const uid = pickUidLike(me) || pickUidLike(me?.user) || tryExtractUidFromToken();
    if (uid) localStorage.setItem("uid", uid);
    elUserName.textContent = name;
  } catch (err) {
    // 后端没有 /auth/me 也能依赖 token 解析出来的 uid
    const uid = tryExtractUidFromToken();
    if (uid) {
      localStorage.setItem("uid", uid);
      elUserName.textContent = "User";
    } else {
      elUserName.textContent = "Unknown";
    }
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

/* ===== Form / Events ===== */
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

/* ===== Boot ===== */
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

  await loadMe(); // verify token and cache uid (string)
  await Promise.allSettled([loadRooms(), loadMyBookings()]);
});
