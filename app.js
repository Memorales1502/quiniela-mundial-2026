import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  onAuthStateChanged,
  signOut,
  updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  getDocs,
  collection,
  serverTimestamp,
  query,
  where
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

import { firebaseConfig, ADMIN_EMAILS } from "./firebase-config.js";
import { MATCHES } from "./matches.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let currentUser = null;
let currentPlayerName = "";

let results = {};
let resultsLoaded = false;

let userPredictions = {};
let userPredictionsLoaded = false;

let allPredictionsCache = null;

const $ = (id) => document.getElementById(id);

const getCurrentTabId = () => {
  return document.querySelector(".tab.active")?.id || "reglas";
};

const cleanNameFromEmail = (email) => {
  if (!email) return "";
  return email
    .split("@")[0]
    .replaceAll(".", " ")
    .replaceAll("_", " ")
    .replaceAll("-", " ");
};

const getDisplayName = (user) => {
  if (currentPlayerName) return currentPlayerName;
  if (user?.displayName) return user.displayName;
  return cleanNameFromEmail(user?.email);
};

const getKickoffDate = (match) => {
  return new Date(`${match.date}T${match.time || "00:00"}:00-06:00`);
};

const isStarted = (match) => {
  return Date.now() >= getKickoffDate(match).getTime();
};

const outcome = (home, away) => {
  if (home === away) return "DRAW";
  return home > away ? "HOME" : "AWAY";
};

const hasResult = (matchId) => {
  return results[matchId]?.homeScore !== undefined &&
    results[matchId]?.awayScore !== undefined;
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

async function loadUserProfile(user) {
  if (!user) return "";

  const userRef = doc(db, "users", user.uid);
  const snap = await getDoc(userRef);

  if (snap.exists()) {
    const data = snap.data();
    if (data.name) return data.name;
  }

  if (user.displayName) return user.displayName;

  return cleanNameFromEmail(user.email);
}

async function ensureResultsLoaded(force = false) {
  if (resultsLoaded && !force) return;

  results = {};

  const snap = await getDocs(collection(db, "results"));

  snap.forEach((d) => {
    results[d.id] = d.data();
  });

  resultsLoaded = true;
}

async function loadUserPredictions(force = false) {
  if (!currentUser) return;

  if (userPredictionsLoaded && !force) return;

  userPredictions = {};

  const q = query(
    collection(db, "predictions"),
    where("uid", "==", currentUser.uid)
  );

  const snap = await getDocs(q);

  snap.forEach((d) => {
    const data = d.data();
    userPredictions[data.matchId] = data;
  });

  userPredictionsLoaded = true;
}

async function loadAllPredictions(force = false) {
  if (allPredictionsCache && !force) return allPredictionsCache;

  const snap = await getDocs(collection(db, "predictions"));

  allPredictionsCache = [];

  snap.forEach((d) => {
    allPredictionsCache.push(d.data());
  });

  return allPredictionsCache;
}

function invalidatePredictionsCache() {
  userPredictionsLoaded = false;
  userPredictions = {};
  allPredictionsCache = null;
}

function downloadCSV(rows, filename) {
  const csvContent = rows
    .map((row) =>
      row
        .map((cell) => {
          const value = String(cell ?? "");
          return `"${value.replaceAll('"', '""')}"`;
        })
        .join(",")
    )
    .join("\n");

  const blob = new Blob(["\uFEFF" + csvContent], {
    type: "text/csv;charset=utf-8;"
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
}

async function saveAllPredictions() {
  if (!currentUser) {
    alert("Debes iniciar sesión.");
    return;
  }

  await ensureResultsLoaded();
  await loadUserPredictions();

  const alreadySubmitted = [];
  const blockedByGame = [];
  const toSave = [];

  for (const match of MATCHES) {
    const existing = userPredictions[match.id];

    if (existing?.submitted) {
      alreadySubmitted.push(match);
      continue;
    }

    if (hasResult(match.id) || isStarted(match)) {
      blockedByGame.push(match);
      continue;
    }

    const h = $(`ph_${match.id}`)?.value ?? "";
    const a = $(`pa_${match.id}`)?.value ?? "";
    const incomplete = h === "" || a === "";

    toSave.push({
      match,
      homeScore: incomplete ? null : Number(h),
      awayScore: incomplete ? null : Number(a),
      rawHome: h,
      rawAway: a,
      invalid: incomplete
    });
  }

  if (toSave.length === 0) {
    alert("No hay pronósticos nuevos para enviar.");
    return;
  }

  const invalidCount = toSave.filter((item) => item.invalid).length;

  let message = `Vas a enviar ${toSave.length} pronósticos y quedarán bloqueados definitivamente.\n\n`;

  if (invalidCount > 0) {
    message += `Atención: ${invalidCount} pronóstico(s) están incompletos y se guardarán como INVÁLIDOS con 0 puntos.\n\n`;
  }

  if (blockedByGame.length > 0) {
    message += `${blockedByGame.length} partido(s) ya están bloqueados por inicio o resultado oficial y no se enviarán.\n\n`;
  }

  if (alreadySubmitted.length > 0) {
    message += `${alreadySubmitted.length} partido(s) ya habían sido enviados anteriormente y no se modificarán.\n\n`;
  }

  message += "¿Confirmas el envío?";

  if (!confirm(message)) return;

  const submittedAt = new Date();
  const playerName = getDisplayName(currentUser);

  for (const item of toSave) {
    const data = {
      uid: currentUser.uid,
      email: currentUser.email,
      playerName,
      matchId: item.match.id,
      homeScore: item.homeScore,
      awayScore: item.awayScore,
      invalid: item.invalid,
      submitted: true,
      locked: true,
      submittedAt: serverTimestamp()
    };

    await setDoc(
      doc(db, "predictions", `${currentUser.uid}_${item.match.id}`),
      data
    );

    userPredictions[item.match.id] = data;
  }

  allPredictionsCache = null;

  downloadPredictionsCSV(toSave, submittedAt);

  alert("Pronósticos enviados correctamente. Se descargó tu constancia.");
  await renderActiveTab();
}

function downloadPredictionsCSV(items, submittedAt) {
  const playerName = getDisplayName(currentUser);
  const email = currentUser.email;
  const dateText = submittedAt.toLocaleString("es-GT");

  const rows = [];

  rows.push(["CONSTANCIA DE PRONÓSTICOS - QUINIELA MUNDIALISTA 2026"]);
  rows.push(["Jugador", playerName]);
  rows.push(["Correo", email]);
  rows.push(["Fecha de envío", dateText]);
  rows.push([]);
  rows.push([
    "ID",
    "Fecha Partido",
    "Hora",
    "Grupo",
    "Equipo 1",
    "Pronóstico Equipo 1",
    "Equipo 2",
    "Pronóstico Equipo 2",
    "Sede",
    "Estado"
  ]);

  items.forEach((item) => {
    rows.push([
      item.match.id,
      item.match.date,
      item.match.time || "",
      item.match.group || "",
      item.match.home,
      item.invalid ? "" : item.rawHome,
      item.match.away,
      item.invalid ? "" : item.rawAway,
      item.match.venue || "",
      item.invalid ? "INVÁLIDO - 0 PUNTOS" : "ENVIADO Y BLOQUEADO"
    ]);
  });

  const safeEmail = email.replaceAll("@", "_").replaceAll(".", "_");
  const fileDate = submittedAt.toISOString().slice(0, 10);

  downloadCSV(rows, `constancia_quiniela_${safeEmail}_${fileDate}.csv`);
}

async function downloadPlayerPredictionsCSV(playerKey) {
  if (!ADMIN_EMAILS.includes(currentUser?.email)) {
    alert("No tienes permiso de administrador.");
    return;
  }

  await ensureResultsLoaded();

  const predictions = await loadAllPredictions();

  const rows = [];

  let playerName = "";
  let playerEmail = "";

  rows.push(["PRONÓSTICOS POR JUGADOR - QUINIELA MUNDIALISTA 2026"]);
  rows.push(["Descargado por", currentUser.email]);
  rows.push(["Fecha de descarga", new Date().toLocaleString("es-GT")]);
  rows.push([]);

  rows.push([
    "Jugador",
    "Correo",
    "ID Partido",
    "Fecha",
    "Hora",
    "Grupo",
    "Equipo 1",
    "Pronóstico Equipo 1",
    "Equipo 2",
    "Pronóstico Equipo 2",
    "Sede",
    "Estado",
    "Resultado Oficial",
    "Puntos"
  ]);

  predictions.forEach((prediction) => {
    const key = prediction.email || prediction.uid || "sin-correo";

    if (key !== playerKey) return;

    const match = MATCHES.find((m) => m.id === prediction.matchId);
    if (!match) return;

    const result = results[prediction.matchId];
    const score = scorePoints(prediction, result);

    playerName = prediction.playerName || cleanNameFromEmail(prediction.email);
    playerEmail = prediction.email || "";

    rows.push([
      playerName,
      playerEmail,
      match.id,
      match.date,
      match.time || "",
      match.group || "",
      match.home,
      prediction.invalid ? "" : prediction.homeScore,
      match.away,
      prediction.invalid ? "" : prediction.awayScore,
      match.venue || "",
      prediction.invalid ? "INVÁLIDO - 0 PUNTOS" : "ENVIADO",
      result ? `${result.homeScore}-${result.awayScore}` : "PENDIENTE",
      score.points
    ]);
  });

  if (rows.length <= 5) {
    alert("No se encontraron pronósticos para este jugador.");
    return;
  }

  const safeName = (playerName || playerEmail || "jugador")
    .toLowerCase()
    .replaceAll(" ", "_")
    .replaceAll("@", "_")
    .replaceAll(".", "_")
    .replaceAll("/", "_");

  const today = new Date().toISOString().slice(0, 10);

  downloadCSV(rows, `pronosticos_${safeName}_${today}.csv`);
}

async function buildPlayerDownloadCards() {
  const predictions = await loadAllPredictions();

  const players = {};

  predictions.forEach((prediction) => {
    const key = prediction.email || prediction.uid || "sin-correo";

    if (!players[key]) {
      players[key] = {
        key,
        name: prediction.playerName || cleanNameFromEmail(prediction.email),
        email: prediction.email || "",
        count: 0
      };
    }

    players[key].count += 1;
  });

  const list = Object.values(players).sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  if (list.length === 0) {
    return `
      <div class="rules-text">
        <h3>Descargar pronósticos por jugador</h3>
        <p class="note">Aún no hay pronósticos enviados.</p>
      </div>
    `;
  }

  return `
    <div class="rules-text">
      <h3>Descargar pronósticos por jugador</h3>
      <p class="note">
        Cada botón descarga únicamente los pronósticos enviados por ese jugador.
      </p>

      <div class="match-list">
        ${list.map((player) => `
          <article class="match-card">
            <div>
              <div class="teams">${player.name}</div>
              <div class="meta">${player.email}</div>
              <div class="note">${player.count} pronóstico(s) enviados</div>
            </div>

            <div>
              <span class="ok">Disponible</span>
            </div>

            <div class="score-inputs">
              <button data-download-player="${player.key}">
                Descargar CSV
              </button>
            </div>
          </article>
        `).join("")}
      </div>
    </div>
  `;
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

  results[match.id] = {
    matchId: match.id,
    homeScore: Number(h),
    awayScore: Number(a),
    admin: currentUser.email
  };

  resultsLoaded = true;

  await renderActiveTab();
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
      </div>
    </article>
  `;
}

async function renderQuiniela() {
  if (!currentUser) {
    $("matchesList").innerHTML = '<p class="note">Ingresa o regístrate para llenar tu quiniela.</p>';

    const submitAllBtn = $("submitAllBtn");
    if (submitAllBtn) submitAllBtn.style.display = "none";

    return;
  }

  $("matchesList").innerHTML = '<p class="note">Cargando partidos...</p>';

  await ensureResultsLoaded();
  await loadUserPredictions();

  const html = MATCHES.map((match) => {
    return card(match, userPredictions[match.id]);
  });

  $("matchesList").innerHTML = html.join("");

  const submitAllBtn = $("submitAllBtn");

  if (submitAllBtn) {
    submitAllBtn.style.display = "inline-block";
    submitAllBtn.onclick = saveAllPredictions;
  }
}

async function renderResults() {
  $("resultsList").innerHTML = '<p class="note">Cargando resultados...</p>';

  await ensureResultsLoaded();

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

async function renderAdmin() {
  if (!ADMIN_EMAILS.includes(currentUser?.email)) {
    $("adminList").innerHTML = '<p class="note">Ingresa con un correo administrador.</p>';
    return;
  }

  $("adminList").innerHTML = '<p class="note">Cargando panel administrador...</p>';

  await ensureResultsLoaded();

  const playerDownloadsHtml = await buildPlayerDownloadCards();

  const resultsAdminHtml = MATCHES.map((match) => `
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

  $("adminList").innerHTML = `
    ${playerDownloadsHtml}

    <div class="rules-text" style="margin-top:24px;">
      <h3>Registrar resultados oficiales</h3>
      <p class="note">
        Ingresa los resultados oficiales de 90 minutos para calcular el ranking.
      </p>
    </div>

    <div class="match-list">
      ${resultsAdminHtml}
    </div>
  `;

  document.querySelectorAll("[data-download-player]").forEach((btn) => {
    btn.addEventListener("click", () => {
      downloadPlayerPredictionsCSV(btn.dataset.downloadPlayer);
    });
  });

  MATCHES.forEach((match) => {
    document.querySelector(`[data-result="${match.id}"]`)?.addEventListener("click", () => saveResult(match));
  });
}

async function buildScores(dateFilter = null) {
  await ensureResultsLoaded();

  const predictions = await loadAllPredictions();

  const users = {};

  predictions.forEach((prediction) => {
    const match = MATCHES.find((item) => item.id === prediction.matchId);

    if (!match) return;
    if (dateFilter && match.date !== dateFilter) return;

    const playerKey = prediction.email || prediction.uid || "sin-correo";

    users[playerKey] ??= {
      email: playerKey,
      playerName: prediction.playerName || cleanNameFromEmail(playerKey),
      pts: 0,
      exactos: 0,
      ganadores: 0,
      goles: 0
    };

    const score = scorePoints(prediction, results[prediction.matchId]);

    users[playerKey].pts += score.points;

    if (score.exact) {
      users[playerKey].exactos += 1;
    }

    if (score.winner) {
      users[playerKey].ganadores += 1;
    }

    users[playerKey].goles += score.goles ?? score.goals ?? 0;
  });

  return Object.values(users).sort((a, b) =>
    b.pts - a.pts ||
    b.exactos - a.exactos ||
    b.ganadores - a.ganadores ||
    b.goles - a.goles ||
    a.playerName.localeCompare(b.playerName)
  );
}

async function renderRanking() {
  $("rankingTable").innerHTML = '<p class="note">Cargando ranking...</p>';

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
            <td>${r.playerName}</td>
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

async function renderOfficialRanking() {

const excludedDate="2026-06-12";

$("#rankingOfficialTable").innerHTML=
'<p class="note">Calculando ranking oficial...</p>';

await ensureResultsLoaded();

const predictions=
await loadAllPredictions();

const users={};

predictions.forEach((prediction)=>{

const match=
MATCHES.find(
m=>m.id===prediction.matchId
);

if(!match)return;

if(match.date===excludedDate){
return;
}

const key=
prediction.email||
prediction.uid;

users[key]??={

playerName:
prediction.playerName,

pts:0,
exactos:0,
ganadores:0,
goles:0

};

const score=
scorePoints(
prediction,
results[prediction.matchId]
);

users[key].pts+=score.points;

if(score.exact)
users[key].exactos++;

if(score.winner)
users[key].ganadores++;

users[key].goles+=
score.goals;

});

const rows=
Object.values(users)
.sort((a,b)=>

b.pts-a.pts||
b.exactos-a.exactos||
b.ganadores-a.ganadores||
b.goles-a.goles

);

$("#rankingOfficialTable").innerHTML=
`
<table>

<thead>

<tr>

<th>#</th>
<th>Jugador</th>
<th>Puntos Oficiales</th>
<th>Exactos</th>
<th>Ganadores</th>
<th>Goles</th>

</tr>

</thead>

<tbody>

${rows.map((r,i)=>`

<tr>

<td>${i+1}</td>

<td>${r.playerName}</td>

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

  $("dailyTable").innerHTML = '<p class="note">Cargando tabla diaria...</p>';

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
            <td>${r.playerName}</td>
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

async function renderActiveTab() {
  const tabId = getCurrentTabId();

  if (tabId === "quiniela") {
    await renderQuiniela();
  }

  if (tabId === "resultados") {
    await renderResults();
  }

  if (tabId === "admin") {
    await renderAdmin();
  }

  if (tabId === "ranking") {
    await renderRanking();
  }

  if(tabId==="rankingOficial"){
    await renderOfficialRanking();
  }

  if (tabId === "diaria") {
    await renderDaily();
  }
}

document.querySelectorAll(".tabs button").forEach((btn) => {
  btn.addEventListener("click", async () => {
    document.querySelectorAll(".tabs button, .tab").forEach((x) => x.classList.remove("active"));

    btn.classList.add("active");
    $(btn.dataset.tab).classList.add("active");

    await renderActiveTab();
  });
});

$("loginBtn").onclick = async () => {
  const email = $("email").value.trim();
  const password = $("password").value;

  if (!email || !password) {
    alert("Ingresa tu correo y contraseña.");
    return;
  }

  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (error) {
    alert("No se pudo iniciar sesión. Verifica tu correo y contraseña.");
  }
};

$("registerBtn").onclick = async () => {
  const displayName = $("displayName").value.trim();
  const email = $("email").value.trim();
  const password = $("password").value;

  if (!displayName) {
    alert("Ingresa tu nombre o usuario.");
    return;
  }

  if (!email || !password) {
    alert("Ingresa correo y contraseña para crear tu cuenta.");
    return;
  }

  if (password.length < 6) {
    alert("La contraseña debe tener al menos 6 caracteres.");
    return;
  }

  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);

    await updateProfile(cred.user, {
      displayName
    });

    await setDoc(doc(db, "users", cred.user.uid), {
      name: displayName,
      email,
      createdAt: serverTimestamp()
    });

    currentPlayerName = displayName;

    alert("Cuenta creada correctamente. Ya puedes participar en la quiniela.");
  } catch (error) {
    if (error.code === "auth/email-already-in-use") {
      alert("Este correo ya está registrado. Usa el botón Iniciar sesión.");
    } else {
      alert("No se pudo crear la cuenta: " + error.message);
    }
  }
};

$("resetPasswordBtn").onclick = async () => {
  const email = $("email").value.trim();

  if (!email) {
    alert("Escribe tu correo para recuperar la contraseña.");
    return;
  }

  try {
    await sendPasswordResetEmail(auth, email);
    alert("Te enviamos un correo para restablecer tu contraseña.");
  } catch (error) {
    alert("No se pudo enviar el correo de recuperación: " + error.message);
  }
};

$("logoutBtn").onclick = () => signOut(auth);
$("loadDaily").onclick = renderDaily;

onAuthStateChanged(auth, async (user) => {
  currentUser = user;

  const loginBox = $("loginBox");
  const welcomeUser = $("welcomeUser");
  const userInfo = $("userInfo");

  resultsLoaded = false;
  userPredictionsLoaded = false;
  userPredictions = {};
  allPredictionsCache = null;

  if (user) {
    currentPlayerName = await loadUserProfile(user);
    const name = getDisplayName(user);

    if (welcomeUser) {
      welcomeUser.textContent = `Bienvenid@, ${name}`;
    }

    if (userInfo) {
      userInfo.textContent = `Sesión: ${name}`;
    }

    if (loginBox) {
      loginBox.classList.add("hidden");
    }
  } else {
    currentPlayerName = "";

    if (welcomeUser) {
      welcomeUser.textContent = "";
    }

    if (userInfo) {
      userInfo.textContent = "Sin sesión";
    }

    if (loginBox) {
      loginBox.classList.remove("hidden");
    }
  }

  await renderActiveTab();
});
