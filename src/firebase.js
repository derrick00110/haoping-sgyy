import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyAKhQM6qK8zwI_SEUuXGilGTZCrBanvMmg",
  authDomain: "sgyy-haoping.firebaseapp.com",
  projectId: "sgyy-haoping",
  storageBucket: "sgyy-haoping.firebasestorage.app",
  messagingSenderId: "128462500637",
  appId: "1:128462500637:web:add11cd00ee5f914dea7f4",
  measurementId: "G-938PRBG6HT"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
