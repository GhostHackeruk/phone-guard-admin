import { auth, db } from "./firebase.js";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js";

import {
  doc, getDoc, setDoc, serverTimestamp,
  collection, query, where, orderBy, limit, getDocs,
  updateDoc, increment
} from "https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js";

const $ = (id) => document.getElementById(id);

// UI refs
const loginBox = $("loginBox");
const panelBox = $("panelBox");
const loginMsg = $("loginMsg");
const adminState = $("adminState");
const depositList = $("depositList");

const emailEl = $("email");
const passEl = $("pass");

const btnLogin = $("btnLogin");
const btnLogout = $("btnLogout");
const btnRefresh = $("btnRefresh");

const bkashEl = $("bkash");
const nagadEl = $("nagad");
const rocketEl = $("rocket");
const btnLoadSettings = $("btnLoadSettings");
const btnSaveSettings = $("btnSaveSettings");
const settingsMsg = $("settingsMsg");

// Helpers
function showLogin(message = "Please login with admin email & password.", isErr=false){
  loginBox.classList.remove("hide");
  panelBox.classList.add("hide");
  loginMsg.textContent = message;
  loginMsg.classList.toggle("err", isErr);
  adminState.textContent = "Admin: Not logged in";
}

function showPanel(stateText){
  loginBox.classList.add("hide");
  panelBox.classList.remove("hide");
  adminState.textContent = stateText;
}

async function isAdmin(uid){
  // ✅ admins/{uid} exists => admin
  const snap = await getDoc(doc(db, "admins", uid));
  return snap.exists();
}

async function loadPendingDeposits(){
  depositList.textContent = "Loading...";
  try{
    // depositRequests where status == "pending"
    const qy = query(
      collection(db, "depositRequests"),
      where("status", "==", "pending"),
      orderBy("createdAt", "desc"),
      limit(25)
    );
    const snap = await getDocs(qy);

    if(snap.empty){
      depositList.textContent = "No pending requests.";
      return;
    }

    // Render simple list with approve buttons
    const items = [];
    snap.forEach(d=>{
      const x = d.data();
      items.push({
        id: d.id,
        amount: x.amount ?? 0,
        method: x.method ?? "",
        last4: x.last4 ?? "",
        email: x.email ?? "",
        userId: x.userId ?? ""
      });
    });

    depositList.innerHTML = items.map(it => {
      return `
        • ${it.method} | ৳${it.amount} | ${it.email} | last4:${it.last4}
        <br/>
        <button data-approve="${it.id}" style="margin:8px 0 14px; padding:10px 12px; border-radius:12px; border:0; cursor:pointer; font-weight:900; background:linear-gradient(90deg, rgba(0,255,160,.95), rgba(0,212,255,.85)); color:#03100d;">
          APPROVE
        </button>
        <hr style="border:0; border-top:1px solid rgba(0,255,160,.12); margin:10px 0;">
      `;
    }).join("");

    // click handlers
    document.querySelectorAll("[data-approve]").forEach(btn=>{
      btn.addEventListener("click", async ()=>{
        const depId = btn.getAttribute("data-approve");
        btn.disabled = true;
        btn.textContent = "APPROVING...";
        try{
          await approveDeposit(depId);
          btn.textContent = "APPROVED ✅";
        }catch(e){
          btn.disabled = false;
          btn.textContent = "FAILED ❌";
          alert(e.message || String(e));
        }
      });
    });

  }catch(e){
    depositList.textContent = "Error loading: " + (e.message || String(e));
  }
}

async function approveDeposit(depId){
  // 1) read deposit doc
  const depRef = doc(db, "depositRequests", depId);
  const depSnap = await getDoc(depRef);
  if(!depSnap.exists()) throw new Error("Deposit request not found.");

  const dep = depSnap.data();
  if(dep.status !== "pending") throw new Error("Already processed.");

  const userId = dep.userId;
  const amount = Number(dep.amount || 0);
  if(!userId) throw new Error("userId missing in deposit request.");
  if(!amount || amount <= 0) throw new Error("amount invalid.");

  // 2) add balance to users/{uid}
  const userRef = doc(db, "users", userId);

  // increment balance (field must be number)
  await updateDoc(userRef, { balance: increment(amount) });

  // 3) update deposit status
  await updateDoc(depRef, {
    status: "approved",
    approvedAt: serverTimestamp(),
    approvedBy: auth.currentUser?.uid || ""
  });
}

// Settings
async function loadSettings(){
  settingsMsg.textContent = "Loading...";
  settingsMsg.classList.remove("err");
  try{
    const ref = doc(db, "settings", "payment");
    const snap = await getDoc(ref);
    if(!snap.exists()){
      bkashEl.value = "";
      nagadEl.value = "";
      rocketEl.value = "";
      settingsMsg.textContent = "No settings found. Fill and Save.";
      return;
    }
    const d = snap.data();
    bkashEl.value = d.bkash || "";
    nagadEl.value = d.nagad || "";
    rocketEl.value = d.rocket || "";
    settingsMsg.textContent = "Loaded ✅";
  }catch(e){
    settingsMsg.textContent = "Load failed: " + (e.message || String(e));
    settingsMsg.classList.add("err");
  }
}

async function saveSettings(){
  settingsMsg.textContent = "Saving...";
  settingsMsg.classList.remove("err");
  try{
    await setDoc(doc(db, "settings", "payment"), {
      bkash: bkashEl.value.trim(),
      nagad: nagadEl.value.trim(),
      rocket: rocketEl.value.trim(),
      updatedAt: serverTimestamp()
    }, { merge:true });

    settingsMsg.textContent = "Saved ✅";
  }catch(e){
    settingsMsg.textContent = "Save failed: " + (e.message || String(e));
    settingsMsg.classList.add("err");
  }
}

// Login button
btnLogin?.addEventListener("click", async ()=>{
  const em = emailEl.value.trim();
  const pw = passEl.value;
  if(!em || !pw){
    showLogin("Email & password দিন।", true);
    return;
  }
  loginMsg.textContent = "Logging in...";
  loginMsg.classList.remove("err");
  try{
    await signInWithEmailAndPassword(auth, em, pw);
    // onAuthStateChanged will handle next
  }catch(e){
    showLogin("Login failed: " + (e.message || String(e)), true);
  }
});

// Logout
btnLogout?.addEventListener("click", async ()=>{
  await signOut(auth);
});

// Refresh
btnRefresh?.addEventListener("click", async ()=>{
  depositList.textContent = "Refreshing...";
  await loadPendingDeposits();
});

// Settings buttons
btnLoadSettings?.addEventListener("click", loadSettings);
btnSaveSettings?.addEventListener("click", saveSettings);

// Auth state
onAuthStateChanged(auth, async (user)=>{
  if(!user){
    showLogin();
    return;
  }

  adminState.textContent = "Admin: Checking...";
  try{
    const ok = await isAdmin(user.uid);
    if(!ok){
      showLogin("This account is not admin. Logout and login with admin account.", true);
      await signOut(auth);
      return;
    }

    showPanel("Admin: Verified ✅ " + (user.email || ""));
    await loadPendingDeposits();
    await loadSettings();
  }catch(e){
    showLogin("Admin check failed: " + (e.message || String(e)), true);
  }
});
