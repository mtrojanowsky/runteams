/* RunTeams - etap 2b: kalendarz tygodniowy i kreator treningu.
   Korzysta z db, profile, esc i $ zdefiniowanych w index.html. */
(function () {
const TYPES = { rest: "Odpoczynek", recovery: "Regeneracja", easy: "Rozbieganie", steady: "Średnia intensywność", tempo: "Tempo", intervals: "Interwały", speed: "Szybkość", long: "Długi bieg", race: "Zawody", strength: "Siła", other: "Inne" };
const STEPS = { warmup: "Rozgrzewka", run: "Bieg", recovery: "Regeneracja", rest: "Odpoczynek", cooldown: "Schłodzenie", other: "Inne" };
const pad = n => String(n).padStart(2, "0");
const iso = d => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const monOf = d => addDays(d, -((d.getDay() + 6) % 7));
const fd = d => d.toLocaleDateString("pl-PL", { day: "numeric", month: "long" });
const wd = d => { const s = d.toLocaleDateString("pl-PL", { weekday: "long" }); return s.charAt(0).toUpperCase() + s.slice(1); };
const opts = (o, sel) => Object.keys(o).map(k => `<option value="${k}"${k === sel ? " selected" : ""}>${o[k]}</option>`).join("");
const pc = x => { x = Math.round(x); return Math.floor(x / 60) + ":" + pad(x % 60); };
const parsePace = t => { const m = /^(\d{1,2}):([0-5]\d)$/.exec(String(t).trim()); return m ? +m[1] * 60 + +m[2] : null; };

let ath = null, mon = monOf(new Date()), ro = true, host = null, adding = null, items = [], wf = {};

document.head.insertAdjacentHTML("beforeend", "<style>" +
".cal .wkbar{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px;margin:12px 0 4px}" +
".cal .day{border-top:1px solid var(--line);padding:12px 0}" +
".cal .day h4{margin:0 0 6px;font-family:var(--display);font-size:19px}" +
".cal .day.today h4{border-left:6px solid var(--lane);padding-left:8px}" +
".cal .wo{background:var(--track);border:1px solid var(--line);border-radius:4px;padding:10px 12px;margin:6px 0}" +
".cal .wo .t{font-weight:700}.cal .wo ul{margin:6px 0 0;padding-left:18px}.cal .wo .btn{margin-top:8px}" +
".cal .tag{font-size:13px;background:var(--lane);color:#161c24;padding:1px 8px;border-radius:3px;margin-left:8px;font-weight:600}" +
".cal select,.cal input[type=text]{font:inherit;color:var(--ink);background:var(--track);border:1px solid var(--line);border-radius:4px;padding:8px}" +
".cal select:focus-visible{outline:3px solid var(--lane);outline-offset:2px}" +
".cal .sr{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:6px 0}.cal .sr input[type=text]{width:92px}" +
".cal .rep{border-left:4px solid var(--lane);padding-left:10px;margin:10px 0}" +
".cal .form{background:var(--paper);border:1px solid var(--line);border-radius:6px;padding:12px;margin:8px 0}" +
".cal .day>.btn{margin-top:8px}" +
"</style>");

/* ---------- Formatowanie ---------- */
function dur(s) {
  const v = +s.duration_value;
  if (s.duration_type === "distance") return v >= 1000 ? String(v / 1000).replace(".", ",") + " km" : v + " m";
  if (s.duration_type === "time") { const m = Math.floor(v / 60), r = Math.round(v % 60); return r ? m + ":" + pad(r) + " min" : m + " min"; }
  return "otwarty";
}
function tg(s) {
  if (s.target_type === "none") return "";
  const a = +s.target_min, b = +s.target_max, f = s.target_type === "pace" ? pc : x => x;
  return " @ " + (a === b ? f(a) : f(a) + "–" + f(b)) + (s.target_type === "pace" ? " /km" : " bpm");
}
const stepTxt = s => esc(STEPS[s.step_type] + " " + dur(s) + tg(s));

function woHtml(w) {
  const all = (w.workout_steps || []).slice().sort((a, b) => a.position - b.position);
  const li = s => s.step_type === "repeat"
    ? `<li>${s.repeat_count}× (${all.filter(c => c.parent_id === s.id).map(stepTxt).join(" + ")})</li>`
    : `<li>${stepTxt(s)}</li>`;
  const top = all.filter(s => !s.parent_id);
  return `<div class="wo"><div><span class="t">${esc(w.title)}</span><span class="tag">${esc(TYPES[w.day_type])}</span></div>` +
    (w.notes ? `<div class="muted">${esc(w.notes)}</div>` : "") +
    (top.length ? `<ul>${top.map(li).join("")}</ul>` : "") +
    (ro ? "" : `<button class="btn ghost" data-del="${esc(w.id)}">Usuń trening</button>`) + `</div>`;
}

/* ---------- Widok tygodnia ---------- */
function shell() {
  host.innerHTML = `<div class="card cal"><h2>${ro ? "Mój tydzień" : "Kalendarz zawodnika"}</h2>` +
    (ro ? "" : `<label for="athSel">Zawodnik</label><select id="athSel"></select>`) +
    `<div class="wkbar"><button class="btn ghost" data-act="prev">Poprzedni tydzień</button><b id="calRange"></b>` +
    `<button class="btn ghost" data-act="today">Ten tydzień</button><button class="btn ghost" data-act="next">Następny tydzień</button></div>` +
    `<div id="calBody"></div></div>`;
}
async function load() {
  const box = $("calBody");
  if (!ath) { box.innerHTML = '<p class="muted">Gdy pierwszy zawodnik dołączy do Twojej grupy, pojawi się tutaj.</p>'; return; }
  const { data, error } = await db.from("workouts")
    .select("id, workout_date, title, day_type, notes, workout_steps(*)")
    .eq("athlete_id", ath).gte("workout_date", iso(mon)).lte("workout_date", iso(addDays(mon, 6))).order("created_at");
  if (error) { box.innerHTML = '<p class="muted">Nie udało się wczytać kalendarza. Odśwież stronę.</p>'; return; }
  $("calRange").textContent = fd(mon) + " – " + fd(addDays(mon, 6));
  const today = iso(new Date());
  box.innerHTML = [0, 1, 2, 3, 4, 5, 6].map(n => {
    const d = addDays(mon, n), k = iso(d), ws = data.filter(w => w.workout_date === k);
    return `<div class="day${k === today ? " today" : ""}" data-d="${k}"><h4>${wd(d)}, ${fd(d)}</h4>` +
      (ws.length ? ws.map(woHtml).join("") : '<div class="muted">Brak zaplanowanego treningu</div>') +
      (ro ? "" : `<button class="btn ghost" data-add="${k}">Dodaj trening</button>`) + `<div class="slot"></div></div>`;
  }).join("");
}

/* ---------- Kreator treningu ---------- */
const ns = () => ({ type: "run", dtype: "distance", dval: "", ttype: "none", tmin: "", tmax: "" });
function rowHtml(s, i, j) {
  const a = `data-i="${i}"` + (j !== undefined ? ` data-j="${j}"` : "");
  const tp = s.ttype === "pace";
  return `<div class="sr"><select ${a} data-f="type" aria-label="Rodzaj kroku">${opts(STEPS, s.type)}</select>` +
    `<select ${a} data-f="dtype" aria-label="Jednostka długości">${opts({ distance: "km", time: "min", open: "otwarty" }, s.dtype)}</select>` +
    (s.dtype === "open" ? "" : `<input type="text" inputmode="decimal" ${a} data-f="dval" value="${esc(s.dval)}" placeholder="${s.dtype === "time" ? "minuty" : "km"}" aria-label="Długość">`) +
    `<select ${a} data-f="ttype" aria-label="Cel">${opts({ none: "bez celu", pace: "tempo", hr: "tętno" }, s.ttype)}</select>` +
    (s.ttype === "none" ? "" : `<input type="text" ${a} data-f="tmin" value="${esc(s.tmin)}" placeholder="${tp ? "od m:ss" : "od bpm"}" aria-label="Cel od">` +
      `<input type="text" ${a} data-f="tmax" value="${esc(s.tmax)}" placeholder="${tp ? "do m:ss" : "do bpm"}" aria-label="Cel do">`) +
    `<button class="btn ghost" ${a} data-act="rm">Usuń</button></div>`;
}
const repHtml = (r, i) => `<div class="rep"><div class="sr"><b>Powtórz</b><input type="text" inputmode="numeric" data-i="${i}" data-f="count" value="${esc(r.count)}" style="width:56px" aria-label="Liczba powtórzeń"><span>razy</span>` +
  `<button class="btn ghost" data-i="${i}" data-act="rm">Usuń serię</button></div>` +
  r.steps.map((s, j) => rowHtml(s, i, j)).join("") +
  `<button class="btn ghost" data-i="${i}" data-act="achild">+ Krok w serii</button></div>`;
const renderSteps = () => { $("steps").innerHTML = items.map((it, i) => it.repeat ? repHtml(it, i) : rowHtml(it, i)).join(""); };

function openForm(k) {
  host.querySelectorAll(".slot").forEach(s => s.innerHTML = "");
  adding = k; items = [ns()]; wf = { title: "", day_type: "easy", notes: "" };
  host.querySelector(`[data-d="${k}"] .slot`).innerHTML = `<div class="form"><div class="sr">` +
    `<input type="text" data-w="title" placeholder="Nazwa treningu" style="flex:1;min-width:160px" aria-label="Nazwa treningu">` +
    `<select data-w="day_type" aria-label="Rodzaj dnia">${opts(TYPES, "easy")}</select></div>` +
    `<div class="sr"><input type="text" data-w="notes" placeholder="Notatka dla zawodnika (opcjonalnie)" style="flex:1;width:100%" aria-label="Notatka"></div>` +
    `<div id="steps"></div><div class="sr"><button class="btn ghost" data-act="astep">+ Krok</button><button class="btn ghost" data-act="arep">+ Powtórzenia</button></div>` +
    `<div class="sr"><button class="btn" style="margin:0" data-act="save">Zapisz trening</button><button class="btn ghost" data-act="cancel">Anuluj</button></div>` +
    `<div class="msg" id="wmsg" role="status"></div></div>`;
  renderSteps();
}

async function save() {
  const msg = $("wmsg"), fail = t => { msg.textContent = t; msg.className = "msg err"; };
  const wid = crypto.randomUUID(), rows = []; let err = "";
  const mk = (s, pos, parent) => {
    const r = { id: crypto.randomUUID(), workout_id: wid, parent_id: parent || null, position: pos, step_type: s.type, repeat_count: null,
      duration_type: s.dtype, duration_value: null, target_type: s.ttype, target_min: null, target_max: null };
    if (s.dtype !== "open") {
      const v = parseFloat(String(s.dval).replace(",", "."));
      if (!(v > 0)) { err = "Podaj długość każdego kroku."; return; }
      r.duration_value = s.dtype === "distance" ? Math.round(v * 1000) : Math.round(v * 60);
    }
    if (s.ttype !== "none") {
      const p = x => s.ttype === "pace" ? parsePace(x) : (/^\d{2,3}$/.test(String(x).trim()) ? +x : null);
      const a = p(s.tmin), b = String(s.tmax).trim() === "" ? a : p(s.tmax);
      if (a == null || b == null) { err = s.ttype === "pace" ? "Tempo wpisz jako m:ss, np. 4:10." : "Tętno wpisz jako liczbę, np. 150."; return; }
      r.target_min = Math.min(a, b); r.target_max = Math.max(a, b);
    }
    rows.push(r); return r;
  };
  items.forEach((it, i) => {
    if (err) return;
    if (!it.repeat) return void mk(it, i);
    const c = parseInt(it.count, 10);
    if (!(c >= 1 && c <= 99)) { err = "Liczba powtórzeń musi być od 1 do 99."; return; }
    if (!it.steps.length) { err = "Dodaj kroki do serii powtórzeń."; return; }
    const r = { id: crypto.randomUUID(), workout_id: wid, parent_id: null, position: i, step_type: "repeat", repeat_count: c,
      duration_type: "open", duration_value: null, target_type: "none", target_min: null, target_max: null };
    rows.push(r);
    it.steps.forEach((s, j) => { if (!err) mk(s, j, r.id); });
  });
  if (err) return fail(err);
  const title = (wf.title || "").trim() || TYPES[wf.day_type];
  const w = await db.from("workouts").insert({ id: wid, athlete_id: ath, coach_id: profile.id, workout_date: adding, title, day_type: wf.day_type, notes: wf.notes || "" });
  if (w.error) return fail("Nie udało się zapisać treningu: " + w.error.message);
  if (rows.length) {
    const s = await db.from("workout_steps").insert(rows);
    if (s.error) { await db.from("workouts").delete().eq("id", wid); return fail("Nie udało się zapisać kroków: " + s.error.message); }
  }
  adding = null; load();
}

/* ---------- Zdarzenia ---------- */
function onInput(e) {
  const t = e.target;
  if (t.id === "athSel") { ath = t.value; adding = null; return load(); }
  if (t.dataset.w) { wf[t.dataset.w] = t.value; return; }
  const f = t.dataset.f; if (!f) return;
  const it = items[+t.dataset.i], o = t.dataset.j !== undefined ? it.steps[+t.dataset.j] : it;
  o[f] = t.value;
  if (t.tagName === "SELECT" && f !== "type") renderSteps();
}
async function onClick(e) {
  const b = e.target.closest("button"); if (!b) return;
  if (b.dataset.add) return openForm(b.dataset.add);
  if (b.dataset.del) {
    if (!confirm("Usunąć ten trening?")) return;
    await db.from("workouts").delete().eq("id", b.dataset.del); return load();
  }
  const act = b.dataset.act; if (!act) return;
  const i = b.dataset.i, j = b.dataset.j;
  if (act === "prev") { mon = addDays(mon, -7); return load(); }
  if (act === "next") { mon = addDays(mon, 7); return load(); }
  if (act === "today") { mon = monOf(new Date()); return load(); }
  if (act === "cancel") { adding = null; return load(); }
  if (act === "save") return save();
  if (act === "astep") items.push(ns());
  else if (act === "arep") items.push({ repeat: true, count: "4", steps: [ns(), ns()] });
  else if (act === "achild") items[+i].steps.push(ns());
  else if (act === "rm") { if (j !== undefined) items[+i].steps.splice(+j, 1); else items.splice(+i, 1); }
  renderSteps();
}

/* ---------- Start ---------- */
window.initCalendar = async function () {
  if (!profile) return;
  ro = profile.role !== "coach"; host = $(ro ? "athCal" : "coachCal"); mon = monOf(new Date()); adding = null;
  if (!host.dataset.ready) { host.dataset.ready = "1"; host.addEventListener("click", onClick); host.addEventListener("input", onInput); }
  shell();
  if (ro) { ath = profile.id; return load(); }
  ath = null;
  const { data } = await db.from("group_members").select("user_id, profiles(full_name), groups(name)");
  const seen = new Map();
  (data || []).forEach(m => { if (!seen.has(m.user_id)) seen.set(m.user_id, (m.profiles ? m.profiles.full_name : "Zawodnik") + (m.groups ? " (" + m.groups.name + ")" : "")); });
  $("athSel").innerHTML = [...seen].map(([id, label]) => `<option value="${esc(id)}">${esc(label)}</option>`).join("");
  ath = seen.size ? [...seen.keys()][0] : null;
  load();
};
})();
