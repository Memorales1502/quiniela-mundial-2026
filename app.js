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
import { MATCHES16 } from "./matches16.js";
import { MATCHES8 } from "./matches8.js";
import { MATCHES4 } from "./matches4.js";
import { MATCHES6 } from "./matches6.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let currentUser = null;
let currentPlayerName = "";

let results = {};
let results16 = {};
let results8 = {};
let results4 = {};
let results6 = {};

let resultsLoaded = false;
let results16Loaded = false;
let results8Loaded = false;
let results4Loaded = false;
let results6Loaded = false;

let userPredictions = {};
let userPredictions16 = {};
let userPredictions8 = {};
let userPredictions4 = {};
let userPredictions6 = {};

let userPredictionsLoaded = false;
let userPredictions16Loaded = false;
let userPredictions8Loaded = false;
let userPredictions4Loaded = false;
let userPredictions6Loaded = false;

let allPredictionsCache = null;
let allPredictions16Cache = null;
let allPredictions8Cache = null;
let allPredictions4Cache = null;
let allPredictions6Cache = null;

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

const hasResult16 = (matchId) => {
  return results16[matchId]?.homeScore !== undefined &&
    results16[matchId]?.awayScore !== undefined;
};

const hasResult8 = (matchId) => {
  return results8[matchId]?.homeScore !== undefined &&
    results8[matchId]?.awayScore !== undefined;
};

const hasResult4 = (matchId) => {
  return results4[matchId]?.homeScore !== undefined &&
         results4[matchId]?.awayScore !== undefined;
};

const hasResult6 = (matchId) => {
  return results4[matchId]?.homeScore !== undefined &&
         results4[matchId]?.awayScore !== undefined;
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

const isLockedForInput = (match, prediction, phase = "groups") => {

  let resultExists = hasResult(match.id);

  if (phase === "16") {
    resultExists = hasResult16(match.id);
  }

  if (phase === "8") {
    resultExists = hasResult8(match.id);
  }

  if (phase === "4") {
    resultExists = hasResult4(match.id);
  }

  if (phase === "6") {
    resultExists = hasResult6(match.id);
  }

  return Boolean(prediction?.submitted) ||
         Boolean(prediction?.locked) ||
         resultExists ||
         isStarted(match);

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

async function ensureResults16Loaded(force = false) {
  if (results16Loaded && !force) return;

  results16 = {};

  const snap = await getDocs(collection(db, "results16"));

  snap.forEach((d) => {
    results16[d.id] = d.data();
  });

  results16Loaded = true;
}

async function ensureResults8Loaded(force = false) {
  if (results8Loaded && !force) return;

  results8 = {};

  const snap = await getDocs(collection(db, "results8"));

  snap.forEach((d) => {
    results8[d.id] = d.data();
  });

  results8Loaded = true;
}

async function ensureResults4Loaded(force = false) {

  if (results4Loaded && !force) return;

  const snap = await getDocs(collection(db, "results4"));

  results4 = {};

  snap.forEach((d) => {
    results4[d.id] = d.data();
  });

  results4Loaded = true;
}

async function ensureResults6Loaded(force = false) {

  if (results6Loaded && !force) return;

  const snap = await getDocs(collection(db, "results6"));

  results6 = {};

  snap.forEach((d) => {
    results6[d.id] = d.data();
  });

  results6Loaded = true;
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

async function loadUserPredictions16(force = false) {
  if (!currentUser) return;

  if (userPredictions16Loaded && !force) return;

  userPredictions16 = {};

  const q = query(
    collection(db, "predictions16"),
    where("uid", "==", currentUser.uid)
  );

  const snap = await getDocs(q);

  snap.forEach((d) => {
    const data = d.data();
    userPredictions16[data.matchId] = data;
  });

  userPredictions16Loaded = true;
}

async function loadUserPredictions8(force = false) {
  if (!currentUser) return;

  if (userPredictions8Loaded && !force) return;

  userPredictions8 = {};

  const q = query(
    collection(db, "predictions8"),
    where("uid", "==", currentUser.uid)
  );

  const snap = await getDocs(q);

  snap.forEach((d) => {
    const data = d.data();
    userPredictions8[data.matchId] = data;
  });

  userPredictions8Loaded = true;
}

async function loadUserPredictions4(force = false) {

  if (!currentUser) return;

  if (userPredictions4Loaded && !force) return;

  userPredictions4 = {};

  const q = query(
    collection(db, "predictions4"),
    where("uid", "==", currentUser.uid)
  );

  const snap = await getDocs(q);

  snap.forEach((d) => {

    const data = d.data();

    userPredictions4[data.matchId] = data;

  });

  userPredictions4Loaded = true;
}

async function loadUserPredictions6(force = false) {

  if (!currentUser) return;

  if (userPredictions6Loaded && !force) return;

  userPredictions6 = {};

  const q = query(
    collection(db, "predictions6"),
    where("uid", "==", currentUser.uid)
  );

  const snap = await getDocs(q);

  snap.forEach((d) => {

    const data = d.data();

    userPredictions6[data.matchId] = data;

  });

  userPredictions6Loaded = true;
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

async function loadAllPredictions16(force = false) {
  if (allPredictions16Cache && !force) return allPredictions16Cache;

  const snap = await getDocs(collection(db, "predictions16"));

  allPredictions16Cache = [];

  snap.forEach((d) => {
    allPredictions16Cache.push(d.data());
  });

  return allPredictions16Cache;
}

async function loadAllPredictions8(force = false) {
  if (allPredictions8Cache && !force) return allPredictions8Cache;

  const snap = await getDocs(collection(db, "predictions8"));

  allPredictions8Cache = [];

  snap.forEach((d) => {
    allPredictions8Cache.push(d.data());
  });

  return allPredictions8Cache;
}

async function loadAllPredictions4(force = false) {

  if (allPredictions4Cache && !force)
    return allPredictions4Cache;

  const snap = await getDocs(collection(db, "predictions4"));

  allPredictions4Cache = [];

  snap.forEach((d) => {

    allPredictions4Cache.push(d.data());

  });

  return allPredictions4Cache;
}

async function loadAllPredictions6(force = false) {

  if (allPredictions6Cache && !force)
    return allPredictions6Cache;

  const snap = await getDocs(collection(db, "predictions6"));

  allPredictions6Cache = [];

  snap.forEach((d) => {

    allPredictions6Cache.push(d.data());

  });

  return allPredictions6Cache;
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

function downloadPredictionsCSV(items, submittedAt, phaseName = "Fase de grupos") {
  const playerName = getDisplayName(currentUser);
  const email = currentUser.email;
  const dateText = submittedAt.toLocaleString("es-GT");

  const rows = [];

  rows.push([`CONSTANCIA DE PRONÓSTICOS - ${phaseName.toUpperCase()} - QUINIELA MUNDIALISTA 2026`]);
  rows.push(["Jugador", playerName]);
  rows.push(["Correo", email]);
  rows.push(["Fecha de envío", dateText]);
  rows.push([]);
  rows.push([
    "ID",
    "Fase",
    "Fecha Partido",
    "Hora",
    "Grupo/Fase",
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
      phaseName,
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
  const safePhase = phaseName.toLowerCase().replaceAll(" ", "_");

  downloadCSV(rows, `constancia_${safePhase}_${safeEmail}_${fileDate}.csv`);
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

  let message = `Vas a enviar ${toSave.length} pronósticos de fase de grupos y quedarán bloqueados definitivamente.\n\n`;

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
      phase: "groups",
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

  downloadPredictionsCSV(toSave, submittedAt, "Fase de grupos");

  alert("Pronósticos enviados correctamente. Se descargó tu constancia.");
  await renderActiveTab();
}

async function saveAllPredictions16() {
  if (!currentUser) {
    alert("Debes iniciar sesión.");
    return;
  }

  await ensureResults16Loaded();
  await loadUserPredictions16();

  const alreadySubmitted = [];
  const blockedByGame = [];
  const toSave = [];

  for (const match of MATCHES16) {
    const existing = userPredictions16[match.id];

    if (existing?.submitted) {
      alreadySubmitted.push(match);
      continue;
    }

    if (hasResult16(match.id) || isStarted(match)) {
      blockedByGame.push(match);
      continue;
    }

    const h = $(`p16h_${match.id}`)?.value ?? "";
    const a = $(`p16a_${match.id}`)?.value ?? "";
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
    alert("No hay pronósticos nuevos de 16avos para enviar.");
    return;
  }

  const invalidCount = toSave.filter((item) => item.invalid).length;

  let message = `Vas a enviar ${toSave.length} pronósticos de 16avos y quedarán bloqueados definitivamente.\n\n`;

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
      phase: "16avos",
      matchId: item.match.id,
      homeScore: item.homeScore,
      awayScore: item.awayScore,
      invalid: item.invalid,
      submitted: true,
      locked: true,
      submittedAt: serverTimestamp()
    };

    await setDoc(
      doc(db, "predictions16", `${currentUser.uid}_${item.match.id}`),
      data
    );

    userPredictions16[item.match.id] = data;
  }

  allPredictions16Cache = null;

  downloadPredictionsCSV(toSave, submittedAt, "16avos");

  alert("Pronósticos de 16avos enviados correctamente. Se descargó tu constancia.");
  await renderActiveTab();
}

async function saveAllPredictions8() {
  if (!currentUser) {
    alert("Debes iniciar sesión.");
    return;
  }

  await ensureResults8Loaded();
  await loadUserPredictions8();

  const alreadySubmitted = [];
  const blockedByGame = [];
  const toSave = [];

  for (const match of MATCHES8) {
    const existing = userPredictions8[match.id];

    if (existing?.submitted) {
      alreadySubmitted.push(match);
      continue;
    }

    if (hasResult8(match.id) || isStarted(match)) {
      blockedByGame.push(match);
      continue;
    }

    const h = $(`p8h_${match.id}`)?.value ?? "";
    const a = $(`p8a_${match.id}`)?.value ?? "";
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
    alert("No hay pronósticos nuevos de 8vos para enviar.");
    return;
  }

  const invalidCount = toSave.filter((item) => item.invalid).length;

  let message = `Vas a enviar ${toSave.length} pronósticos de 8vos y quedarán bloqueados definitivamente.

`;

  if (invalidCount > 0) {
    message += `Atención: ${invalidCount} pronóstico(s) están incompletos y se guardarán como INVÁLIDOS con 0 puntos.

`;
  }

  if (blockedByGame.length > 0) {
    message += `${blockedByGame.length} partido(s) ya están bloqueados por inicio o resultado oficial y no se enviarán.

`;
  }

  if (alreadySubmitted.length > 0) {
    message += `${alreadySubmitted.length} partido(s) ya habían sido enviados anteriormente y no se modificarán.

`;
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
      phase: "8vos",
      matchId: item.match.id,
      homeScore: item.homeScore,
      awayScore: item.awayScore,
      invalid: item.invalid,
      submitted: true,
      locked: true,
      submittedAt: serverTimestamp()
    };

    await setDoc(
      doc(db, "predictions8", `${currentUser.uid}_${item.match.id}`),
      data
    );

    userPredictions8[item.match.id] = data;
  }

  allPredictions8Cache = null;

  downloadPredictionsCSV(toSave, submittedAt, "8vos");

  alert("Pronósticos de 8vos enviados correctamente. Se descargó tu constancia.");
  await renderActiveTab();
}

async function saveAllPredictions4() {

  if (!currentUser) {
    alert("Debes iniciar sesión.");
    return;
  }

  await ensureResults4Loaded();
  await loadUserPredictions4();

  const alreadySubmitted = [];
  const blockedByGame = [];
  const toSave = [];

  for (const match of MATCHES4) {

    const existing = userPredictions4[match.id];

    if (existing?.submitted) {
      alreadySubmitted.push(match);
      continue;
    }

    if (hasResult4(match.id) || isStarted(match)) {
    blockedByGame.push(match);
    continue;
    }

    const h = $(`p4h_${match.id}`)?.value ?? "";
    const a = $(`p4a_${match.id}`)?.value ?? "";

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
    alert("No hay pronósticos nuevos de Cuartos para enviar.");
    return;
  }

  const invalidCount = toSave.filter(x => x.invalid).length;

  let message =
`Vas a enviar ${toSave.length} pronósticos de Cuartos y quedarán bloqueados definitivamente.\n\n`;

  if (invalidCount > 0) {
    message +=
`Atención: ${invalidCount} pronóstico(s) incompletos serán guardados con 0 puntos.\n\n`;
  }

  if (blockedByGame.length > 0) {
    message +=
`${blockedByGame.length} partido(s) ya están bloqueados.\n\n`;
  }

  if (alreadySubmitted.length > 0) {
    message +=
`${alreadySubmitted.length} partido(s) ya fueron enviados anteriormente.\n\n`;
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

      phase: "Cuartos",

      matchId: item.match.id,

      homeScore: item.homeScore,
      awayScore: item.awayScore,

      invalid: item.invalid,

      submitted: true,
      locked: true,

      submittedAt: serverTimestamp()

    };

    await setDoc(
      doc(db, "predictions4", `${currentUser.uid}_${item.match.id}`),
      data
    );

    userPredictions4[item.match.id] = data;

  }

  allPredictions4Cache = null;

  downloadPredictionsCSV(
    toSave,
    submittedAt,
    "Cuartos"
  );

  alert("Pronósticos de Cuartos enviados correctamente.");

  await renderActiveTab();

}

async function saveAllPredictions6() {

  if (!currentUser) {
    alert("Debes iniciar sesión.");
    return;
  }

  await ensureResults6Loaded();
  await loadUserPredictions6();

  const alreadySubmitted = [];
  const blockedByGame = [];
  const toSave = [];

  for (const match of MATCHES6) {

    const existing = userPredictions6[match.id];

    if (existing?.submitted) {
      alreadySubmitted.push(match);
      continue;
    }

    if (hasResult6(match.id) || isStarted(match)) {
    blockedByGame.push(match);
    continue;
    }

    const h = $(`p6h_${match.id}`)?.value ?? "";
    const a = $(`p6a_${match.id}`)?.value ?? "";

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
    alert("No hay pronósticos nuevos de Semifinales para enviar.");
    return;
  }

  const invalidCount = toSave.filter(x => x.invalid).length;

  let message =
`Vas a enviar ${toSave.length} pronósticos de Semifinales quedarán bloqueados definitivamente.\n\n`;

  if (invalidCount > 0) {
    message +=
`Atención: ${invalidCount} pronóstico(s) incompletos serán guardados con 0 puntos.\n\n`;
  }

  if (blockedByGame.length > 0) {
    message +=
`${blockedByGame.length} partido(s) ya están bloqueados.\n\n`;
  }

  if (alreadySubmitted.length > 0) {
    message +=
`${alreadySubmitted.length} partido(s) ya fueron enviados anteriormente.\n\n`;
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

      phase: "Semifinales",

      matchId: item.match.id,

      homeScore: item.homeScore,
      awayScore: item.awayScore,

      invalid: item.invalid,

      submitted: true,
      locked: true,

      submittedAt: serverTimestamp()

    };

    await setDoc(
      doc(db, "predictions6", `${currentUser.uid}_${item.match.id}`),
      data
    );

    userPredictions6[item.match.id] = data;

  }

  allPredictions6Cache = null;

  downloadPredictionsCSV(
    toSave,
    submittedAt,
    "Semifinales"
  );

  alert("Pronósticos de Semifinales enviados correctamente.");

  await renderActiveTab();

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
  allPredictionsCache = null;

  await renderActiveTab();
}

async function saveResult16(match) {
  if (!ADMIN_EMAILS.includes(currentUser?.email)) {
    alert("No tienes permiso de administrador.");
    return;
  }

  const h = $(`r16h_${match.id}`).value;
  const a = $(`r16a_${match.id}`).value;

  if (h === "" || a === "") {
    alert("Coloca el resultado final de los 90 minutos.");
    return;
  }

  if (!confirm(`Guardar resultado oficial de 16avos: ${match.home} ${h}-${a} ${match.away}?`)) return;

  await setDoc(doc(db, "results16", match.id), {
    matchId: match.id,
    homeScore: Number(h),
    awayScore: Number(a),
    updatedAt: serverTimestamp(),
    admin: currentUser.email
  });

  results16[match.id] = {
    matchId: match.id,
    homeScore: Number(h),
    awayScore: Number(a),
    admin: currentUser.email
  };

  results16Loaded = true;
  allPredictions16Cache = null;

  await renderActiveTab();
}

async function saveResult8(match) {
  if (!ADMIN_EMAILS.includes(currentUser?.email)) {
    alert("No tienes permiso de administrador.");
    return;
  }

  const h = $(`r8h_${match.id}`).value;
  const a = $(`r8a_${match.id}`).value;

  if (h === "" || a === "") {
    alert("Coloca el resultado final de los 90 minutos.");
    return;
  }

  if (!confirm(`Guardar resultado oficial de 8vos: ${match.home} ${h}-${a} ${match.away}?`)) return;

  await setDoc(doc(db, "results8", match.id), {
    matchId: match.id,
    homeScore: Number(h),
    awayScore: Number(a),
    updatedAt: serverTimestamp(),
    admin: currentUser.email
  });

  results8[match.id] = {
    matchId: match.id,
    homeScore: Number(h),
    awayScore: Number(a),
    admin: currentUser.email
  };

  results8Loaded = true;
  allPredictions8Cache = null;

  await renderActiveTab();
}

async function saveResult4(match) {

  if (!ADMIN_EMAILS.includes(currentUser?.email)) {
    alert("No tienes permiso.");
    return;
  }

  const h = $(`r4h_${match.id}`).value;
  const a = $(`r4a_${match.id}`).value;

  if (h === "" || a === "") {
    alert("Coloca el resultado final.");
    return;
  }

  if (!confirm(
`Guardar resultado oficial de Cuartos: ${match.home} ${h}-${a} ${match.away}?`
)) return;

  await setDoc(doc(db,"results4",match.id),{

    matchId:match.id,

    homeScore:Number(h),
    awayScore:Number(a),

    updatedAt:serverTimestamp(),

    admin:currentUser.email

  });

  results4[match.id]={

    matchId:match.id,

    homeScore:Number(h),
    awayScore:Number(a),

    admin:currentUser.email

  };

  results4Loaded=true;

  allPredictions4Cache=null;

  await renderActiveTab();

}

async function saveResult6(match) {

  if (!ADMIN_EMAILS.includes(currentUser?.email)) {
    alert("No tienes permiso.");
    return;
  }

  const h = $(`r6h_${match.id}`).value;
  const a = $(`r6a_${match.id}`).value;

  if (h === "" || a === "") {
    alert("Coloca el resultado final.");
    return;
  }

  if (!confirm(
`Guardar resultado oficial de Semifinales: ${match.home} ${h}-${a} ${match.away}?`
)) return;

  await setDoc(doc(db,"results6",match.id),{

    matchId:match.id,

    homeScore:Number(h),
    awayScore:Number(a),

    updatedAt:serverTimestamp(),

    admin:currentUser.email

  });

  results6[match.id]={

    matchId:match.id,

    homeScore:Number(h),
    awayScore:Number(a),

    admin:currentUser.email

  };

  results6Loaded=true;

  allPredictions6Cache=null;

  await renderActiveTab();

}






function card(match, prediction, phase = "groups") {
  const is16 = phase === "16";
  const is8 = phase === "8";
  const is4 = phase === "4";
  const is4 = phase === "6";
  const result = is6 ? results6[match.id] : is6 ? results4[match.id] : is8 ? results8[match.id] : is16 ? results16[match.id] : results[match.id];
  const locked = isLockedForInput(match, prediction, phase);

  const inputHomeId = is6 ? `p6h_${match.id}` : is4 ? `p4h_${match.id}` : is8 ? `p8h_${match.id}` : is16 ? `p16h_${match.id}` : `ph_${match.id}`;
  const inputAwayId = is6 ? `p6a_${match.id}` : is4 ? `p4a_${match.id}` : is8 ? `p8a_${match.id}` : is16 ? `p16a_${match.id}` : `pa_${match.id}`;

  const predictionText = prediction?.submitted
    ? prediction.invalid
      ? '<span class="locked">Pronóstico inválido · 0 pts</span>'
      : `<span class="ok">Enviado: ${prediction.homeScore}-${prediction.awayScore}</span>`
    : '<span class="note">Pendiente de enviar</span>';

  let lockText = '<span class="ok">Abierto</span>';

  if (prediction?.submitted || prediction?.locked) {
    lockText = '<span class="locked">Bloqueado por envío</span>';
  } else if (result) {
    lockText = '<span class="locked">Bloqueado por resultado oficial</span>';
  } else if (isStarted(match)) {
    lockText = '<span class="locked">Bloqueado por inicio del partido</span>';
  }

  return `
    <article class="match-card">
      <div>
        <div class="teams">${match.home} vs ${match.away}</div>
        <div class="meta">${match.date} ${match.time || ""} · ${match.group || ""} · ${match.venue || ""}</div>
        <div>${predictionText}</div>
      </div>

      <div>
        ${result ? `Resultado 90': <b>${result.homeScore}-${result.awayScore}</b>` : "Resultado pendiente"}
        <br>
        ${lockText}
      </div>

      <div class="score-inputs">
        <input id="${inputHomeId}" type="number" min="0" value="${prediction?.homeScore ?? ""}" ${locked ? "disabled" : ""}>
        -
        <input id="${inputAwayId}" type="number" min="0" value="${prediction?.awayScore ?? ""}" ${locked ? "disabled" : ""}>
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
    return card(match, userPredictions[match.id], "groups");
  });

  $("matchesList").innerHTML = html.join("");

  const submitAllBtn = $("submitAllBtn");

  if (submitAllBtn) {
    submitAllBtn.style.display = "inline-block";
    submitAllBtn.onclick = saveAllPredictions;
  }
}

async function renderDieciseisavos() {
  if (!currentUser) {
    $("matches16List").innerHTML = '<p class="note">Ingresa o regístrate para llenar tus pronósticos de 16avos.</p>';

    const submit16Btn = $("submit16Btn");
    if (submit16Btn) submit16Btn.style.display = "none";

    return;
  }

  $("matches16List").innerHTML = '<p class="note">Cargando partidos de 16avos...</p>';

  await ensureResults16Loaded();
  await loadUserPredictions16();

  const html = MATCHES16.map((match) => {
    return card(match, userPredictions16[match.id], "16");
  });

  $("matches16List").innerHTML = html.join("");

  const submit16Btn = $("submit16Btn");

  if (submit16Btn) {
    submit16Btn.style.display = "inline-block";
    submit16Btn.onclick = saveAllPredictions16;
  }
}

async function renderOctavos() {
  if (!currentUser) {
    $("matches8List").innerHTML = '<p class="note">Ingresa o regístrate para llenar tus pronósticos de 8vos.</p>';

    const submit8Btn = $("submit8Btn");
    if (submit8Btn) submit8Btn.style.display = "none";

    return;
  }

  $("matches8List").innerHTML = '<p class="note">Cargando partidos de 8vos...</p>';

  await ensureResults8Loaded();
  await loadUserPredictions8();

  const html = MATCHES8.map((match) => {
    return card(match, userPredictions8[match.id], "8");
  });

  $("matches8List").innerHTML = html.join("");

  const submit8Btn = $("submit8Btn");

  if (submit8Btn) {
    submit8Btn.style.display = "inline-block";
    submit8Btn.onclick = saveAllPredictions8;
  }
}

async function renderCuartos() {

  if (!currentUser) {

    $("matches4List").innerHTML =
      '<p class="note">Ingresa o regístrate para llenar tus pronósticos de Cuartos.</p>';

    const btn = $("submit4Btn");

    if (btn) btn.style.display = "none";

    return;

  }

  $("matches4List").innerHTML =
    '<p class="note">Cargando partidos de Cuartos...</p>';

  await ensureResults4Loaded();

  await loadUserPredictions4();

  const html = MATCHES4.map(match =>
    card(match, userPredictions4[match.id], "4")
  );

  $("matches4List").innerHTML = html.join("");

  const btn = $("submit4Btn");

  if (btn) {

    btn.style.display = "inline-block";

    btn.onclick = saveAllPredictions4;

  }
}

async function renderSemifinales() {

  if (!currentUser) {

    $("matches6List").innerHTML =
      '<p class="note">Ingresa o regístrate para llenar tus pronósticos de Semifinales.</p>';

    const btn = $("submit6Btn");

    if (btn) btn.style.display = "none";

    return;

  }

  $("matches6List").innerHTML =
    '<p class="note">Cargando partidos de Semifinales...</p>';

  await ensureResults6Loaded();

  await loadUserPredictions6();

  const html = MATCHES6.map(match =>
    card(match, userPredictions6[match.id], "6")
  );

  $("matches6List").innerHTML = html.join("");

  const btn = $("submit6Btn");

  if (btn) {

    btn.style.display = "inline-block";

    btn.onclick = saveAllPredictions6;

  }

}

async function renderResults() {
  $("resultsList").innerHTML = '<p class="note">Cargando resultados...</p>';

  await ensureResultsLoaded();
  await ensureResults16Loaded();
  await ensureResults8Loaded();
  await ensureResults4Loaded();
  await ensureResults6Loaded();

  const groupResults = MATCHES.map((match) => {
    const result = results[match.id];

    return `
      <article class="match-card">
        <div>
          <div class="teams">${match.home} vs ${match.away}</div>
          <div class="meta">${match.date} ${match.time || ""} · ${match.group || ""} · Fase de grupos</div>
        </div>
        <div>${result ? `Final 90': <b>${result.homeScore}-${result.awayScore}</b>` : "Pendiente"}</div>
      </article>
    `;
  }).join("");

  const round16Results = MATCHES16.map((match) => {
    const result = results16[match.id];

    return `
      <article class="match-card">
        <div>
          <div class="teams">${match.home} vs ${match.away}</div>
          <div class="meta">${match.date} ${match.time || ""} · 16avos</div>
        </div>
        <div>${result ? `Final 90': <b>${result.homeScore}-${result.awayScore}</b>` : "Pendiente"}</div>
      </article>
    `;
  }).join("");

  const round8Results = MATCHES8.map((match) => {
    const result = results8[match.id];

    return `
      <article class="match-card">
        <div>
          <div class="teams">${match.home} vs ${match.away}</div>
          <div class="meta">${match.date} ${match.time || ""} · 8vos</div>
        </div>
        <div>${result ? `Final 90': <b>${result.homeScore}-${result.awayScore}</b>` : "Pendiente"}</div>
      </article>
    `;
  }).join("");

  const round4Results = MATCHES4.map((match) => {
  const result = results4[match.id];

  return `
    <article class="match-card">
      <div>
        <div class="teams">${match.home} vs ${match.away}</div>
        <div class="meta">${match.date} ${match.time || ""} · Cuartos</div>
      </div>

      <div>
        ${result
          ? `Final 90': <b>${result.homeScore}-${result.awayScore}</b>`
          : "Pendiente"}
      </div>
    </article>
  `;

}).join("");

  const round6Results = MATCHES6.map((match) => {
  const result = results6[match.id];

  return `
    <article class="match-card">
      <div>
        <div class="teams">${match.home} vs ${match.away}</div>
        <div class="meta">${match.date} ${match.time || ""} · Semifinales</div>
      </div>

      <div>
        ${result
          ? `Final 90': <b>${result.homeScore}-${result.awayScore}</b>`
          : "Pendiente"}
      </div>
    </article>
  `;

}).join("");

  $("resultsList").innerHTML = `
    <div class="rules-text">
      <h3>Fase de grupos</h3>
    </div>
    ${groupResults}

    <div class="rules-text" style="margin-top:24px;">
      <h3>16avos de Final</h3>
    </div>
    ${round16Results}

    <div class="rules-text" style="margin-top:24px;">
      <h3>8vos de Final</h3>
    </div>

    ${round8Results}

    <div class="rules-text" style="margin-top:24px;">
      <h3>Cuartos de Final</h3>
    </div>

    ${round4Results}

 <div class="rules-text" style="margin-top:24px;">
      <h3>Semifinales</h3>
    </div>

    ${round6Results}
    `;
}

async function downloadPlayerPredictionsCSV(playerKey) {
  if (!ADMIN_EMAILS.includes(currentUser?.email)) {
    alert("No tienes permiso de administrador.");
    return;
  }

  await ensureResultsLoaded();
  await ensureResults16Loaded();
  await ensureResults8Loaded();
  await ensureResults4Loaded();
  await ensureResults6Loaded();

  const predictionsGroups = await loadAllPredictions();
  const predictions16 = await loadAllPredictions16();
  const predictions8 = await loadAllPredictions8();
  const predictions4 = await loadAllPredictions4();
  const predictions6 = await loadAllPredictions6();

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
    "Fase",
    "ID Partido",
    "Fecha",
    "Hora",
    "Grupo/Fase",
    "Equipo 1",
    "Pronóstico Equipo 1",
    "Equipo 2",
    "Pronóstico Equipo 2",
    "Sede",
    "Estado",
    "Resultado Oficial",
    "Puntos"
  ]);

  const addRows = (predictions, matches, phaseName, resultMap) => {
    predictions.forEach((prediction) => {
      const key = prediction.email || prediction.uid || "sin-correo";

      if (key !== playerKey) return;

      const match = matches.find((m) => m.id === prediction.matchId);
      if (!match) return;

      const result = resultMap[prediction.matchId];
      const score = scorePoints(prediction, result);

      playerName = prediction.playerName || cleanNameFromEmail(prediction.email);
      playerEmail = prediction.email || "";

      rows.push([
        playerName,
        playerEmail,
        phaseName,
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
  };

  addRows(predictionsGroups, MATCHES, "Fase de grupos", results);
  addRows(predictions16, MATCHES16, "16avos", results16);
  addRows(predictions8, MATCHES8, "8vos", results8);
  addRows(predictions4, MATCHES4, "Cuartos", results4);
  addRows(predictions6, MATCHES6, "Semifinales", results6);

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
  const predictionsGroups = await loadAllPredictions();
  const predictions16 = await loadAllPredictions16();
  const predictions8 = await loadAllPredictions8();
  const predictions4 = await loadAllPredictions4();
  const predictions6 = await loadAllPredictions6();

  const players = {};

  const addPlayers = (predictions) => {
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
  };

  addPlayers(predictionsGroups);
  addPlayers(predictions16);
  addPlayers(predictions8);
  addPlayers(predictions4);
  addPlayers(predictions6);

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
        Cada botón descarga los pronósticos enviados por ese jugador en todas las fases disponibles.
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

async function renderAdmin() {
  if (!ADMIN_EMAILS.includes(currentUser?.email)) {
    $("adminList").innerHTML = '<p class="note">Ingresa con un correo administrador.</p>';
    return;
  }

  $("adminList").innerHTML = '<p class="note">Cargando panel administrador...</p>';

  await ensureResultsLoaded();
  await ensureResults16Loaded();
  await ensureResults8Loaded();
  await ensureResults4Loaded();
  await ensureResults6Loaded();

  const playerDownloadsHtml = await buildPlayerDownloadCards();

  const resultsAdminHtml = MATCHES.map((match) => `
    <article class="match-card">
      <div>
        <div class="teams">${match.home} vs ${match.away}</div>
        <div class="meta">${match.date} ${match.time || ""} · ${match.venue || ""}</div>
      </div>

      <div class="score-inputs">
        <input id="rh_${match.id}" type="number" min="0" value="${results[match.id]?.homeScore ?? ""}">
        -
        <input id="ra_${match.id}" type="number" min="0" value="${results[match.id]?.awayScore ?? ""}">
        <button data-result="${match.id}">Guardar resultado 90'</button>
      </div>
    </article>
  `).join("");

  const results16AdminHtml = MATCHES16.map((match) => `
    <article class="match-card">
      <div>
        <div class="teams">${match.home} vs ${match.away}</div>
        <div class="meta">${match.date} ${match.time || ""} · ${match.venue || ""}</div>
      </div>

      <div class="score-inputs">
        <input id="r16h_${match.id}" type="number" min="0" value="${results16[match.id]?.homeScore ?? ""}">
        -
        <input id="r16a_${match.id}" type="number" min="0" value="${results16[match.id]?.awayScore ?? ""}">
        <button data-result16="${match.id}">Guardar resultado 16avos</button>
      </div>
    </article>
  `).join("");

  const results8AdminHtml = MATCHES8.map((match) => `
    <article class="match-card">
      <div>
        <div class="teams">${match.home} vs ${match.away}</div>
        <div class="meta">${match.date} ${match.time || ""} · ${match.venue || ""}</div>
      </div>

      <div class="score-inputs">
        <input id="r8h_${match.id}" type="number" min="0" value="${results8[match.id]?.homeScore ?? ""}">
        -
        <input id="r8a_${match.id}" type="number" min="0" value="${results8[match.id]?.awayScore ?? ""}">
        <button data-result8="${match.id}">Guardar resultado 8vos</button>
      </div>
    </article>
  `).join("");

  const results4AdminHtml = MATCHES4.map((match) => `
  <article class="match-card">
    <div>
      <div class="teams">${match.home} vs ${match.away}</div>
      <div class="meta">${match.date} ${match.time || ""} · ${match.venue || ""}</div>
    </div>

    <div class="score-inputs">
      <input id="r4h_${match.id}" type="number" min="0" value="${results4[match.id]?.homeScore ?? ""}">
      -
      <input id="r4a_${match.id}" type="number" min="0" value="${results4[match.id]?.awayScore ?? ""}">
      <button data-result4="${match.id}">
        Guardar resultado Cuartos
      </button>
    </div>
  </article>
`).join("");

  const results6AdminHtml = MATCHES6.map((match) => `
  <article class="match-card">
    <div>
      <div class="teams">${match.home} vs ${match.away}</div>
      <div class="meta">${match.date} ${match.time || ""} · ${match.venue || ""}</div>
    </div>

    <div class="score-inputs">
      <input id="r6h_${match.id}" type="number" min="0" value="${results6[match.id]?.homeScore ?? ""}">
      -
      <input id="r6a_${match.id}" type="number" min="0" value="${results6[match.id]?.awayScore ?? ""}">
      <button data-result6="${match.id}">
        Guardar resultado Semifinales
      </button>
    </div>
  </article>
`).join("");

  $("adminList").innerHTML = `
    ${playerDownloadsHtml}

    <div class="rules-text" style="margin-top:24px;">
      <h3>Registrar resultados oficiales - Fase de grupos</h3>
      <p class="note">
        Ingresa los resultados oficiales de 90 minutos para calcular el ranking.
      </p>
    </div>

    <div class="match-list">
      ${resultsAdminHtml}
    </div>

    <div class="rules-text" style="margin-top:24px;">
      <h3>Registrar resultados oficiales - 16avos</h3>
      <p class="note">
        Ingresa los resultados oficiales de 90 minutos de 16avos para que se sumen al ranking.
      </p>
    </div>

    <div class="match-list">
      ${results16AdminHtml}
    </div>

    <div class="rules-text" style="margin-top:24px;">
      <h3>Registrar resultados oficiales - 8vos</h3>
      <p class="note">
        Ingresa los resultados oficiales de 90 minutos de 8vos para que se sumen al ranking.
      </p>
    </div>

    <div class="match-list">
      ${results8AdminHtml}
    </div>

    <div class="rules-text" style="margin-top:24px;">
      <h3>Registrar resultados oficiales - Cuartos</h3>
      <p class="note">
        Ingresa los resultados oficiales de los Cuartos de Final para que se sumen al ranking.
      </p>
      </div>

      <div class="match-list">
        ${results4AdminHtml}
      </div>

     <div class="rules-text" style="margin-top:24px;">
      <h3>Registrar resultados oficiales - Semifinales</h3>
      <p class="note">
        Ingresa los resultados oficiales de las Semifinales para que se sumen al ranking.
      </p>
      </div>

      <div class="match-list">
        ${results6AdminHtml}
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

  MATCHES16.forEach((match) => {
    document.querySelector(`[data-result16="${match.id}"]`)?.addEventListener("click", () => saveResult16(match));
  });

  MATCHES8.forEach((match) => {
    document.querySelector(`[data-result8="${match.id}"]`)?.addEventListener("click", () => saveResult8(match));
  });

  MATCHES4.forEach((match) => {
  document.querySelector(`[data-result4="${match.id}"]`)?.addEventListener("click", () => saveResult4(match));
   });

  MATCHES6.forEach((match) => {
  document.querySelector(`[data-result6="${match.id}"]`)?.addEventListener("click", () => saveResult6(match));
   });
}

async function buildScores(dateFilter = null, officialOnly = false) {
  await ensureResultsLoaded();
  await ensureResults16Loaded();
  await ensureResults8Loaded();
  await ensureResults4Loaded();
  await ensureResults6Loaded();

  const predictionsGroups = await loadAllPredictions();
  const predictions16 = await loadAllPredictions16();
  const predictions8 = await loadAllPredictions8();
  const predictions4 = await loadAllPredictions4();
   const predictions6 = await loadAllPredictions6();

  const users = {};
  const excludedDate = "2026-06-12";

  const addScore = (prediction, match, result, phaseName) => {
    if (!match) return;

    if (officialOnly && phaseName === "Fase de grupos" && match.date === excludedDate) {
      return;
    }

    if (dateFilter && match.date !== dateFilter) return;

    const playerKey = prediction.email || prediction.uid || "sin-correo";

    users[playerKey] ??= {

    email: playerKey,
    playerName: prediction.playerName || cleanNameFromEmail(playerKey),
    pts: 0,
    exactos: 0,
    ganadores: 0,
    goles: 0,
    grupos: 0,
    dieciseisavos: 0,
    octavos: 0,
    cuartos: 0
    };

    const score = scorePoints(prediction, result);

    users[playerKey].pts += score.points;

    if (phaseName === "Fase de grupos") {
      users[playerKey].grupos += score.points;
    }

    if (phaseName === "16avos") {
      users[playerKey].dieciseisavos += score.points;
    }

    if (phaseName === "8vos") {
      users[playerKey].octavos += score.points;
    }

    if (phaseName === "Cuartos") {
    users[playerKey].cuartos += score.points;
    }

    if (phaseName === "Semifinales") {
    users[playerKey].semifinales += score.points;
    }

    if (score.exact) {
      users[playerKey].exactos += 1;
    }

    if (score.winner) {
      users[playerKey].ganadores += 1;
    }

    users[playerKey].goles += score.goals || 0;
  };

  predictionsGroups.forEach((prediction) => {
    const match = MATCHES.find((item) => item.id === prediction.matchId);
    addScore(prediction, match, results[prediction.matchId], "Fase de grupos");
  });

  predictions16.forEach((prediction) => {
    const match = MATCHES16.find((item) => item.id === prediction.matchId);
    addScore(prediction, match, results16[prediction.matchId], "16avos");
  });

  predictions8.forEach((prediction) => {
    const match = MATCHES8.find((item) => item.id === prediction.matchId);
    addScore(prediction, match, results8[prediction.matchId], "8vos");
  });

  predictions4.forEach((prediction) => {
    const match = MATCHES4.find((item) => item.id === prediction.matchId);
    addScore(prediction, match, results4[prediction.matchId], "Cuartos");
  });

  predictions6.forEach((prediction) => {
    const match = MATCHES6.find((item) => item.id === prediction.matchId);
    addScore(prediction, match, results4[prediction.matchId], "Semifinales");
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
          <th>Total</th>
          <th>Grupos</th>
          <th>16avos</th>
          <th>8vos</th>
          <th>Cuartos</th>
          <th>Semifinales</th>
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
            <td>${r.grupos}</td>
            <td>${r.dieciseisavos}</td>
            <td>${r.octavos}</td>
            <td>${r.cuartos}</td>
            <td>${r.semifinales}</td>
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
  $("rankingOfficialTable").innerHTML =
    '<p class="note">Calculando ranking oficial...</p>';

  const rows = await buildScores(null, true);

  if (rows.length === 0) {
    $("rankingOfficialTable").innerHTML = `
      <div class="rules-text">
        <p class="note">
          Aún no hay puntos oficiales acumulados a partir del sábado 13 de junio de 2026.
        </p>
      </div>
    `;
    return;
  }

  $("rankingOfficialTable").innerHTML = `
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Jugador</th>
          <th>Puntos Oficiales</th>
          <th>Puntos Fase de Grupos</th>
          <th>16avos</th>
          <th>8vos</th>
          <th>Cuartos</th>
           <th>Semifinales</th>
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
            <td>${r.grupos}</td>
            <td>${r.dieciseisavos}</td>
            <td>${r.octavos}</td>
            <td>${r.cuartos}</td>
            <td>${r.semifinales}</td>
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
          <th>Grupos</th>
          <th>16avos</th>
          <th>8vos</th>
          <th>Cuartos</th>
          <th>Semifinales</th>
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
            <td>${r.grupos}</td>
            <td>${r.dieciseisavos}</td>
            <td>${r.octavos}</td>
            <td>${r.cuartos}</td>
            <td>${r.semifinales}</td>
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

  if (tabId === "dieciseisavos") {
    await renderDieciseisavos();
  }

  if (tabId === "octavos") {
    await renderOctavos();
  }

  if (tabId === "cuartos") {
  await renderCuartos();
  }

  if (tabId === "semifinales") {
  await renderCuartos();
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

  if (tabId === "rankingOficial") {
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

function showNoticeModal() {
  const noticeModal = $("noticeModal");

  if (noticeModal) {
    noticeModal.style.display = "flex";
  }
}

function hideNoticeModal() {
  const noticeModal = $("noticeModal");

  if (noticeModal) {
    noticeModal.style.display = "none";
  }
}

const closeNoticeBtn = $("closeNoticeBtn");

if (closeNoticeBtn) {
  closeNoticeBtn.onclick = hideNoticeModal;
}

onAuthStateChanged(auth, async (user) => {
  currentUser = user;

  const loginBox = $("loginBox");
  const welcomeUser = $("welcomeUser");
  const userInfo = $("userInfo");

  resultsLoaded = false;
  results16Loaded = false;
  results8Loaded = false;
  results4Loaded = false;
  results6Loaded = false;

  userPredictionsLoaded = false;
  userPredictions16Loaded = false;
  userPredictions8Loaded = false;
  userPredictions4Loaded = false;
  userPredictions6Loaded = false;

  userPredictions = {};
  userPredictions16 = {};
  userPredictions8 = {};
  userPredictions4 = {};
  userPredictions6 = {};

  allPredictionsCache = null;
  allPredictions16Cache = null;
  allPredictions8Cache = null;
  allPredictions4Cache = null;
  allPredictions6Cache = null;

  results = {};
  results16 = {};
  results8 = {};
  results4 = {};
  results6 = {};

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

    showNoticeModal();
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

    hideNoticeModal();
  }

  await renderActiveTab();
});
