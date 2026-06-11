const firebaseConfig = {
 apiKey: "AIzaSyACWeItkbmziYB46_gq-JT0_eGtEZmgLRs",
 authDomain: "quiniela-mundial-2026-7d564.firebaseapp.com",
 projectId: "quiniela-mundial-2026-7d564",
 storageBucket: "quiniela-mundial-2026-7d564.firebasestorage.app",
 messagingSenderId: "177974373117",
 appId: "1:177974373117:web:c0b358ef2dc9373808ac94"
};

firebase.initializeApp(firebaseConfig);

const db = firebase.firestore();
const auth = firebase.auth();
