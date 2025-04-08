const mongoose = require("mongoose");

const shortenedUrlSchema = new mongoose.Schema(
  {
    originalUrl: { type: String, required: true }, // Original URL or converted file URL
    shortId: { type: String, required: true },       // Shortened URL identifier
    fileName: { type: String },
    mimeType: { type: String, required: true },      // MIME type of the file or "weblink"
    totalPages: { type: Number, default: 0 },          // Store total page count (for PDFs)
    duration: { type: Number, default: 0 },            // Store video duration in seconds
    userUuid: { type: String, required: true },        // The UUID of the user who owns this record

    // New fields:
    effectiveDate: { type: Date, default: Date.now },
    expirationDate: {
      type: Date,
      default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
    active: { type: String, default: "Y" },
  },
  { timestamps: true, collection: "urls" } // Use collection name "urls"
);

const Urls = mongoose.model("urls", shortenedUrlSchema);
module.exports = Urls;
