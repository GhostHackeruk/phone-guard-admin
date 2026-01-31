import { auth, db } from "./firebase.js";

import {
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

import {
  doc, getDoc, setDoc, updateDoc, addDoc,
  collection, query, where, orderBy, limit, getDocs,
  runTransaction, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/* ========= UI ========= */
const $ = (id) => document.getElementById(id);

const loginCard = $("loginCard");
const panelCard = $("panelCard");

const loginMsg = $("loginMsg");
const panelMsg = $("panelMsg");
const panelErr = $("panelErr");

function show(el){ el.classList.remove("hidden"); }
function hide(el){ el.classList.add("hidden"); }

function msgOk(text){
  $("panelMsg").textContent = text;
  show(panelMsg); hide(panelErr);
  setTimeout(()=>hide(panelMsg), 2200);
}
function msgErr(text){
  $("panelErr").textContent = text;
  show(panelErr); hide(panelMsg);
}
function msgLogin(text){
  $("loginMsg").textContent = text;
  show(loginMsg);
}

async function isAdmin(uid){
  const snap = await getDoc(doc(db, "admins", uid));
  return snap.exists();
}

/* ========= Login ========= */
$("btnLogin").addEventListener("click", async () => {
  hide(loginMsg);
  const email = $("loginEmail").value.trim();
  const pass  = $("loginPass").value;

  if(!email || !pass){ msgLogin("Email + Password দিন"); return; }

  try{
    await signInWithEmailAndPassword(auth, email, pass);
  }catch(e){
    msgLogin(e?.message || "Login failed");
  }
});

$("btnLogout").addEventListener("click", async () => {
  await signOut(auth);
});

$("btnRefresh").addEventListener("click", async ()=>{
  await refreshAll();
});

/* ========= Auth State ========= */
onAuthStateChanged(auth, async (user) => {
  hide(loginMsg); hide(panelMsg); hide(panelErr);

  if(!user){
    show(loginCard); hide(panelCard);
    return;
  }

  // admin check
  const ok = await isAdmin(user.uid);
  if(!ok){
    await signOut(auth);
    show(loginCard); hide(panelCard);
    msgLogin("আপনি admin না। Firestore এ admins/{UID} doc নেই।");
    return;
  }

  // admin panel show
  hide(loginCard); show(panelCard);
  $("adminInfo").textContent = `Admin: ${user.email || ""} • UID: ${user.uid}`;

  await refreshAll();
});

/* ========= Payment Settings ========= */
$("btnLoadPay").addEventListener("click", loadPayment);
$("btnSavePay").addEventListener("click", savePayment);

async function loadPayment(){
  try{
    const ref = doc(db, "settings", "payment");
    const snap = await getDoc(ref);
    const d = snap.exists() ? snap.data() : {};

    $("bkash").value  = d.bkash  || "";
    $("nagad").value  = d.nagad  || "";
    $("rocket").value = d.rocket || "";

    msgOk("Payment loaded ✅");
  }catch(e){
    msgErr(e?.message || "Load payment failed");
  }
}

async function savePayment(){
  try{
    await setDoc(doc(db, "settings", "payment"), {
      bkash: $("bkash").value.trim(),
      nagad: $("nagad").value.trim(),
      rocket: $("rocket").value.trim(),
      updatedAt: serverTimestamp(),
      updatedBy: auth.currentUser.uid
    }, { merge:true });

    msgOk("Payment saved ✅");
  }catch(e){
    msgErr(e?.message || "Save payment failed");
  }
}

/* ========= Notifications ========= */
$("btnSendNotif").addEventListener("click", sendNotification);

async function sendNotification(){
  const toUid = $("nToUid").value.trim();
  const title = $("nTitle").value.trim();
  const body  = $("nBody").value.trim();

  if(!toUid || !title || !body){
    msgErr("To UID + Title + Message দিন");
    return;
  }

  try{
    await addDoc(collection(db, "notifications"), {
      toUid, title, body,
      read:false,
      createdAt: serverTimestamp()
    });
    msgOk("Notification sent ✅");
    $("nTitle").value=""; $("nBody").value="";
  }catch(e){
    msgErr(e?.message || "Send failed");
  }
}

/* ========= User Balance ========= */
$("btnAddBalance").addEventListener("click", ()=>balanceOp("add"));
$("btnSetBalance").addEventListener("click", ()=>balanceOp("set"));
$("uUid").addEventListener("input", previewBalance);

async function previewBalance(){
  const uid = $("uUid").value.trim();
  if(!uid){ $("uPreview").textContent = "Balance preview: -"; return; }

  try{
    const snap = await getDoc(doc(db, "users", uid));
    if(!snap.exists()){ $("uPreview").textContent = "Balance preview: user not found"; return; }
    const bal = Number(snap.data().balance || 0);
    $("uPreview").textContent = `Balance preview: ৳ ${bal}`;
  }catch{
    $("uPreview").textContent = "Balance preview: error";
  }
}

async function balanceOp(mode){
  const uid = $("uUid").value.trim();
  const amount = Number($("uAmount").value || 0);

  if(!uid){ msgErr("User UID দিন"); return; }
  if(!Number.isFinite(amount) || amount < 0){ msgErr("Amount ঠিক দিন"); return; }

  const userRef = doc(db, "users", uid);

  try{
    await runTransaction(db, async (tx)=>{
      const uSnap = await tx.get(userRef);
      if(!uSnap.exists()) throw new Error("User not found (users/"+uid+")");

      const current = Number(uSnap.data().balance || 0);
      const updated = (mode==="add") ? (current + amount) : amount;

      tx.update(userRef, { balance: updated });
    });

    msgOk(mode==="add" ? "Balance added ✅" : "Balance set ✅");
    await previewBalance();
  }catch(e){
    msgErr(e?.message || "Balance update failed");
  }
}

/* ========= Deposit Requests ========= */
async function loadDeposits(){
  const box = $("depositList");
  box.innerHTML = `<div class="item muted">Loading...</div>`;

  const qy = query(
    collection(db, "depositRequests"),
    where("status","==","pending"),
    orderBy("createdAt","desc"),
    limit(50)
  );

  const snap = await getDocs(qy);
  if(snap.empty){
    box.innerHTML = `<div class="item muted">No pending deposits</div>`;
    return;
  }

  box.innerHTML = "";
  snap.forEach((d)=>{
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
      <div class="itemHead">
        <div>
          <b>৳ ${amount} • ${method}</b>
          <small>email: ${email}</small>
          <small>userId: ${userId}</small>
          <small>last4: ${last4}</small>
          <small>status: pending</small>
        </div>
        <div class="badge">#${id.slice(0,6)}</div>
      </div>
      <div class="actions">
        <button class="pill" data-a="ap">APPROVE</button>
        <button class="pill deny" data-a="re">REJECT</button>
      </div>
    `;
    div.querySelector('[data-a="ap"]').onclick = ()=>approveDeposit(id);
    div.querySelector('[data-a="re"]').onclick = ()=>rejectDeposit(id);
    box.appendChild(div);
  });
}

async function approveDeposit(reqId){
  try{
    await runTransaction(db, async (tx)=>{
      const reqRef = doc(db, "depositRequests", reqId);
      const reqSnap = await tx.get(reqRef);
      if(!reqSnap.exists()) throw new Error("Request not found");

      const r = reqSnap.data();
      if(r.status !== "pending") throw new Error("Already processed");

      const uid = r.userId;
      const amount = Number(r.amount || 0);
      if(!uid || amount <= 0) throw new Error("Invalid request data");

      const userRef = doc(db, "users", uid);
      const uSnap = await tx.get(userRef);
      if(!uSnap.exists()) throw new Error("User not found");

      const bal = Number(uSnap.data().balance || 0);
      tx.update(userRef, { balance: bal + amount });

      tx.update(reqRef, {
        status:"approved",
        approvedAt: serverTimestamp(),
        approvedBy: auth.currentUser.uid
      });
    });

    // notification (outside tx)
    const r2 = await getDoc(doc(db,"depositRequests",reqId));
    const data = r2.data();
    if(data?.userId){
      await addDoc(collection(db,"notifications"),{
        toUid: data.userId,
        title:"Deposit Approved",
        body:`Your deposit ৳${data.amount} has been approved.`,
        read:false,
        createdAt: serverTimestamp()
      });
    }

    msgOk("Deposit approved ✅");
    await loadDeposits();
  }catch(e){
    msgErr(e?.message || "Approve failed");
  }
}

async function rejectDeposit(reqId){
  try{
    await updateDoc(doc(db,"depositRequests",reqId),{
      status:"rejected",
      rejectedAt: serverTimestamp(),
      rejectedBy: auth.currentUser.uid
    });
    msgOk("Deposit rejected ✅");
    await loadDeposits();
  }catch(e){
    msgErr(e?.message || "Reject failed");
  }
}

/* ========= Buy Now Requests ========= */
async function loadBuys(){
  const box = $("buyList");
  box.innerHTML = `<div class="item muted">Loading...</div>`;

  const qy = query(
    collection(db, "purchaseRequests"),
    where("status","==","pending"),
    orderBy("createdAt","desc"),
    limit(50)
  );

  const snap = await getDocs(qy);
  if(snap.empty){
    box.innerHTML = `<div class="item muted">No pending buy requests</div>`;
    return;
  }

  box.innerHTML = "";
  snap.forEach((d)=>{
    const r = d.data();
    const id = d.id;

    const price = Number(r.price || 0);
    const name  = r.serviceName || "-";
    const email = r.email || "-";
    const uid   = r.userId || "-";

    const div = document.createElement("div");
    div.className = "item";
    div.innerHTML = `
      <div class="itemHead">
        <div>
          <b>${name}</b>
          <small>price: ৳ ${price}</small>
          <small>email: ${email}</small>
          <small>userId: ${uid}</small>
          <small>status: pending</small>
        </div>
        <div class="badge">#${id.slice(0,6)}</div>
      </div>
      <div class="actions">
        <button class="pill" data-a="ap">APPROVE</button>
        <button class="pill deny" data-a="re">REJECT</button>
      </div>
    `;
    div.querySelector('[data-a="ap"]').onclick = ()=>approveBuy(id);
    div.querySelector('[data-a="re"]').onclick = ()=>rejectBuy(id);
    box.appendChild(div);
  });
}

async function approveBuy(reqId){
  try{
    let uid, price, serviceName;
    await runTransaction(db, async (tx)=>{
      const reqRef = doc(db, "purchaseRequests", reqId);
      const reqSnap = await tx.get(reqRef);
      if(!reqSnap.exists()) throw new Error("Request not found");

      const r = reqSnap.data();
      if(r.status !== "pending") throw new Error("Already processed");

      uid = r.userId;
      price = Number(r.price || 0);
      serviceName = r.serviceName || "Service";

      if(!uid || price <= 0) throw new Error("Invalid request data");

      const userRef = doc(db, "users", uid);
      const uSnap = await tx.get(userRef);
      if(!uSnap.exists()) throw new Error("User not found");

      const bal = Number(uSnap.data().balance || 0);
      if(bal < price) throw new Error("Insufficient user balance");

      tx.update(userRef, { balance: bal - price });

      tx.update(reqRef, {
        status:"approved",
        approvedAt: serverTimestamp(),
        approvedBy: auth.currentUser.uid
      });
    });

    // notification
    if(uid){
      await addDoc(collection(db,"notifications"),{
        toUid: uid,
        title:"Purchase Approved",
        body:`Your order "${serviceName}" has been approved. ৳${price} deducted.`,
        read:false,
        createdAt: serverTimestamp()
      });
    }

    msgOk("Buy request approved ✅");
    await loadBuys();
  }catch(e){
    msgErr(e?.message || "Approve failed");
  }
}

async function rejectBuy(reqId){
  try{
    await updateDoc(doc(db,"purchaseRequests",reqId),{
      status:"rejected",
      rejectedAt: serverTimestamp(),
      rejectedBy: auth.currentUser.uid
    });
    msgOk("Buy request rejected ✅");
    await loadBuys();
  }catch(e){
    msgErr(e?.message || "Reject failed");
  }
}

/* ========= Refresh All ========= */
async function refreshAll(){
  await loadPayment();
  await previewBalance();
  await loadDeposits();
  await loadBuys();
        }
