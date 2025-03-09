const mongoose = require("mongoose");

const shortenedUrlSchema = new mongoose.Schema(
  {
    originalUrl: { type: String, required: true }, // Original URL or converted file URL
    shortId: { type: String, required: true },       // Shortened URL identifier
    fileName: { type: String },
    mimeType: { type: String, required: true },      // MIME type of the file or "weblink"
    totalPages: { type: Number, default: 0 },  // Add this field to store total page count
    userUuid: { type: String, required: true },      // The UUID of the user who owns this record
  },
  { timestamps: true, collection: "urls" } // Use collection name "urls"
);

const Urls = mongoose.model("urls", shortenedUrlSchema);
module.exports = Urls;
