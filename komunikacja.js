/* RunTeams - etap 6: prywatny czat trener-zawodnik i tablica grupy.
   Korzysta z db, profile, esc i $ zdefiniowanych w index.html. */
(function () {
const T = t => new Date(t).toLocaleString("pl-PL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
let isCoach = false, chatH = null, boardH = null, peer = null, gid = null, sig = "", timer = null;

document.head.insertAdjacentHTML("beforeend", "<style>" +
".cal .thread{max-height:55vh;overflow:auto;padding:4px 2px;margin:10px 0}" +
".cal .bub{max-width:82%;padding:8px 12px;border-radius:10px;margin:6px 0;white-space:pre-wrap;word-break:break-word}" +
".cal .bub.me{margin-left:auto;background:var(--lane);color:#161c24}.cal .bub.th{background:var(--track);border:1px solid var(--line)}" +
".cal .bub small{display:block;font-size:11px;opacity:.7;margin-top:2px}" +
".cal .post .body{white-space:pre-wrap;margin-top:8px}.cal .cmt{border-top:1px solid var(--line);padding:8px 0}.cal .cmt div{white-space:pre-wrap}" +
"</style>");

/* ---------- Prywatny czat ---------- */
async function initChat() {
  chatH.innerHTML = `<div class="card"><h2>Wiadomości</h2><label for="peerSel">${isCoach ? "Zawodnik" : "Trener"}</label><select id="peerSel"></select>` +
    `<div id="thread" class="thread" aria-live="polite"></div>` +
    `<form id="msgForm" class="inline" novalidate><div><label for="msgIn">Wiadomość</label><textarea id="msgIn" name="m" rows="2" maxlength="2000" style="min-height:56px"></textarea></div><button class="btn" type="submit">Wyślij</button></form>` +
    `<div class="msg" id="msgErr" role="status"></div></div>`;
  const peers = new Map();
  if (isCoach) {
    const { data } = await db.from("group_members").select("user_id, profiles(full_name)");
    (data || []).forEach(m => { if (!peers.has(m.user_id)) peers.set(m.user_id, m.profiles ? m.profiles.full_name : "Zawodnik"); });
  } else {
    const { data } = await db.from("group_members").select("groups(coach_id, profiles!coach_id(full_name))");
    (data || []).forEach(m => { const g = m.groups; if (g && !peers.has(g.coach_id)) peers.set(g.coach_id, g.profiles ? g.profiles.full_name : "Trener"); });
  }
  $("peerSel").innerHTML = [...peers].map(([id, n]) => `<option value="${esc(id)}">${esc(n)}</option>`).join("");
  peer = peers.size ? [...peers.keys()][0] : null; sig = "";
  if (!peer) $("thread").innerHTML = `<p class="muted">${isCoach ? "Gdy pierwszy zawodnik dołączy do Twojej grupy, będziesz mógł do niego napisać." : "Gdy dołączysz do grupy, możesz tu pisać do swojego trenera."}</p>`;
  loadThread();
  if (!timer) timer = setInterval(() => { if (chatH && chatH.offsetParent && !document.hidden) loadThread(); }, 6000);
}
async function loadThread() {
  if (!peer || !profile) return;
  const { data, error } = await db.from("messages").select("id, sender_id, body, created_at")
    .eq(isCoach ? "athlete_id" : "coach_id", peer).eq(isCoach ? "coach_id" : "athlete_id", profile.id)
    .order("created_at", { ascending: true }).limit(200);
  const th = $("thread"); if (!th) return;
  if (error) { th.innerHTML = '<p class="muted">Nie udało się wczytać wiadomości.</p>'; return; }
  const s = data.length + ":" + (data.length ? data[data.length - 1].id : "");
  if (s === sig) return;
  sig = s;
  th.innerHTML = data.length ? data.map(m => `<div class="bub ${m.sender_id === profile.id ? "me" : "th"}">${esc(m.body)}<small>${esc(T(m.created_at))}</small></div>`).join("")
    : '<p class="muted">Brak wiadomości. Napisz pierwszą.</p>';
  th.scrollTop = th.scrollHeight;
}
async function sendMsg(f) {
  const body = f.elements.m.value.trim(), err = $("msgErr"); if (!body || !peer) return;
  const { error } = await db.from("messages").insert({ sender_id: profile.id, body, coach_id: isCoach ? profile.id : peer, athlete_id: isCoach ? peer : profile.id });
  err.className = "msg err"; err.textContent = error ? "Nie udało się wysłać wiadomości." : "";
  if (!error) { f.elements.m.value = ""; sig = ""; loadThread(); }
}

/* ---------- Tablica grupy ---------- */
async function initBoard() {
  boardH.innerHTML = `<div class="card"><h2>Tablica grupy</h2><div class="inline"><div><label for="grpSel">Grupa</label><select id="grpSel"></select></div><button class="btn ghost" data-act="refresh" style="margin:0">Odśwież</button></div>` +
    (isCoach ? `<form id="postForm" novalidate><label for="postIn">Nowy post</label><textarea id="postIn" name="p" maxlength="4000" style="min-height:90px"></textarea><button class="btn" type="submit">Opublikuj</button><div class="msg" id="postErr" role="status"></div></form>` : "") +
    `</div><div id="posts"></div>`;
  const { data } = await db.from("groups").select("id, name").order("created_at");
  $("grpSel").innerHTML = (data || []).map(g => `<option value="${esc(g.id)}">${esc(g.name)}</option>`).join("");
  gid = data && data.length ? data[0].id : null;
  loadPosts();
}
async function loadPosts() {
  const box = $("posts"); if (!box) return;
  if (!gid) { box.innerHTML = `<div class="card muted">${isCoach ? "Utwórz grupę w zakładce Grupy, żeby publikować posty." : "Gdy dołączysz do grupy, zobaczysz tu ogłoszenia trenera."}</div>`; return; }
  const { data, error } = await db.from("posts").select("id, body, author_name, created_at, post_comments(id, body, author_id, author_name, created_at)")
    .eq("group_id", gid).order("created_at", { ascending: false }).limit(30);
  if (error) { box.innerHTML = '<div class="card muted">Nie udało się wczytać tablicy. Odśwież stronę.</div>'; return; }
  if (!data.length) { box.innerHTML = '<div class="card muted">Nie ma jeszcze żadnych postów.</div>'; return; }
  box.innerHTML = data.map(p => {
    const cs = p.post_comments.slice().sort((a, b) => a.created_at < b.created_at ? -1 : 1);
    return `<div class="card post" data-p="${esc(p.id)}"><div class="grp-h"><div><b>${esc(p.author_name)}</b> <span class="muted">${esc(T(p.created_at))}</span></div>` +
      (isCoach ? `<button class="btn ghost" data-delpost="${esc(p.id)}">Usuń post</button>` : "") + `</div><div class="body">${esc(p.body)}</div>` +
      `<h3 style="font-size:16px;margin:14px 0 2px">Komentarze (${cs.length})</h3>` +
      cs.map(c => `<div class="cmt"><b>${esc(c.author_name)}</b> <span class="muted">${esc(T(c.created_at))}</span>` +
        (c.author_id === profile.id || isCoach ? ` <button class="btn ghost" data-delc="${esc(c.id)}" style="padding:2px 8px;font-size:12px">Usuń</button>` : "") + `<div>${esc(c.body)}</div></div>`).join("") +
      `<form data-cf="${esc(p.id)}" class="inline" novalidate><div><input type="text" name="c" maxlength="1000" placeholder="Napisz komentarz" aria-label="Komentarz"></div><button class="btn" type="submit">Dodaj</button></form></div>`;
  }).join("");
}
async function boardClick(e) {
  const b = e.target.closest("button"); if (!b) return;
  if (b.dataset.act === "refresh") return loadPosts();
  if (b.dataset.delpost) { if (!confirm("Usunąć ten post wraz z komentarzami?")) return; await db.from("posts").delete().eq("id", b.dataset.delpost); return loadPosts(); }
  if (b.dataset.delc) { if (!confirm("Usunąć ten komentarz?")) return; await db.from("post_comments").delete().eq("id", b.dataset.delc); return loadPosts(); }
}
async function boardSubmit(e) {
  e.preventDefault(); const f = e.target;
  if (f.id === "postForm") {
    const body = f.elements.p.value.trim(), msg = $("postErr"); if (!body || !gid) return;
    const { error } = await db.from("posts").insert({ group_id: gid, author_id: profile.id, body });
    msg.className = "msg err"; msg.textContent = error ? "Nie udało się opublikować posta." : "";
    if (!error) { f.elements.p.value = ""; loadPosts(); }
  } else if (f.dataset.cf) {
    const body = f.elements.c.value.trim(); if (!body) return;
    const { error } = await db.from("post_comments").insert({ post_id: f.dataset.cf, author_id: profile.id, body });
    if (!error) loadPosts();
  }
}

/* ---------- Start ---------- */
window.initComms = function () {
  if (!profile) return;
  isCoach = profile.role === "coach";
  chatH = $(isCoach ? "chatHostC" : "chatHostA"); boardH = $(isCoach ? "boardHostC" : "boardHostA");
  if (!chatH || !boardH) return;
  if (!chatH.dataset.ready) {
    chatH.dataset.ready = "1";
    chatH.addEventListener("submit", e => { e.preventDefault(); sendMsg(e.target); });
    chatH.addEventListener("input", e => { if (e.target.id === "peerSel") { peer = e.target.value; sig = ""; loadThread(); } });
    chatH.addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey && e.target.id === "msgIn") { e.preventDefault(); $("msgForm").requestSubmit(); } });
  }
  if (!boardH.dataset.ready) {
    boardH.dataset.ready = "1";
    boardH.addEventListener("click", boardClick); boardH.addEventListener("submit", boardSubmit);
    boardH.addEventListener("input", e => { if (e.target.id === "grpSel") { gid = e.target.value; loadPosts(); } });
  }
  initChat(); initBoard();
};
})();
