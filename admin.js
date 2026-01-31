import { auth, db } from "./firebase.js";

import {
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  addDoc,
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  serverTimestamp,
  increment,
  runTransaction
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ---------------- UI helpers ----------------
const $ = (id) => document.getElementById(id);
const show = (el) => el.classList.remove("hide");
const hide = (el) => el.classList.add("hide");

function showErr(msg, where = "dashErr") {
  const el = $(where);
  el.textContent = String(msg || "Unknown error");
  show(el);
  if (where !== "loginMsg") hide($("dashMsg"));
}
function showOk(msg) {
  $("dashMsg").textContent = String(msg || "Done");
  show($("dashMsg"));
  hide($("dashErr"));
}
function clearMsgs() {
  hide($("loginMsg"));
  hide($("dashErr"));
  hide($("dashMsg"));
}

// ---------------- Admin check ----------------
async function isAdmin(uid) {
  const ref = doc(db, "admins", uid);
  const snap = await getDoc(ref);
  return snap.exists(); // you can check snap.data().role === "active" if you want
}

// ---------------- Auth UI ----------------
$("btnLogin").addEventListener("click", async () => {
  clearMsgs();
  const email = $("loginEmail").value.trim();
  const pass = $("loginPass").value.trim();

  if (!email || !pass) {
    showErr("Email + Password দিন", "loginMsg");
    return;
  }

  try {
    await signInWithEmailAndPassword(auth, email, pass);
    // onAuthStateChanged will handle next
  } catch (e) {
    showErr(`Login failed: ${e?.message || e}`, "loginMsg");
  }
});

$("btnLogout").addEventListener("click", async () => {
  clearMsgs();
  await signOut(auth);
});

$("btnRefresh").addEventListener("click", async () => {
  clearMsgs();
  await loadAll();
  showOk("Refreshed ✅");
});
onAuthStateChanged(auth, async (user) => {
  clearMsgs();

  if (!user) {
    // Logged out
    show($("loginCard"));
    hide($("dash"));
    return;
  }

  // Logged in → check admin
  try {
    const ok = await isAdmin(user.uid);
    if (!ok) {
      await signOut(auth);
      showErr("এই account admin না। Firestore এ admins/{UID} document create করো।", "loginMsg");
      show($("loginCard"));
      hide($("dash"));
      return;
    }

    // Admin OK
    hide($("loginCard"));
    show($("dash"));
    $("adminBadge").textContent = `Admin: ${user.email} • UID: ${user.uid.slice(0, 8)}…`;

    await loadAll();
    showOk("Admin verified ✅ Dashboard loaded");
  } catch (e) {
    showErr(e?.message || e, "loginMsg");
    await signOut(auth);
  }
});

// ---------------- Data loaders ----------------
async function loadAll() {
  await Promise.all([
    loadPayments(),
    loadDepositRequests(),
    loadPurchaseRequests()
  ]);
}

// ---------------- Payments settings ----------------
async function loadPayments() {
  const ref = doc(db, "settings", "payment");
  const snap = await getDoc(ref);
  const data = snap.exists() ? snap.data() : {};
  $("bkash").value = data.bkash || "";
  $("nagad").value = data.nagad || "";
  $("rocket").value = data.rocket || "";
}

$("btnLoadPay").addEventListener("click", async () => {
  clearMsgs();
  await loadPayments();
  showOk("Payments loaded ✅");
});

$("btnSavePay").addEventListener("click", async () => {
  clearMsgs();
  try {
    const ref = doc(db, "settings", "payment");
    await setDoc(ref, {
      bkash: $("bkash").value.trim(),
      nagad: $("nagad").value.trim(),
      rocket: $("rocket").value.trim(),
      updatedAt: serverTimestamp()
    }, { merge: true });

    showOk("Payments saved ✅");
  } catch (e) {
    showErr(e?.message || e);
  }
});

// ---------------- User balance tools ----------------
$("btnGetBalance").addEventListener("click", async () => {
  clearMsgs();
  const uid = $("uidBalance").value.trim();
  if (!uid) return showErr("User UID দিন");
  try {
    const snap = await getDoc(doc(db, "users", uid));
    const bal = snap.exists() ? (snap.data().balance || 0) : 0;
    showOk(`Balance: ৳ ${bal}`);
  } catch (e) {
    showErr(e?.message || e);
  }
});
$("btnAddBalance").addEventListener("click", async () => {
  clearMsgs();
  const uid = $("uidBalance").value.trim();
  const amt = Number($("amountBalance").value);
  if (!uid) return showErr("User UID দিন");
  if (!Number.isFinite(amt) || amt <= 0) return showErr("Valid amount দিন");

  try {
    await runTransaction(db, async (tx) => {
      const uref = doc(db, "users", uid);
      const usnap = await tx.get(uref);
      if (!usnap.exists()) {
        tx.set(uref, { balance: 0, createdAt: serverTimestamp() }, { merge: true });
      }
      tx.set(uref, { balance: increment(amt), updatedAt: serverTimestamp() }, { merge: true });
    });

    showOk(`Added ৳${amt} ✅`);
  } catch (e) {
    showErr(e?.message || e);
  }
});

$("btnSetBalance").addEventListener("click", async () => {
  clearMsgs();
  const uid = $("uidBalance").value.trim();
  const amt = Number($("amountBalance").value);
  if (!uid) return showErr("User UID দিন");
  if (!Number.isFinite(amt) || amt < 0) return showErr("Valid amount দিন");

  try {
    await setDoc(doc(db, "users", uid), {
      balance: amt,
      updatedAt: serverTimestamp()
    }, { merge: true });

    showOk(`Set balance = ৳${amt} ✅`);
  } catch (e) {
    showErr(e?.message || e);
  }
});

// ---------------- Deposit requests ----------------
// Expected: depositRequests docs like { userId, amount, status: "pending"|"approved", createdAt }
async function loadDepositRequests() {
  const tbody = $("depositTbody");
  tbody.innerHTML = `<tr><td colspan="5" class="muted">Loading...</td></tr>`;

  const q = query(
    collection(db, "depositRequests"),
    where("status", "==", "pending"),
    orderBy("createdAt", "desc"),
    limit(50)
  );

  const snap = await getDocs(q);
  if (snap.empty) {
    tbody.innerHTML = `<tr><td colspan="5" class="muted">No pending deposit requests ✅</td></tr>`;
    return;
  }
  tbody.innerHTML = "";
  snap.forEach((d) => {
    const r = d.data();
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${d.id}</td>
      <td>${r.userId || "-"}</td>
      <td>৳ ${r.amount ?? "-"}</td>
      <td><span class="pill">${r.status || "-"}</span></td>
      <td class="actions">
        <button class="btn mini" data-approve-deposit="${d.id}">Approve</button>
        <button class="btn danger mini" data-reject-deposit="${d.id}">Reject</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  // bind actions
  tbody.querySelectorAll("[data-approve-deposit]").forEach((btn) => {
    btn.addEventListener("click", () => approveDeposit(btn.dataset.approveDeposit));
  });
  tbody.querySelectorAll("[data-reject-deposit]").forEach((btn) => {
    btn.addEventListener("click", () => rejectDeposit(btn.dataset.rejectDeposit));
  });
}

async function approveDeposit(reqId) {
  clearMsgs();
  try {
    await runTransaction(db, async (tx) => {
      const dref = doc(db, "depositRequests", reqId);
      const dsnap = await tx.get(dref);
      if (!dsnap.exists()) throw new Error("Deposit request not found");
      const data = dsnap.data();
      if (data.status !== "pending") throw new Error("Already processed");

      const uid = data.userId;
      const amt = Number(data.amount || 0);
      if (!uid || !Number.isFinite(amt) || amt <= 0) throw new Error("Invalid request data");

      const uref = doc(db, "users", uid);
      const usnap = await tx.get(uref);
      if (!usnap.exists()) tx.set(uref, { balance: 0, createdAt: serverTimestamp() }, { merge: true });

      tx.set(uref, { balance: increment(amt), updatedAt: serverTimestamp() }, { merge: true });
      tx.set(dref, { status: "approved", approvedAt: serverTimestamp() }, { merge: true });
    });

    // notify user
    await addDoc(collection(db, "notifications"), {
      userId: (await getDoc(doc(db, "depositRequests", reqId))).data().userId,
      type: "deposit",
      message: `Deposit approved ✅`,
      read: false,
      createdAt: serverTimestamp()
    });

    await loadDepositRequests();
    showOk("Deposit approved ✅");
  } catch (e) {
    showErr(e?.message || e);
  }
}

async function rejectDeposit(reqId) {
  clearMsgs();
  try {
    await updateDoc(doc(db, "depositRequests", reqId), {
      status: "rejected",
      rejectedAt: serverTimestamp()
    });
    await loadDepositRequests();
    showOk("Deposit rejected ✅");
  } catch (e) {
    showErr(e?.message || e);
  }
}
// ---------------- Purchase requests ----------------
// Expected: purchaseRequests docs like { userId, service, price, status:"pending"|"approved"|"rejected", createdAt }
async function loadPurchaseRequests() {
  const tbody = $("purchaseTbody");
  tbody.innerHTML = `<tr><td colspan="6" class="muted">Loading...</td></tr>`;

  const q = query(
    collection(db, "purchaseRequests"),
    where("status", "==", "pending"),
    orderBy("createdAt", "desc"),
    limit(50)
  );

  const snap = await getDocs(q);
  if (snap.empty) {
    tbody.innerHTML = `<tr><td colspan="6" class="muted">No pending purchase requests ✅</td></tr>`;
    return;
  }

  tbody.innerHTML = "";
  snap.forEach((d) => {
    const r = d.data();
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${d.id}</td>
      <td>${r.userId || "-"}</td>
      <td>${r.service || "-"}</td>
      <td>৳ ${r.price ?? "-"}</td>
      <td><span class="pill">${r.status || "-"}</span></td>
      <td class="actions">
        <button class="btn mini" data-approve-purchase="${d.id}">Approve</button>
        <button class="btn danger mini" data-reject-purchase="${d.id}">Reject</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll("[data-approve-purchase]").forEach((btn) => {
    btn.addEventListener("click", () => approvePurchase(btn.dataset.approvePurchase));
  });
  tbody.querySelectorAll("[data-reject-purchase]").forEach((btn) => {
    btn.addEventListener("click", () => rejectPurchase(btn.dataset.rejectPurchase));
  });
}

async function approvePurchase(reqId) {
  clearMsgs();
  try {
    const ref = doc(db, "purchaseRequests", reqId);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new Error("Purchase request not found");
    const data = snap.data();
    if (data.status !== "pending") throw new Error("Already processed");

    await updateDoc(ref, { status: "approved", approvedAt: serverTimestamp() });

    await addDoc(collection(db, "notifications"), {
      userId: data.userId,
      type: "purchase",
      message: `Your purchase request is approved ✅ (Service: ${data.service || "N/A"})`,
      read: false,
      createdAt: serverTimestamp()
    });
    await loadPurchaseRequests();
    showOk("Purchase approved ✅");
  } catch (e) {
    showErr(e?.message || e);
  }
}

async function rejectPurchase(reqId) {
  clearMsgs();
  try {
    const ref = doc(db, "purchaseRequests", reqId);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new Error("Purchase request not found");
    const data = snap.data();

    await updateDoc(ref, { status: "rejected", rejectedAt: serverTimestamp() });

    await addDoc(collection(db, "notifications"), {
      userId: data.userId,
      type: "purchase",
      message: `Your purchase request is rejected ❌ (Service: ${data.service || "N/A"})`,
      read: false,
      createdAt: serverTimestamp()
    });

    await loadPurchaseRequests();
    showOk("Purchase rejected ✅");
  } catch (e) {
    showErr(e?.message || e);
  }
}

// ---------------- Manual notifications ----------------
$("btnSendNotif").addEventListener("click", async () => {
  clearMsgs();
  const uid = $("notifyUid").value.trim();
  const msg = $("notifyMsg").value.trim();
  if (!uid) return showErr("User UID দিন");
  if (!msg) return showErr("Message লিখো");

  try {
    await addDoc(collection(db, "notifications"), {
      userId: uid,
      type: "admin",
      message: msg,
      read: false,
      createdAt: serverTimestamp()
    });

    $("notifyMsg").value = "";
    showOk("Notification sent ✅");
  } catch (e) {
    showErr(e?.message || e);
  }
});
