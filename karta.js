/* RunTeams - etap 5: karta zawodnika.
   Trener edytuje kartę, zawodnik ma podgląd i własne pole uwag.
   Korzysta z db, profile, esc i $ zdefiniowanych w index.html. */
(function () {
const SEC = [
  ["Dane podstawowe", [["height", "Wzrost (cm)", "num"], ["weight", "Waga (kg)", "num"], ["phone", "Telefon"], ["birth", "Data urodzenia", "date"], ["city", "Miejscowość"], ["agecat", "Kategoria wiekowa"], ["email", "E-mail kontaktowy"]]],
  ["Tętno i fizjologia", [["hrmax", "HR max (bpm)", "num"], ["z1", "I zakres tętna (np. 136-159)"], ["z2", "II zakres tętna"], ["z3", "III zakres tętna"], ["vo2", "VO2max (ml/kg/min)", "num"], ["ltpace", "Próg mleczanowy: tempo (np. 4:17)"], ["lthr", "Próg mleczanowy: tętno (bpm)", "num"]]],
  ["Pozostałe dane", [["hill", "Najdłuższy podbieg (m)", "num"], ["park", "Las/park w okolicy", "yn"], ["pre", "Trening przed zawodami", "yn"], ["cross", "Biegi crossowe w ciągu dnia (dni)"]]]
];
const DAYS = ["Pn", "Wt", "Śr", "Cz", "Pt", "So", "Nd"];
let ath = null, host = null, members = new Map();

document.head.insertAdjacentHTML("beforeend", "<style>" +
".cal .kgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:2px 14px}" +
".cal .kgrid select,.cal .kgrid input{width:100%}" +
".cal textarea{width:100%;min-height:90px;font:inherit;color:var(--ink);background:var(--track);border:1px solid var(--line);border-radius:4px;padding:10px}" +
".cal .dchk{display:inline-flex;gap:5px;align-items:center;margin:4px 10px 0 0;font-weight:500}" +
".cal .kv{display:flex;flex-direction:column;padding:8px 0;border-top:1px solid var(--line)}" +
".cal .kvs{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:0 14px}" +
".cal .card h3{margin:20px 0 4px}" +
"</style>");

const fmt = v => /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(+v.slice(0, 4), +v.slice(5, 7) - 1, +v.slice(8, 10)).toLocaleDateString("pl-PL", { day: "numeric", month: "long", year: "numeric" }) : v;
const when = t => t ? new Date(t).toLocaleString("pl-PL", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
const inp = (k, l, t, v) => `<div><label for="k_${k}">${l}</label>` + (t === "yn"
  ? `<select id="k_${k}" data-k="${k}"><option value="">—</option><option${v === "Tak" ? " selected" : ""}>Tak</option><option${v === "Nie" ? " selected" : ""}>Nie</option></select>`
  : `<input type="${t === "date" ? "date" : "text"}" id="k_${k}" data-k="${k}" value="${esc(v)}"${t === "num" ? ' inputmode="decimal"' : ""}>`) + `</div>`;
const pbRow = p => `<div class="sr" data-pb><input type="text" data-p="dist" value="${esc(p.dist)}" placeholder="Dystans (np. 10 km)" style="width:140px" aria-label="Dystans">` +
  `<input type="text" data-p="res" value="${esc(p.res)}" placeholder="Wynik (np. 41:35)" style="width:140px" aria-label="Wynik">` +
  `<input type="text" data-p="year" value="${esc(p.year)}" placeholder="Rok" style="width:90px" aria-label="Rok"><button type="button" class="btn ghost" data-act="rmpb">Usuń</button></div>`;
const kv = (l, v) => v ? `<div class="kv"><span class="muted">${l}</span><b>${esc(fmt(v))}</b></div>` : "";

/* ---------- Trener: formularz ---------- */
function coachHtml(c, m) {
  const d = c.data || {};
  return `<p class="muted">${m && m.joined ? "W grupie od: " + esc(fmt(m.joined.slice(0, 10))) + ". " : ""}Karta zawiera dane o zdrowiu i jest widoczna tylko dla Ciebie i zawodnika.` +
    (c.updated_at ? " Ostatnia zmiana: " + esc(when(c.updated_at)) + "." : "") + `</p><form id="cardForm" novalidate>` +
    SEC.map(([t, fs]) => `<h3>${t}</h3><div class="kgrid">${fs.map(([k, l, ty]) => inp(k, l, ty, d[k] || "")).join("")}</div>`).join("") +
    `<h3>Dni treningowe</h3><div>${DAYS.map((x, i) => `<label class="dchk"><input type="checkbox" data-day="${i}"${(d.days || [])[i] ? " checked" : ""}> ${x}</label>`).join("")}</div>` +
    `<h3>Rekordy życiowe</h3><div id="pbs">${(d.pbs || []).map(pbRow).join("")}</div><button type="button" class="btn ghost" data-act="addpb">+ Dodaj rekord</button>` +
    `<h3>Założenia treningowe</h3><textarea name="plan" aria-label="Założenia treningowe">${esc(d.plan || "")}</textarea>` +
    `<h3>Uwagi trenerskie</h3><textarea name="cn" aria-label="Uwagi trenerskie">${esc(c.coach_notes || "")}</textarea>` +
    `<h3>Uwagi zawodnika</h3><p class="muted">${c.athlete_notes ? esc(c.athlete_notes) : "Zawodnik nie dodał jeszcze uwag."}</p>` +
    `<button class="btn" type="submit">Zapisz kartę</button><div class="msg" role="status"></div></form>`;
}
async function saveCoach(f) {
  const msg = f.querySelector(".msg"), data = {};
  f.querySelectorAll("[data-k]").forEach(e => { if (e.value.trim()) data[e.dataset.k] = e.value.trim(); });
  data.days = [...f.querySelectorAll("[data-day]")].map(e => e.checked);
  data.pbs = [...f.querySelectorAll("[data-pb]")].map(r => ({ dist: r.querySelector("[data-p=dist]").value.trim(), res: r.querySelector("[data-p=res]").value.trim(), year: r.querySelector("[data-p=year]").value.trim() })).filter(p => p.dist || p.res);
  data.plan = f.elements.plan.value.trim();
  const { error } = await db.from("athlete_cards").upsert({ athlete_id: ath, coach_id: profile.id, data, coach_notes: f.elements.cn.value.trim() }, { onConflict: "athlete_id,coach_id" });
  msg.className = "msg " + (error ? "err" : "ok");
  msg.textContent = error ? "Nie udało się zapisać karty: " + error.message : "Karta zapisana.";
}
async function loadCoach() {
  const b = $("cardBody");
  if (!ath) { b.innerHTML = '<p class="muted">Gdy pierwszy zawodnik dołączy do Twojej grupy, pojawi się tutaj.</p>'; return; }
  const { data, error } = await db.from("athlete_cards").select("*").eq("athlete_id", ath).eq("coach_id", profile.id).maybeSingle();
  if (error) { b.innerHTML = '<p class="muted">Nie udało się wczytać karty. Odśwież stronę.</p>'; return; }
  b.innerHTML = coachHtml(data || { data: {}, coach_notes: "", athlete_notes: "" }, members.get(ath));
}

/* ---------- Zawodnik: podgląd ---------- */
function athHtml(c) {
  const d = c.data || {}, tr = c.profiles ? c.profiles.full_name : "";
  const days = (d.days || []).map((on, i) => on ? DAYS[i] : "").filter(Boolean).join(", ");
  return `<div class="card"><h2>Moja karta</h2><p class="muted">${tr ? "Prowadzi: " + esc(tr) + ". " : ""}Dane uzupełnia trener.` + (c.updated_at ? " Ostatnia zmiana: " + esc(when(c.updated_at)) + "." : "") + `</p>` +
    SEC.map(([t, fs]) => { const rows = fs.map(([k, l]) => kv(l, d[k])).join(""); return rows ? `<h3>${t}</h3><div class="kvs">${rows}</div>` : ""; }).join("") +
    (days ? `<h3>Dni treningowe</h3><div class="kvs">${kv("Dni", days)}</div>` : "") +
    ((d.pbs || []).length ? `<h3>Rekordy życiowe</h3>${d.pbs.map(p => `<div class="kv"><span class="muted">${esc(p.dist)}${p.year ? " · " + esc(p.year) : ""}</span><b>${esc(p.res)}</b></div>`).join("")}` : "") +
    (d.plan ? `<h3>Założenia treningowe</h3><p>${esc(d.plan)}</p>` : "") +
    (c.coach_notes ? `<h3>Uwagi trenerskie</h3><p>${esc(c.coach_notes)}</p>` : "") +
    `<form id="notesForm" novalidate><h3>Moje uwagi</h3><textarea name="an" aria-label="Moje uwagi">${esc(c.athlete_notes || "")}</textarea>` +
    `<button class="btn" type="submit">Zapisz uwagi</button><div class="msg" role="status"></div></form></div>`;
}
async function loadAth() {
  const { data, error } = await db.from("athlete_cards").select("*, profiles!coach_id(full_name)").eq("athlete_id", profile.id).limit(1);
  host.innerHTML = error ? '<div class="card muted">Nie udało się wczytać karty. Odśwież stronę.</div>'
    : data.length ? athHtml(data[0]) : '<div class="card"><h2>Moja karta</h2><p class="muted">Trener nie uzupełnił jeszcze Twojej karty.</p></div>';
}
async function saveNotes(f) {
  const msg = f.querySelector(".msg");
  const { error } = await db.from("athlete_cards").update({ athlete_notes: f.elements.an.value.trim() }).eq("athlete_id", profile.id);
  msg.className = "msg " + (error ? "err" : "ok");
  msg.textContent = error ? "Nie udało się zapisać uwag." : "Uwagi zapisane.";
}

/* ---------- Zdarzenia i start ---------- */
function onClick(e) {
  const b = e.target.closest("button"); if (!b) return;
  if (b.dataset.act === "addpb") $("pbs").insertAdjacentHTML("beforeend", pbRow({ dist: "", res: "", year: "" }));
  if (b.dataset.act === "rmpb") b.closest("[data-pb]").remove();
}
function onSubmit(e) {
  e.preventDefault();
  if (e.target.id === "cardForm") saveCoach(e.target);
  if (e.target.id === "notesForm") saveNotes(e.target);
}
window.initCard = async function () {
  if (!profile) return;
  const ro = profile.role !== "coach"; host = $(ro ? "cardHostA" : "cardHostC"); if (!host) return;
  if (!host.dataset.ready) {
    host.dataset.ready = "1"; host.addEventListener("click", onClick); host.addEventListener("submit", onSubmit);
    host.addEventListener("input", e => { if (e.target.id === "cardSel") { ath = e.target.value; loadCoach(); } });
  }
  if (ro) { ath = profile.id; return loadAth(); }
  host.innerHTML = '<div class="card"><h2>Karta zawodnika</h2><label for="cardSel">Zawodnik</label><select id="cardSel"></select><div id="cardBody"></div></div>';
  const { data } = await db.from("group_members").select("user_id, joined_at, profiles(full_name), groups(name)");
  members = new Map();
  (data || []).forEach(m => { if (!members.has(m.user_id)) members.set(m.user_id, { name: (m.profiles ? m.profiles.full_name : "Zawodnik") + (m.groups ? " (" + m.groups.name + ")" : ""), joined: m.joined_at }); });
  $("cardSel").innerHTML = [...members].map(([id, m]) => `<option value="${esc(id)}">${esc(m.name)}</option>`).join("");
  ath = members.size ? [...members.keys()][0] : null;
  loadCoach();
};
})();
