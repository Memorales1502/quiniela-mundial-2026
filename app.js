import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  getDocs,
  collection,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

import { firebaseConfig, ADMIN_EMAILS } from "./firebase-config.js";
import { MATCHES } from "./matches.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let currentUser = null;
let results = {};

const $ = (id) => document.getElementById(id);

const getKickoffDate = (match) => {
  return new Date(`${match.date}T${match.time || "00:00"}:00-06:00`);
};

const outcome = (home, away) => {
  if (home === away) return "DRAW";
  return home > away ? "HOME" : "AWAY";
};

const isStarted = (match) => {
  return Date.now() >= getKickoffDate(match).getTime();
};

const hasResult = (matchId) => {
  return results[matchId]?.homeScore !== undefined && results[matchId]?.awayScore !== undefined;
};

const isInvalidPrediction = (prediction) => {
  return !prediction ||
    prediction.invalid === true ||
    prediction.homeScore === null ||
    prediction.awayScore === null ||
    prediction.homeScore === undefined ||
    prediction.awayScore === undefined;
};

const scorePoints = (prediction, result) => {
  if (isInvalidPrediction(prediction)) {
    return { points: 0, exact: false, winner: false, goals: 0 };
  }

  if (!result || result.homeScore === undefined || result.awayScore === undefined) {
    return { points: 0, exact: false, winner: false, goals: 0 };
  }

  const ph = Number(prediction.homeScore);
  const pa = Number(prediction.awayScore);
  const rh = Number(result.homeScore);
  const ra = Number(result.awayScore);

  if (ph === rh && pa === ra) {
    return { points: 5, exact: true, winner: true, goals: 2 };
  }

  let points = 0;
  let goals = 0;
  const winner = outcome(ph, pa) === outcome(rh, ra);

  if (ph === rh) {
    points += 1;
    goals += 1;
  }

  if (pa === ra) {
    points += 1;
    goals += 1;
  }

  if (winner) {
    points += 1;
  }

  return { points, exact: false, winner, goals };
};

const isLockedForInput = (match, prediction) => {
  return Boolean(prediction?.submitted) || hasResult(match.id) || isStarted(match);
};

async function loadResults() {
  results = {};
  const snap = await getDocs(collection(db, "results"));
  snap.forEach((d) => {
    results[d.id] = d.data();
  });
}

async function getPrediction(matchId) {
  if (!currentUser) return null;

  const ref = doc(db, "predictions", `${currentUser.uid}_${matchId}`);
  const snap = await getDoc(ref);

  return snap.exists() ? snap.data() : null;
}

async function savePrediction(match) {
  if (!currentUser) {
    alert("Debes ingresar o registrarte primero.");
    return;
  }

  const existing = await getPrediction(match.id);

  if (isLockedForInput(match, existing)) {
    alert("Este pronóstico ya está bloqueado y no puede modificarse.");
    return;
  }

  const h = $(`ph_${match.id}`).value;
  const a = $(`pa_${match.id}`).value;
  const incomplete = h === "" || a === "";

  const confirmMsg = incomplete
    ? "Este marcador está incompleto. Si lo envías así, será INVÁLIDO y tendrá 0 puntos. ¿Deseas enviarlo?"
    : `Vas a enviar tu pronóstico: ${match.home} ${h}-${a} ${match.away}. Una vez enviado ya no podrá modificarse. ¿Confirmas?`;

  if (!confirm(confirmMsg)) return;

  await setDoc(doc(db, "predictions", `${currentUser.uid}_${match.id}`), {
    uid: currentUser.uid,
    email: currentUser.email,
    matchId: match.id,
    homeScore: incomplete ? null : Number(h),
    awayScore: incomplete ? null : Number(a),
    invalid: incomplete,
    submitted: true,
    locked: true,
    submittedAt: serverTimestamp()
  });

  alert(incomplete ? "Pronóstico enviado como inválido. Puntaje: 0." : "Pronóstico enviado y bloqueado correctamente.");
  await renderAll();
}

async function saveResult(match) {
  if (!ADMIN_EMAILS.includes(currentUser?.email)) {
    alert("No tienes permiso de administrador.");
    return;
  }

  const h = $(`rh_${match.id}`).value;
  const a = $(`ra_${match.id}`).value;

  if (h === "" || a === "") {
    alert("Coloca el resultado final de los 90 minutos.");
    return;
  }

  if (!confirm(`Guardar resultado oficial de 90 minutos: ${match.home} ${h}-${a} ${match.away}?`)) return;

  await setDoc(doc(db, "results", match.id), {
    matchId: match.id,
    homeScore: Number(h),
    awayScore: Number(a),
    updatedAt: serverTimestamp(),
    admin: currentUser.email
  });

  await loadResults();
  await renderAll();
}

function card(match, prediction) {
  const locked = isLockedForInput(match, prediction);
  const result = results[match.id];

  const predictionText = prediction?.submitted
    ? prediction.invalid
      ? '<span class="locked">Pronóstico inválido · 0 pts</span>'
      : `<span class="ok">Enviado: ${prediction.homeScore}-${prediction.awayScore}</span>`
    : '<span class="note">Pendiente de enviar</span>';

  let lockText = '<span class="ok">Abierto</span>';

  if (prediction?.submitted) {
    lockText = '<span class="locked">Bloqueado por envío</span>';
  } else if (hasResult(match.id)) {
    lockText = '<span class="locked">Bloqueado por resultado oficial</span>';
  } else if (isStarted(match)) {
    lockText = '<span class="locked">Bloqueado por inicio del partido</span>';
  }

  return `
    <article class="match-card">
      <div>
        <div class="teams">${match.home} vs ${match.away}</div>
        <div class="meta">${match.date} ${match.time || ""} · Grupo ${match.group} · ${match.venue}</div>
        <div>${predictionText}</div>
      </div>

      <div>
        ${result ? `Resultado 90': <b>${result.homeScore}-${result.awayScore}</b>` : "Resultado pendiente"}
        <br>
        ${lockText}
      </div>

      <div class="score-inputs">
        <input id="ph_${match.id}" type="number" min="0" value="${prediction?.homeScore ?? ""}" ${locked ? "disabled" : ""}>
        -
        <input id="pa_${match.id}" type="number" min="0" value="${prediction?.awayScore ?? ""}" ${locked ? "disabled" : ""}>
        <button data-save="${match.id}" ${locked ? "disabled" : ""}>Enviar pronóstico</button>
      </div>
    </article>
  `;
}

async function renderQuiniela() {
  if (!currentUser) {
    $("matchesList").innerHTML = '<p class="note">Ingresa o regístrate para llenar tu quiniela.</p>';
    return;
  }

  const html = [];

  for (const match of MATCHES) {
    html.push(card(match, await getPrediction(match.id)));
  }

  $("matchesList").innerHTML = html.join("");

  MATCHES.forEach((match) => {
    document.querySelector(`[data-save="${match.id}"]`)?.addEventListener("click", () => savePrediction(match));
  });
}

function renderResults() {
  $("resultsList").innerHTML = MATCHES.map((match) => {
    const result = results[match.id];

    return `
      <article class="match-card">
        <div>
          <div class="teams">${match.home} vs ${match.away}</div>
          <div class="meta">${match.date} ${match.time || ""} · Grupo ${match.group}</div>
        </div>
        <div>${result ? `Final 90': <b>${result.homeScore}-${result.awayScore}</b>` : "Pendiente"}</div>
      </article>
    `;
  }).join("");
}

function renderAdmin() {
  if (!ADMIN_EMAILS.includes(currentUser?.email)) {
    $("adminList").innerHTML = '<p class="note">Ingresa con un correo administrador.</p>';
    return;
  }

  $("adminList").innerHTML = MATCHES.map((match) => `
    <article class="match-card">
      <div>
        <div class="teams">${match.home} vs ${match.away}</div>
        <div class="meta">${match.date} ${match.time || ""} · ${match.venue}</div>
      </div>

      <div class="score-inputs">
        <input id="rh_${match.id}" type="number" min="0" value="${results[match.id]?.homeScore ?? ""}">
        -
        <input id="ra_${match.id}" type="number" min="0" value="${results[match.id]?.awayScore ?? ""}">
        <button data-result="${match.id}">Guardar resultado 90'</button>
      </div>
    </article>
  `).join("");

  MATCHES.forEach((match) => {
    document.querySelector(`[data-result="${match.id}"]`)?.addEventListener("click", () => saveResult(match));
  });
}

async function buildScores(dateFilter = null) {
  const predSnap = await getDocs(collection(db, "predictions"));
  const users = {};

  predSnap.forEach((docSnap) => {
    const prediction = docSnap.data();
    const match = MATCHES.find((item) => item.id === prediction.matchId);

    if (!match) return;
    if (dateFilter && match.date !== dateFilter) return;

    users[prediction.email] ??= {
      email: prediction.email,
      pts: 0,
      exactos: 0,
      ganadores: 0,
      goles: 0
    };

    const score = scorePoints(prediction, results[prediction.matchId]);

    users[prediction.email].pts += score.points;
    if (score.exact) users[prediction.email].exactos += 1;
    if (score.winner) users[prediction.email].ganadores += 1;
    users[prediction.email].goles += score.goals;
  });

  return Object.values(users).sort((a, b) =>
    b.pts - a.pts ||
    b.exactos - a.exactos ||
    b.ganadores - a.ganadores ||
    b.goles - a.goles ||
    a.email.localeCompare(b.email)
  );
}

async function renderRanking() {
  const rows = await buildScores();

  $("rankingTable").innerHTML = `
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Jugador</th>
          <th>Puntos</th>
          <th>Exactos</th>
          <th>Ganadores</th>
          <th>Goles</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map((r, i) => `
          <tr>
            <td>${i + 1}</td>
            <td>${r.email}</td>
            <td>${r.pts}</td>
            <td>${r.exactos}</td>
            <td>${r.ganadores}</td>
            <td>${r.goles}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

async function renderDaily() {
  const date = $("dailyDate").value || new Date().toISOString().slice(0, 10);
  $("dailyDate").value = date;

  const rows = await buildScores(date);

  $("dailyTable").innerHTML = `
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Jugador</th>
          <th>Puntos del día</th>
          <th>Exactos</th>
          <th>Ganadores</th>
          <th>Goles</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map((r, i) => `
          <tr>
            <td>${i + 1}</td>
            <td>${r.email}</td>
            <td>${r.pts}</td>
            <td>${r.exactos}</td>
            <td>${r.ganadores}</td>
            <td>${r.goles}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

async function renderAll() {
  await loadResults();
  await renderQuiniela();
  renderResults();
  renderAdmin();
  await renderRanking();
  await renderDaily();
}

document.querySelectorAll(".tabs button").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tabs button, .tab").forEach((x) => x.classList.remove("active"));
    btn.classList.add("active");
    $(btn.dataset.tab).classList.add("active");
  });
});

$("loginBtn").onclick = async () => {
  const email = $("email").value.trim();
  const password = $("password").value;

  if (!email || !password) {
    alert("Ingresa correo y contraseña.");
    return;
  }

  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (error) {
    try {
      await createUserWithEmailAndPassword(auth, email, password);
    } catch (createError) {
      alert(createError.message);
    }
  }
};

$("logoutBtn").onclick = () => signOut(auth);
$("loadDaily").onclick = renderDaily;

onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  $("userInfo").textContent = user ? `Sesión: ${user.email}` : "Sin sesión";
  await renderAll();
});
