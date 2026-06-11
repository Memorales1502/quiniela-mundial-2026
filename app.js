import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, getDocs, collection, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { firebaseConfig, ADMIN_EMAILS } from "./firebase-config.js";
import { MATCHES } from "./matches.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
let currentUser = null;
let results = {};

const $ = (id)=>document.getElementById(id);
const outcome = (h,a)=> h===a ? "E" : h>a ? "H" : "A";
const scorePoints = (p,r)=>{
  if(!p || r.homeScore === undefined || r.awayScore === undefined) return 0;
  const ph=Number(p.homeScore), pa=Number(p.awayScore), rh=Number(r.homeScore), ra=Number(r.awayScore);
  if(ph===rh && pa===ra) return 5;
  let pts = outcome(ph,pa) === outcome(rh,ra) ? 3 : 0;
  if(pts && (ph-pa)===(rh-ra)) pts += 1;
  return pts;
};
const isLocked = (m)=> {
  const hasResult = results[m.id]?.homeScore !== undefined;
  const kickoff = new Date(`${m.date}T${m.time || "00:00"}:00-06:00`);
  return hasResult || Date.now() >= kickoff.getTime();
};

async function loadResults(){
  results = {};
  const snap = await getDocs(collection(db,"results"));
  snap.forEach(d=> results[d.id]=d.data());
}
async function getPrediction(matchId){
  if(!currentUser) return null;
  const ref = doc(db,"predictions",`${currentUser.uid}_${matchId}`);
  const snap = await getDoc(ref);
  return snap.exists()?snap.data():null;
}
async function savePrediction(match){
  if(!currentUser) return alert("Ingresa primero.");
  if(isLocked(match)) return alert("Este partido ya está bloqueado.");
  const h = $(`ph_${match.id}`).value, a = $(`pa_${match.id}`).value;
  if(h===""||a==="") return alert("Coloca ambos marcadores.");
  await setDoc(doc(db,"predictions",`${currentUser.uid}_${match.id}`),{
    uid: currentUser.uid, email: currentUser.email, matchId: match.id,
    homeScore:Number(h), awayScore:Number(a), updatedAt:serverTimestamp()
  });
  renderAll();
}
async function saveResult(match){
  if(!ADMIN_EMAILS.includes(currentUser?.email)) return alert("No tienes permiso de administrador.");
  const h = $(`rh_${match.id}`).value, a = $(`ra_${match.id}`).value;
  if(h===""||a==="") return alert("Coloca resultado final.");
  await setDoc(doc(db,"results",match.id),{
    matchId: match.id, homeScore:Number(h), awayScore:Number(a), updatedAt:serverTimestamp(), admin:currentUser.email
  });
  await loadResults(); renderAll();
}
function card(match, pred){
  const locked = isLocked(match);
  const res = results[match.id];
  return `<article class="match-card">
    <div><div class="teams">${match.home} vs ${match.away}</div><div class="meta">${match.date} ${match.time || ""} · Grupo ${match.group} · ${match.venue}</div></div>
    <div>${res?`Resultado: <b>${res.homeScore}-${res.awayScore}</b>`:"Resultado pendiente"}<br>${locked?'<span class="locked">Bloqueado</span>':'<span class="ok">Abierto</span>'}</div>
    <div class="score-inputs"><input id="ph_${match.id}" type="number" min="0" value="${pred?.homeScore ?? ""}" ${locked?'disabled':''}> - <input id="pa_${match.id}" type="number" min="0" value="${pred?.awayScore ?? ""}" ${locked?'disabled':''}><button data-save="${match.id}" ${locked?'disabled':''}>Guardar</button></div>
  </article>`;
}
async function renderQuiniela(){
  const html=[];
  for(const m of MATCHES) html.push(card(m, await getPrediction(m.id)));
  $("matchesList").innerHTML=html.join("");
  MATCHES.forEach(m=> document.querySelector(`[data-save="${m.id}"]`)?.addEventListener("click",()=>savePrediction(m)));
}
function renderResults(){
  $("resultsList").innerHTML = MATCHES.map(m=>{
    const r=results[m.id];
    return `<article class="match-card"><div><div class="teams">${m.home} vs ${m.away}</div><div class="meta">${m.date} · Grupo ${m.group}</div></div><div>${r?`Final: <b>${r.homeScore}-${r.awayScore}</b>`:"Pendiente"}</div></article>`
  }).join("");
}
function renderAdmin(){
  if(!ADMIN_EMAILS.includes(currentUser?.email)){ $("adminList").innerHTML='<p class="note">Ingresa con un correo administrador.</p>'; return; }
  $("adminList").innerHTML=MATCHES.map(m=>`<article class="match-card"><div><div class="teams">${m.home} vs ${m.away}</div><div class="meta">${m.date} · ${m.venue}</div></div><div class="score-inputs"><input id="rh_${m.id}" type="number" min="0" value="${results[m.id]?.homeScore ?? ""}"> - <input id="ra_${m.id}" type="number" min="0" value="${results[m.id]?.awayScore ?? ""}"><button data-result="${m.id}">Guardar resultado</button></div></article>`).join("");
  MATCHES.forEach(m=> document.querySelector(`[data-result="${m.id}"]`)?.addEventListener("click",()=>saveResult(m)));
}
async function buildScores(dateFilter=null){
  const predSnap = await getDocs(collection(db,"predictions"));
  const users = {};
  predSnap.forEach(d=>{
    const p=d.data(); const m=MATCHES.find(x=>x.id===p.matchId);
    if(!m || (dateFilter && m.date!==dateFilter)) return;
    users[p.email] ??= {email:p.email, pts:0, exactos:0};
    const pts=scorePoints(p,results[p.matchId]); users[p.email].pts+=pts; if(pts===5) users[p.email].exactos++;
  });
  return Object.values(users).sort((a,b)=>b.pts-a.pts || b.exactos-a.exactos);
}
async function renderRanking(){
  const rows=await buildScores();
  $("rankingTable").innerHTML=`<table><thead><tr><th>#</th><th>Jugador</th><th>Puntos</th><th>Exactos</th></tr></thead><tbody>${rows.map((r,i)=>`<tr><td>${i+1}</td><td>${r.email}</td><td>${r.pts}</td><td>${r.exactos}</td></tr>`).join("")}</tbody></table>`;
}
async function renderDaily(){
  const date=$("dailyDate").value || new Date().toISOString().slice(0,10);
  $("dailyDate").value=date;
  const rows=await buildScores(date);
  $("dailyTable").innerHTML=`<table><thead><tr><th>#</th><th>Jugador</th><th>Puntos del día</th></tr></thead><tbody>${rows.map((r,i)=>`<tr><td>${i+1}</td><td>${r.email}</td><td>${r.pts}</td></tr>`).join("")}</tbody></table>`;
}
async function renderAll(){ await loadResults(); await renderQuiniela(); renderResults(); renderAdmin(); await renderRanking(); await renderDaily(); }

document.querySelectorAll(".tabs button").forEach(btn=>btn.addEventListener("click",()=>{document.querySelectorAll(".tabs button,.tab").forEach(x=>x.classList.remove("active"));btn.classList.add("active");$(btn.dataset.tab).classList.add("active");}));
$("loginBtn").onclick=async()=>{try{await signInWithEmailAndPassword(auth,$("email").value,$("password").value)}catch{await createUserWithEmailAndPassword(auth,$("email").value,$("password").value)}};
$("logoutBtn").onclick=()=>signOut(auth);
$("loadDaily").onclick=renderDaily;
onAuthStateChanged(auth, async user=>{ currentUser=user; $("userInfo").textContent=user?`Sesión: ${user.email}`:"Sin sesión"; await renderAll(); });
