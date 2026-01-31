import { auth, db } from "./firebase.js";

import {
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

import {
  doc,
  getDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const $ = (id) => document.getElementById(id);
const show = (el) => el.classList.remove("hide");
const hide = (el) => el.classList.add("hide");

function setText(id, txt){ $(id).textContent = txt; }

function showLogin(msg=""){
  show($("loginCard"));
  hide($("dash"));
  if(msg){
    setText("loginMsg", msg);
    show($("loginMsg"));
  } else {
    hide($("loginMsg"));
  }
}

function showDenied(msg){
  hide($("loginCard"));
  show($("dash")); // dashboard container show করলাম, কিন্তু ভেতরে denied দেখাবো
  setText("adminBadge", "Access Denied");
  setText("dashErr", msg || "Not allowed");
  show($("dashErr"));
  hide($("dashMsg"));
}

function showDashboard(user){
  hide($("loginCard"));
  show($("dash"));
  setText("adminBadge", `Admin: ${user.email} • UID: ${user.uid}`);
  hide($("dashErr"));
  setText("dashMsg", "Admin verified ✅");
  show($("dashMsg"));
}

// ✅ NO AUTO LOGOUT here
async function adminCheck(uid){
  try{
    const ref = doc(db, "admins", uid);
    const snap = await getDoc(ref);
    if(!snap.exists()) return { ok:false, reason:"admins/"+uid+" not found" };

    const data = snap.data() || {};
    if(data.role && String(data.role).toLowerCase() !== "active"){
      return { ok:false, reason:"admin role not active" };
    }
    return { ok:true, reason:"ok" };
  }catch(e){
    // permission denied / rules etc.
    return { ok:false, reason: e?.message || String(e) };
  }
}

// ----- LOGIN BUTTON -----
$("btnLogin").addEventListener("click", async ()=>{
  const email = $("loginEmail").value.trim();
  const pass  = $("loginPass").value;

  if(!email || !pass){
    showLogin("Email + Password দিন");
    return;
  }

  try{
    await signInWithEmailAndPassword(auth, email, pass);
    // onAuthStateChanged handle করবে
  }catch(e){
    showLogin("Login failed: " + (e?.message || String(e)));
  }
});

// ----- LOGOUT BUTTON -----
$("btnLogout").addEventListener("click", async ()=>{
  await signOut(auth);
  showLogin("Logged out");
});

// ----- AUTH STATE -----
onAuthStateChanged(auth, async (user)=>{
  if(!user){
    showLogin();
    return;
  }

  // ✅ Debug info (console)
  console.log("AUTH USER:", user.uid, user.email);

  const res = await adminCheck(user.uid);

  if(!res.ok){
    // ✅ NOT logging out anymore
    console.warn("ADMIN CHECK FAIL:", res.reason);
    showDenied("Admin access denied ❌\nReason: " + res.reason + "\n\nFix:\n1) Firestore admins/{UID} doc create\n2) Rules allow admins doc read\n3) UID exact match");
    return;
  }

  // ✅ Admin OK → show dashboard
  showDashboard(user);

  // এখানে তোমার existing loadAll() / admin features call করবে
  if(typeof window.loadAll === "function"){
    await window.loadAll();
  }
});
