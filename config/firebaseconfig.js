const admin = require("firebase-admin");
const { getStorage } = require("firebase-admin/storage");

// Load Firebase service account key
const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: "testridy-6db7c.appspot.com", // Replace with your Firebase bucket name
});

const bucket = getStorage().bucket(); // Get the storage bucket instance

module.exports = { bucket };
