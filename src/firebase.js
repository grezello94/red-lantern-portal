import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyCXGR04qg3j9ZeTtMgi6z8_4aGOAti_Qhk",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "red-lantern-supply.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "red-lantern-supply",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "red-lantern-supply.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "272248173898",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "YOUR_WEB_APP_ID"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
