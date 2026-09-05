/* ============================================================================
   FIREBASE INITIALIZATION
   Must load BEFORE script.js. Creates a global `db` (Realtime Database
   reference) that script.js will use for all reads/writes.
   ============================================================================ */
const firebaseConfig = {
  apiKey: "AIzaSyBehFk5dWZL5_RLjmUqEnTnt1bBrsFG3sQ",
  authDomain: "ary-quiize-bank-data.firebaseapp.com",
  databaseURL: "https://ary-quiize-bank-data-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "ary-quiize-bank-data",
  storageBucket: "ary-quiize-bank-data.firebasestorage.app",
  messagingSenderId: "924736650507",
  appId: "1:924736650507:web:a8d424ce9d5a4963d9b60e"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();
