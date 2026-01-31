// admin.js
import { auth, db } from "./firebase.js";

import {
  setPersistence,
  browserLocalPersistence,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

import {
  doc, getDoc, setDoc, updateDoc, collection, addDoc,
  serverTimestamp, query, where, limit, getDocs, orderBy,
  runTransaction
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/* ----------------- helpers ----------------- */
const $ = (id) => document.getElementById(id);

function ok(el, msg) {
  el.classList.remove("err");
  el.innerText = msg;
}
function err(el, msg) {
  el.classList.add("err");
  el.innerText = msg;
}
function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

async function isAdmin(uid) {
  const ref = doc(db, "admins", uid);
  const snap = await getDoc(ref);
  return snap.exists();
}

async function pushNotification(toUid, message) {
  await addDoc(collection(db, "notifications"), {
    toUid,
    message,
    read: false,
    createdAt: serverTimestamp()
  });
}

/* ----------------- UI refs ----------------- */
const loginCard = $("loginCard");
const dash = $("dash");

const loginEmail = $("loginEmail");
const loginPass = $("loginPass");
const btnLogin = $("btnLogin");
const btnFillDemo = $("btnFillDemo");
const loginStatus = $("loginStatus");

const adminInfo = $("adminInfo");
const btnLogout = $("btnLogout");
const btnRefresh = $("btnRefresh");

/* balance */
const uidInput = $("uidInput");
const amountInput = $("amountInput");
const btnCheckBalance = $("btnCheckBalance");
const btnAddBalance = $("btnAddBalance");
const btnSetBalance = $("btnSetBalance");
const balanceStatus = $("balanceStatus");

/* payment */
const bkashInput = $("bkashInput");
const nagadInput = $("nagadInput");
const rocketInput = $("rocketInput");
const btnLoadPayment = $("btnLoadPayment");
const btnSavePayment = $("btnSavePayment");
const paymentStatus = $("paymentStatus");

/* notification */
const notifToUid = $("notifToUid");
const notifMsg = $("notifMsg");
const btnSendNotif = $("btnSendNotif");
const notifStatus = $("notifStatus");

/* tables */
const depositTbody = $("depositTbody");
const purchaseTbody = $("purchaseTbody");
const usersTbody = $("usersTbody");

const depositStatus = $("depositStatus");
const purchaseStatus = $("purchaseStatus");
const usersStatus = $("usersStatus");

/* ----------------- auth bootstrap ----------------- */
let currentUser = null;

async function boot() {
  // ✅ auto logout issue reduce (persist login)
  try {
    await setPersistence(auth, browserLocalPersistence);
  } catch (_) {
    // ignore
  }

  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      currentUser = null;
      loginCard.classList.remove("hidden");
      dash.classList.add("hidden");
      ok(loginStatus, "Please login.");
      return;
    }

    // admin guard
    try {
      const allowed = await isAdmin(user.uid);
      if (!allowed) {
        err(loginStatus, "Access denied: not an admin. (Need admins/{uid})");
        await signOut(auth);
        return;
      }

      currentUser = user;
      loginCard.classList.add("hidden");
      dash.classList.remove("hidden");
      ok(loginStatus, "Logged in.");
      ok(adminInfo, `Admin: ${user.email || "-"} • UID: ${user.uid}`);

      // auto load essentials
      await refreshAll();
    } catch (e) {
      err(loginStatus, "Admin check failed: " + (e?.message || e));
    }
  });
}

boot();

/* ----------------- login/logout ----------------- */
btnFillDemo.addEventListener("click", () => {
  loginEmail.value = "ghost.hacker.uk@gmail.com"; // demo fill, change if needed
  loginPass.focus();
});

btnLogin.addEventListener("click", async () => {
  const email = loginEmail.value.trim();
  const pass = loginPass.value;

  if (!email || !pass) {
    err(loginStatus, "Email + Password required.");
    return;
  }

  btnLogin.disabled = true;
  ok(loginStatus, "Logging in...");

  try {
    await signInWithEmailAndPassword(auth, email, pass);
    ok(loginStatus, "Login success. Checking admin access...");
  } catch (e) {
    err(loginStatus, "Login failed: " + (e?.message || e));
  } finally {
    btnLogin.disabled = false;
  }
});

btnLogout.addEventListener("click", async () => {
  try {
    await signOut(auth);
  } catch (e) {
    // ignore
  }
});

btnRefresh.addEventListener("click", async () => {
  await refreshAll();
});

/* ----------------- refresh all ----------------- */
async function refreshAll() {
  if (!currentUser) return;
  await Promise.allSettled([
    loadPayment(),
    loadDepositRequests(),
    loadPurchaseRequests(),
    loadUsers()
  ]);
}

/* ----------------- BALANCE functions ----------------- */
btnCheckBalance.addEventListener("click", async () => {
  const uid = uidInput.value.trim();
  if (!uid) return err(balanceStatus, "UID required.");
  try {
    const uref = doc(db, "users", uid);
    const snap = await getDoc(uref);
    if (!snap.exists()) return err(balanceStatus, "User doc not found: users/" + uid);

    const data = snap.data();
    ok(balanceStatus, `Balance: ৳ ${data.balance ?? 0}`);
  } catch (e) {
    err(balanceStatus, "Error: " + (e?.message || e));
  }
});

btnAddBalance.addEventListener("click", async () => {
  const uid = uidInput.value.trim();
  const amt = num(amountInput.value);
  if (!uid) return err(balanceStatus, "UID required.");
  if (!amt) return err(balanceStatus, "Amount required.");

  try {
    ok(balanceStatus, "Adding balance...");
    await runTransaction(db, async (tx) => {
      const uref = doc(db, "users", uid);
      const snap = await tx.get(uref);
      if (!snap.exists()) throw new Error("User doc not found: users/" + uid);
      const cur = Number(snap.data().balance || 0);
      tx.update(uref, { balance: cur + amt, updatedAt: serverTimestamp() });
    });

    ok(balanceStatus, `Added ৳${amt} to ${uid}`);
    await pushNotification(uid, `Your balance increased by ৳${amt}.`);
  } catch (e) {
    err(balanceStatus, "Error: " + (e?.message || e));
  }
});

btnSetBalance.addEventListener("click", async () => {
  const uid = uidInput.value.trim();
  const amt = num(amountInput.value);
  if (!uid) return err(balanceStatus, "UID required.");

  try {
    ok(balanceStatus, "Setting balance...");
    const uref = doc(db, "users", uid);
    await updateDoc(uref, { balance: amt, updatedAt: serverTimestamp() });

    ok(balanceStatus, `Set balance to ৳${amt} for ${uid}`);
    await pushNotification(uid, `Your balance was set to ৳${amt}.`);
  } catch (e) {
    err(balanceStatus, "Error: " + (e?.message || e));
  }
});

/* ----------------- PAYMENT NUMBERS ----------------- */
async function loadPayment() {
  try {
    ok(paymentStatus, "Loading...");
    const pref = doc(db, "settings", "payment");
    const snap = await getDoc(pref);
    if (!snap.exists()) {
      ok(paymentStatus, "No settings/payment found. You can Save to create it.");
      return;
    }
    const d = snap.data();
    bkashInput.value = d.bkash || "";
    nagadInput.value = d.nagad || "";
    rocketInput.value = d.rocket || "";
    ok(paymentStatus, "Loaded.");
  } catch (e) {
    err(paymentStatus, "Error: " + (e?.message || e));
  }
}

btnLoadPayment.addEventListener("click", loadPayment);

btnSavePayment.addEventListener("click", async () => {
  try {
    ok(paymentStatus, "Saving...");
    const pref = doc(db, "settings", "payment");
    await setDoc(pref, {
      bkash: bkashInput.value.trim(),
      nagad: nagadInput.value.trim(),
      rocket: rocketInput.value.trim(),
      updatedAt: serverTimestamp()
    }, { merge: true });

    ok(paymentStatus, "Saved.");
  } catch (e) {
    err(paymentStatus, "Error: " + (e?.message || e));
  }
});

/* ----------------- NOTIFICATION (manual) ----------------- */
btnSendNotif.addEventListener("click", async () => {
  const toUid = notifToUid.value.trim();
  const msg = notifMsg.value.trim();
  if (!toUid) return err(notifStatus, "To UID required.");
  if (!msg) return err(notifStatus, "Message required.");

  try {
    ok(notifStatus, "Sending...");
    await pushNotification(toUid, msg);
    ok(notifStatus, "Sent.");
    notifMsg.value = "";
  } catch (e) {
    err(notifStatus, "Error: " + (e?.message || e));
  }
});

/* ----------------- DEPOSIT REQUESTS -----------------
Expected depositRequests fields (suggested):
- userId (uid)
- amount (number)
- method (bkash/nagad/rocket)
- txid (string)
- status ("pending"|"approved"|"rejected")
*/
async function loadDepositRequests() {
  try {
    ok(depositStatus, "Loading deposits...");
    const q1 = query(
      collection(db, "depositRequests"),
      where("status", "==", "pending"),
      orderBy("createdAt", "desc"),
      limit(30)
    );
    const snap = await getDocs(q1);

    const rows = [];
    snap.forEach((docSnap) => {
      const d = docSnap.data();
      rows.push({ id: docSnap.id, ...d });
    });

    if (!rows.length) {
      depositTbody.innerHTML = `<tr><td colspan="6" class="small">No pending deposits.</td></tr>`;
      ok(depositStatus, "No pending deposits.");
      return;
    }

    depositTbody.innerHTML = rows.map(r => `
      <tr>
        <td>${r.id}</td>
        <td>${r.userId || "-"}</td>
        <td>${r.amount ?? "-"}</td>
        <td>${r.method || "-"}</td>
        <td>${r.txid || "-"}</td>
        <td>
          <button data-approve-deposit="${r.id}">Approve</button>
        </td>
      </tr>
    `).join("");

    depositTbody.querySelectorAll("[data-approve-deposit]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const reqId = btn.getAttribute("data-approve-deposit");
        await approveDeposit(reqId);
      });
    });

    ok(depositStatus, `Loaded ${rows.length} pending deposit(s).`);
  } catch (e) {
    err(depositStatus, "Error: " + (e?.message || e));
  }
}

async function approveDeposit(reqId) {
  try {
    ok(depositStatus, "Approving deposit...");
    await runTransaction(db, async (tx) => {
      const dref = doc(db, "depositRequests", reqId);
      const dsnap = await tx.get(dref);
      if (!dsnap.exists()) throw new Error("deposit request not found");

      const d = dsnap.data();
      if (d.status !== "pending") throw new Error("Already processed");

      const uid = d.userId;
      const amt = Number(d.amount || 0);
      if (!uid || !amt) throw new Error("Invalid deposit data");

      const uref = doc(db, "users", uid);
      const usnap = await tx.get(uref);
      if (!usnap.exists()) throw new Error("User doc not found");

      const cur = Number(usnap.data().balance || 0);
      tx.update(uref, { balance: cur + amt, updatedAt: serverTimestamp() });
      tx.update(dref, {
        status: "approved",
        approvedBy: currentUser.uid,
        approvedAt: serverTimestamp()
      });
    });

    // after transaction: notification
    const dref = doc(db, "depositRequests", reqId);
    const dsnap = await getDoc(dref);
    const d = dsnap.data();
    if (d?.userId) {
      await pushNotification(d.userId, `Deposit approved. Balance added: ৳${d.amount}`);
    }

    ok(depositStatus, "Deposit approved.");
    await loadDepositRequests();
    await loadUsers();
  } catch (e) {
    err(depositStatus, "Approve error: " + (e?.message || e));
  }
}

/* ----------------- PURCHASE REQUESTS -----------------
Expected purchaseRequests fields (suggested):
- userId (uid)
- service (string) e.g. "mobile_hack"
- cost (number) e.g. 3000
- phone (string)
- status ("pending"|"approved"|"rejected")
*/
async function loadPurchaseRequests() {
  try {
    ok(purchaseStatus, "Loading purchases...");
    const q1 = query(
      collection(db, "purchaseRequests"),
      where("status", "==", "pending"),
      orderBy("createdAt", "desc"),
      limit(30)
    );
    const snap = await getDocs(q1);

    const rows = [];
    snap.forEach((docSnap) => {
      const d = docSnap.data();
      rows.push({ id: docSnap.id, ...d });
    });

    if (!rows.length) {
      purchaseTbody.innerHTML = `<tr><td colspan="6" class="small">No pending purchases.</td></tr>`;
      ok(purchaseStatus, "No pending purchases.");
      return;
    }

    purchaseTbody.innerHTML = rows.map(r => `
      <tr>
        <td>${r.id}</td>
        <td>${r.userId || "-"}</td>
        <td>${r.service || "-"}</td>
        <td>${r.cost ?? "-"}</td>
        <td>${r.phone || "-"}</td>
        <td>
          <button data-approve-purchase="${r.id}">Approve</button>
        </td>
      </tr>
    `).join("");

    purchaseTbody.querySelectorAll("[data-approve-purchase]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const reqId = btn.getAttribute("data-approve-purchase");
        await approvePurchase(reqId);
      });
    });

    ok(purchaseStatus, `Loaded ${rows.length} pending purchase(s).`);
  } catch (e) {
    err(purchaseStatus, "Error: " + (e?.message || e));
  }
}

async function approvePurchase(reqId) {
  try {
    ok(purchaseStatus, "Approving purchase...");
    const pref = doc(db, "purchaseRequests", reqId);
    const psnap = await getDoc(pref);
    if (!psnap.exists()) throw new Error("purchase request not found");
    const p = psnap.data();
    if (p.status !== "pending") throw new Error("Already processed");

    await updateDoc(pref, {
      status: "approved",
      approvedBy: currentUser.uid,
      approvedAt: serverTimestamp()
    });

    if (p.userId) {
      await pushNotification(p.userId, `Purchase approved: ${p.service || "service"} (cost: ৳${p.cost || 0})`);
    }

    ok(purchaseStatus, "Purchase approved.");
    await loadPurchaseRequests();
  } catch (e) {
    err(purchaseStatus, "Approve error: " + (e?.message || e));
  }
}

/* ----------------- USERS LIST ----------------- */
async function loadUsers() {
  try {
    ok(usersStatus, "Loading users...");
    const q1 = query(
      collection(db, "users"),
      orderBy("createdAt", "desc"),
      limit(50)
    );
    const snap = await getDocs(q1);

    const rows = [];
    snap.forEach((docSnap) => {
      const d = docSnap.data();
      rows.push({ uid: docSnap.id, ...d });
    });

    if (!rows.length) {
      usersTbody.innerHTML = `<tr><td colspan="5" class="small">No users found.</td></tr>`;
      ok(usersStatus, "No users.");
      return;
    }

    usersTbody.innerHTML = rows.map(u => `
      <tr>
        <td style="max-width:180px;overflow:hidden;text-overflow:ellipsis">${u.uid}</td>
        <td>${u.email || "-"}</td>
        <td>৳ ${u.balance ?? 0}</td>
        <td>${u.status || "-"}</td>
        <td>${u.role || "-"}</td>
      </tr>
    `).join("");

    ok(usersStatus, `Loaded ${rows.length} users.`);
  } catch (e) {
    err(usersStatus, "Error: " + (e?.message || e));
  }
       }
