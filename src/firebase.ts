// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyD2ceHUG1TsEFVzC1CRkcjD4vB6sWZNV0I",
  authDomain: "data-starshop-2026-80c3d.firebaseapp.com",
  projectId: "data-starshop-2026-80c3d",
  storageBucket: "data-starshop-2026-80c3d.firebasestorage.app",
  messagingSenderId: "70488735407",
  appId: "1:70488735407:web:d40b8adbd1f2a72f3b9e5a",
  measurementId: "G-0RP3502XKE"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);