import { auth, db } from "./firebase.js";
import {
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";

import {
  doc, getDoc, setDoc, serverTimestamp,
  collection, query, where, orderBy, limit, getDocs,
  runTransaction
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";

/* ---------- UI helpers ---------- */
const $ = (id) => document.getElementById(id);

const loginCard = $("loginCard");
const dashCard = $("dashCard");
const depositCard = $("depositCard");
const settingsCard = $("settingsCard");

const loginErr = $("loginErr");
const dashErr  = $("dashErr");
const dashOk   = $("dashOk");

function show(el){ el.classList.remove("hide"); }
function hide(el){ el.classList.add("hide"); }

function showErr(box, msg){
  box.style.display = "block";
  box.textContent = msg;
}
function hideErr(box){
  box.style.display = "none";
  box.textContent = "";
}
function showOk(box, msg){
  box.style.display = "block";
  box.textContent = msg;
  setTimeout(()=>{ box.style.display="none"; box.textContent=""; }, 2500);
}

function fmtBDT(n){
  const x = Number(n || 0);
  return "৳ " + x.toLocaleString("en-US");
}

/* ---------- Admin check (must: admins/{uid}) ---------- */
async function isAdminUid(uid){
  const snap = await getDoc(doc(db, "admins", uid));
  return snap.exists();
}

/* ---------- Login ---------- */
$("loginBtn").addEventListener("click", async () => {
  hideErr(loginErr);

  const email = $("email").value.trim();
  const pass  = $("pass").value;

  if(!email || !pass){
    return showErr(loginErr, "Email এবং Password দিন");
  }

  try{
    await signInWithEmailAndPassword(auth, email, pass);
    // onAuthStateChanged will handle UI
  }catch(e){
    showErr(loginErr, e?.message || "Login failed");
  }
});

/* ---------- Logout ---------- */
$("logoutBtn").addEventListener("click", async () => {
  await signOut(auth);
});

/* ---------- Refresh ---------- */
$("refreshBtn").addEventListener("click", async () => {
  hideErr(dashErr);
  await loadAll();
});

/* ---------- Deposits list ---------- */
async function loadPendingDeposits(){
  const reqList = $("reqList");
  reqList.innerHTML = `<div class="muted">Loading...</div>`;

  const qy = query(
    collection(db, "depositRequests"),
    where("status", "==", "pending"),
    orderBy("createdAt", "desc"),
    limit(50)
  );

  const snap = await getDocs(qy);

  if(snap.empty){
    reqList.innerHTML = `<div class="muted">No pending requests</div>`;
    return;
  }

  reqList.innerHTML = "";

  snap.forEach((d) => {
    const r = d.data();
    const id = d.id;

    const amount = Number(r.amount || 0);
    const method = r.method || "-";
    const last4  = r.last4 || "-";
    const email  = r.email || "-";
    const userId = r.userId || "-";

    const div = document.createElement("div");
    div.className = "item";
    div.innerHTML = `
      <div class="itemTop">
        <div>
          <b>${fmtBDT(amount)} • ${method}</b>
          <small>email: ${email}</small>
          <small>last4: ${last4}</small>
          <small>userId: ${userId}</small>
          <small>status: pending</small>
        </div>
        <div class="badge">#${id.slice(0,6)}</div>
      </div>

      <div class="actions">
        <button class="pill" data-act="approve" data-id="${id}">Approve</button>
        <button class="pill deny" data-act="reject" data-id="${id}">Reject</button>
      </div>
    `;

    div.addEventListener("click", async (ev) => {
      const btn = ev.target?.closest("button");
      if(!btn) return;

      const act = btn.dataset.act;
      const reqId = btn.dataset.id;

      btn.disabled = true;
      try{
        if(act === "approve") await approveDeposit(reqId);
        if(act === "reject")  await rejectDeposit(reqId);
      }catch(e){
        showErr(dashErr, e?.message || "Action failed");
      }finally{
        btn.disabled = false;
      }
    });

    reqList.appendChild(div);
  });
}

/* ---------- Approve / Reject (transaction) ---------- */
async function approveDeposit(reqId){
  hideErr(dashErr);

  await runTransaction(db, async (tx) => {
    const reqRef = doc(db, "depositRequests", reqId);
    const reqSnap = await tx.get(reqRef);
    if(!reqSnap.exists()) throw new Error("Request not found");

    const r = reqSnap.data();
    if((r.status || "pending") !== "pending") throw new Error("Already processed");

    const userId = r.userId;
    const amount = Number(r.amount || 0);
    if(!userId) throw new Error("userId missing");
    if(!amount || amount <= 0) throw new Error("amount invalid");

    const userRef = doc(db, "users", userId);
    const userSnap = await tx.get(userRef);
    if(!userSnap.exists()) throw new Error("User doc not found (users/{uid})");

    const prevBal = Number(userSnap.data().balance || 0);
    tx.update(userRef, { balance: prevBal + amount });

    tx.update(reqRef, {
      status: "approved",
      approvedAt: serverTimestamp(),
      approvedBy: auth.currentUser.uid
    });
  });

  showOk(dashOk, "Approved ✅ Balance updated");
  await loadPendingDeposits();
}

async function rejectDeposit(reqId){
  hideErr(dashErr);

  await runTransaction(db, async (tx) => {
    const reqRef = doc(db, "depositRequests", reqId);
    const reqSnap = await tx.get(reqRef);
    if(!reqSnap.exists()) throw new Error("Request not found");

    const r = reqSnap.data();
    if((r.status || "pending") !== "pending") throw new Error("Already processed");

    tx.update(reqRef, {
      status: "rejected",
      rejectedAt: serverTimestamp(),
      rejectedBy: auth.currentUser.uid
    });
  });

  showOk(dashOk, "Rejected ✅");
  await loadPendingDeposits();
}

/* ---------- Settings: settings/payment ---------- */
async function loadSettings(){
  hideErr($("setErr"));

  const ref = doc(db, "settings", "payment");
  const snap = await getDoc(ref);

  if(!snap.exists()){
    $("bkash").value = "";
    $("nagad").value = "";
    $("rocket").value = "";
    return;
  }

  const d = snap.data() || {};
  $("bkash").value  = d.bkash  || "";
  $("nagad").value  = d.nagad  || "";
  $("rocket").value = d.rocket || "";
}

async function saveSettings(){
  hideErr($("setErr"));

  try{
    await setDoc(doc(db, "settings", "payment"), {
      bkash: $("bkash").value.trim(),
      nagad: $("nagad").value.trim(),
      rocket: $("rocket").value.trim(),
      updatedAt: serverTimestamp(),
      updatedBy: auth.currentUser.uid
    }, { merge:true });

    showOk($("setOk"), "Saved ✅");
  }catch(e){
    showErr($("setErr"), e?.message || "Save failed");
  }
}

$("loadSetBtn").addEventListener("click", loadSettings);
$("saveSetBtn").addEventListener("click", saveSettings);

/* ---------- Main load ---------- */
async function loadAll(){
  await loadPendingDeposits();
  await loadSettings();
}

/* ---------- Auth state ---------- */
onAuthStateChanged(auth, async (user) => {
  hideErr(loginErr);
  hideErr(dashErr);

  if(!user){
    show(loginCard);
    hide(dashCard); hide(depositCard); hide(settingsCard);
    $("who").textContent = "Not logged in";
    return;
  }

  // Verify admin by UID document
  const ok = await isAdminUid(user.uid);
  if(!ok){
    await signOut(auth);
    showErr(loginErr, "আপনি Admin নন।\nFirestore এ admins/{UID} document ঠিক করুন।");
    show(loginCard);
    hide(dashCard); hide(depositCard); hide(settingsCard);
    return;
  }

  // Admin OK
  hide(loginCard);
  show(dashCard); show(depositCard); show(settingsCard);
  $("who").textContent = `Admin: ${user.email} • UID: ${user.uid.slice(0,8)}...`;

  await loadAll();
});
