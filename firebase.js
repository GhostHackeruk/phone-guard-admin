// firebase.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "PASTE_FROM_FIREBASE_CONSOLE",
  authDomain: "PASTE_FROM_FIREBASE_CONSOLE",
  projectId: "PASTE_FROM_FIREBASE_CONSOLE",
  storageBucket: "PASTE_FROM_FIREBASE_CONSOLE",
  messagingSenderId: "PASTE_FROM_FIREBASE_CONSOLE",
  appId: "PASTE_FROM_FIREBASE_CONSOLE"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
