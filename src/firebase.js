import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// --- IMPORTANT: REPLACE THIS WITH YOUR OWN CONFIG FROM FIREBASE CONSOLE ---
const firebaseConfig = {
  apiKey: "AIzaSyCXGR04qg3j9ZeTtMgi6z8_4aGOAti_Qhk", 
  authDomain: "red-lantern-supply.firebaseapp.com",
  projectId: "red-lantern-supply",
  storageBucket: "red-lantern-supply.firebasestorage.app",
  messagingSenderId: "272248173898",
  appId: "YOUR_WEB_APP_ID" // Go to Firebase Console > Project Settings > General to find this!
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);