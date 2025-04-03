require("dotenv").config();
const admin = require("firebase-admin");
const { getStorage } = require("firebase-admin/storage");

// Properly format Firebase credentials
const serviceAccount = {
  type: "service_account",
  project_id: process.env.FIREBASE_PROJECT_ID,
  private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
  private_key: "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDKRCw34dYEdAzF\nbCMYK3npH7BGlpwwpeNQiAYvvrqfqbavthJZn+3W/0geba9V/Aof+tY/WAxMtxG6\nvuf8sbPJb5hs5xX0X8xkFSVD//fv2BgiStC60jq/5yr9BxB1OJRp8AZxOb4O1wyI\nkx9EIiL1xJXkrVS+EcgPBDRX+j0PEIJBkE/r5CFwXz3upUwq+sNbuvgafBR1oW3H\nHxjHCafL8/V02U+k2mSkxMrXPzN1DGIanX7PD4l+4697kOilNnoVUDvfE0d35+MZ\nRvK/zdtsc0NltT6XqB8k30OOXPYeSG1/MXc1mgtrtQ9+OeGFqWVhG+3Xqf/Qxp52\nmG3avXkLAgMBAAECggEAFzSxGgw4ALTLzk60zA4Y4402LTMUYmR16wRgKVQply3i\nftBV1KCLqhIJ1SviZOwQwVCHCidw6dBLIXDLrus4ZFEAXOY6V5oyGf1vFBkm+gaB\n5lVNE1IRWXkNLpCD69788BaQtqbYTl2P2499k9SSzD2ssNrOESx7FnX2B233WWXo\nDmmvNILD74jX+gswj98xwaFbUSVtt4CEQxRIPnq0FidYQ4dRGS3W5l3tnTUYkzX3\nAU6/sg4xlGMArN0JnQCn3abjQsr6XxgZPYx2szogy1CftbEoSydq56ia/sAyUp34\npjRBtQmQwr8a0U3t0B9fkbLuQS8TbW5bMs5xhmxfOQKBgQD5DTiyjZZcItNvGjIY\nVOj0XIcAV6ya02bWtK8KEEo/6Hyxaq36nFkddhPI+I+Ft4ZSIOd9TLUd4Ds5+AqT\n3gf2emQ+9RZwB020WpGhMKYdB8mgpX+jk6rKVAFVukrsynHtGFy8agjnaPonVj/T\nyDPdCsKUmhyz+T74I7AH+lQCLQKBgQDP6Mz0N0C3KcUo7BtokrLdKpvzC5ydC4dO\nZTAJt5EMaK1rpArUdF5GZGxv58lkQZukEipGzTn8ZvijRxEf+DwATyQz4Hr6+4hL\n5rlCc+xmIMrmHoY6wP6oOogbrX0T9N7eOr5C+Tb9qbxRUEwRsBKABwCW5VMffs+A\nbIX9mE3DFwKBgFhUxCMv7IBJKcxh8hqHIwhoOMl6TxGqoPLNqrdbB7qa7n7OY15b\nTZARbPr+jYjTiqReXzwllKc//EGXI8lGGnTk++EIdCjPrlOlO7l7067AMFb128tc\neFrCaKbLJ//L3ZRF6743rWjF5tNE1+Z5P0vKoTCraDq80ASaQ7jQpDMRAoGBAM03\nTJYBs68XW7R42NTvd/02AZh07bFVn8iRuEjfGBzXddW5pbbu5d81YJNUhkSfPbFE\n/NXF3GZ2fRUtIIody5vCgklyWfFCNdY1dsdRBRYJaDycBIIZ3ULQA2jOZZc9LH7O\nHN6eftkCoQ7h4zPSR3B3eO14jgOYd9ibReZ6XschAoGAAK9u/UCgMydxN5yb12bq\nmivqVOkOPwMq6H1I/NR3OA1msL3VPoTDeUfh+na0ziEK2wM6KzuPxYAAM24EnYYV\n5lZ2LSUko64/VwVsC8HIKT1h4nTPihfbpJS8lu1ts2Cf54UvD0zBtVxzVCP71d9f\n4HKHDZz8t1aclWiGlKtUNJo=\n-----END PRIVATE KEY-----\n", // Fix newline issue
  client_email: process.env.FIREBASE_CLIENT_EMAIL,
  client_id: process.env.FIREBASE_CLIENT_ID,
  auth_uri: process.env.FIREBASE_AUTH_URI,
  token_uri: process.env.FIREBASE_TOKEN_URI,
  auth_provider_x509_cert_url: process.env.FIREBASE_AUTH_PROVIDER_CERT_URL,
  client_x509_cert_url: process.env.FIREBASE_CLIENT_CERT_URL,
};

// Initialize Firebase Admin SDK
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
});

// Get Firebase storage bucket instance
const bucket = getStorage().bucket();

module.exports = { bucket };
