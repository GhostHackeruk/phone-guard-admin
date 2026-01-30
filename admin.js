import { auth, db } from "./firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";
import {
  doc, getDoc, collection, query, where, orderBy, limit, getDocs,
  updateDoc, serverTimestamp, runTransaction, setDoc
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";

const $ = (id) => document.getElementById(id);

const adminEmailEl = $("adminEmail");
const depositListEl = $("depositList");
const msgEl = $("msg");

const refreshBtn = $("refreshBtn");
const logoutBtn = $("logoutBtn");

const bkashEl = $("bkash");
const nagadEl = $("nagad");
const rocketEl = $("rocket");
const loadSettingsBtn = $("loadSettingsBtn");
const saveSettingsBtn = $("saveSettingsBtn");

function showMsg(text, isErr=false){
  msgEl.textContent = text;
  msgEl.classList.add("show");
  msgEl.classList.toggle("err", isErr);
  setTimeout(()=> msgEl.classList.remove("show"), 4000);
}

async function requireAdmin(user){
  // admins/{uid} exists হলে admin
  const adminRef = doc(db, "admins", user.uid);
  const snap = await getDoc(adminRef);
  if(!snap.exists()){
    // admin না হলে home এ পাঠিয়ে দাও
    location.href = "home.html";
    return false;
  }
  return true;
}

function fmtBDT(n){
  try { return "৳ " + Number(n || 0).toLocaleString("en-US"); }
  catch { return "৳ " + (n || 0); }
}

function tag(status){
  const s = (status || "pending").toLowerCase();
  if(s === "approved") return `<span class="tag tagApproved">approved</span>`;
  if(s === "rejected") return `<span class="tag tagRejected">rejected</span>`;
  return `<span class="tag tagPending">pending</span>`;
}

async function loadDeposits(){
  depositListEl.innerHTML = `<div class="small">Loading...</div>`;

  // pending depositRequests
  const qy = query(
    collection(db, "depositRequests"),
    where("status", "==", "pending"),
    orderBy("createdAt", "desc"),
    limit(50)
  );

  const snap = await getDocs(qy);
  if(snap.empty){
    depositListEl.innerHTML = `<div class="small">No pending requests.</div>`;
    return;
  }

  depositListEl.innerHTML = snap.docs.map(d => {
    const r = d.data();
    return `
      <div class="item">
        <div class="itemTop">
          <div>
            <b style="color:var(--neon);letter-spacing:.06em">${fmtBDT(r.amount)}</b>
            <div class="small">method: <span class="mono">${r.method || "-"}</span> • last4: <span class="mono">${r.last4 || "-"}</span></div>
            <div class="small">userId: <span class="mono">${r.userId || "-"}</span></div>
            <div class="small">email: <span class="mono">${r.email || "-"}</span></div>
          </div>
          <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
            ${tag(r.status)}
            <button class="btn" data-act="approve" data-id="${d.id}">Approve</button>
            <button class="btn btnDanger" data-act="reject" data-id="${d.id}">Reject</button>
          </div>
        </div>
      </div>
    `;
  }).join("");
}

async function approveDeposit(docId){
  const reqRef = doc(db, "depositRequests", docId);

  await runTransaction(db, async (tx) => {
    const reqSnap = await tx.get(reqRef);
    if(!reqSnap.exists()) throw new Error("Request not found");

    const req = reqSnap.data();
    if((req.status || "pending") !== "pending") throw new Error("Already processed");

    const uid = req.userId;
    if(!uid) throw new Error("Missing userId");

    const userRef = doc(db, "users", uid);
    const userSnap = await tx.get(userRef);
    if(!userSnap.exists()) throw new Error("User doc not found");

    const oldBal = Number(userSnap.data().balance || 0);
    const amt = Number(req.amount || 0);
    if(!(amt > 0)) throw new Error("Invalid amount");

    // update user balance
    tx.update(userRef, { balance: oldBal + amt });

    // update request
    tx.update(reqRef, {
      status: "approved",
      approvedAt: serverTimestamp()
    });
  });

  showMsg("Approved ✅ Balance updated.");
  await loadDeposits();
}

async function rejectDeposit(docId){
  const reqRef = doc(db, "depositRequests", docId);
  await updateDoc(reqRef, {
    status: "rejected",
    rejectedAt: serverTimestamp()
  });
  showMsg("Rejected ✅");
  await loadDeposits();
}

async function loadSettings(){
  const ref = doc(db, "settings", "payment");
  const snap = await getDoc(ref);
  if(!snap.exists()){
    // create default if missing
    await setDoc(ref, { bkash:"", nagad:"", rocket:"" }, { merge:true });
  }
  const data = (await getDoc(ref)).data() || {};
  bkashEl.value = data.bkash || "";
  nagadEl.value = data.nagad || "";
  rocketEl.value = data.rocket || "";
  showMsg("Settings loaded ✅");
}

async function saveSettings(){
  const ref = doc(db, "settings", "payment");
  await setDoc(ref, {
    bkash: bkashEl.value.trim(),
    nagad: nagadEl.value.trim(),
    rocket: rocketEl.value.trim(),
    updatedAt: serverTimestamp()
  }, { merge:true });

  showMsg("Settings saved ✅");
}

depositListEl.addEventListener("click", async (e) => {
  const btn = e.target.closest("button");
  if(!btn) return;
  const act = btn.dataset.act;
  const id = btn.dataset.id;
  if(!act || !id) return;

  btn.disabled = true;
  try{
    if(act === "approve") await approveDeposit(id);
    if(act === "reject") await rejectDeposit(id);
  }catch(err){
    console.error(err);
    showMsg(err.message || "Action failed", true);
  }finally{
    btn.disabled = false;
  }
});

refreshBtn.addEventListener("click", async () => {
  try { await loadDeposits(); }
  catch(e){ showMsg("Refresh failed", true); }
});

logoutBtn.addEventListener("click", async () => {
  await signOut(auth);
  location.href = "index.html";
});

loadSettingsBtn.addEventListener("click", async () => {
  try{ await loadSettings(); }
  catch(e){ console.error(e); showMsg("Load settings failed", true); }
});

saveSettingsBtn.addEventListener("click", async () => {
  try{ await saveSettings(); }
  catch(e){ console.error(e); showMsg("Save settings failed", true); }
});

onAuthStateChanged(auth, async (user) => {
  if(!user){
    location.href = "index.html";
    return;
  }
  adminEmailEl.textContent = user.email || user.uid;

  try{
    const ok = await requireAdmin(user);
    if(!ok) return;
    await loadDeposits();
    await loadSettings();
  }catch(e){
    console.error(e);
    showMsg("Admin check failed", true);
    location.href = "home.html";
  }
});
