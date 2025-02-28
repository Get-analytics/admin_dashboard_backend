const mongoose = require("mongoose");

const videoAnalyticsSchema = new mongoose.Schema(
  {
    userVisit: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    videoId: { type: String, required: true },
    sourceUrl: { type: String, required: true },
    totalWatchTime: { type: Number, default: 0 },
    playCount: { type: Number, default: 0 },
    pauseCount: { type: Number, default: 0 },
    seekCount: { type: Number, default: 0 },
    pauseResumeEvents: { type: Array, default: [] },
    skipEvents: { type: Array, default: [] },
    jumpEvents: { type: Array, default: [] },
    speedEvents: { type: Array, default: [] },
    fullscreenEvents: { type: Array, default: [] },
    download: { type: Boolean, default: false },
    currentPlayStart: { type: Date, default: null },
    totalWatchTimeFormatted: { type: String, default: "0s" },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
    collection: "videoanalytics", // Explicitly setting the collection name
  }
);

module.exports = mongoose.model("VideoAnalytics", videoAnalyticsSchema);
