import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyD_eOcX7P77xLFnOPf3yWk3P-Qyhbyab5E",
  authDomain: "phone-guard-user-new.firebaseapp.com",
  projectId: "phone-guard-user-new",
  storageBucket: "phone-guard-user-new.firebasestorage.app",
  messagingSenderId: "764033397081",
  appId: "1:764033397081:web:182fd2c7cfc663e36c5c48"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
