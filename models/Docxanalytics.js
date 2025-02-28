const mongoose = require("mongoose");

const DocxAnalyticsSchema = new mongoose.Schema(
  {
    userVisit: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "UserVisit", // Reference another collection if needed
      required: true,
    },
    pdfId: {
      type: String,
      required: true,
    },
    sourceUrl: {
      type: String,
      required: true,
    },
    totalPagesVisited: {
      type: Number,
      required: true,
    },
    totalTimeSpent: {
      type: Number,
      required: true,
    },
    pageTimeSpent: {
      type: Map,
      of: Number,
      required: true,
    },
    selectedTexts: [
      {
        selectedText: String,
        count: Number,
        time: Number,
      },
    ],
    totalClicks: {
      type: Number,
      required: true,
    },
    inTime: {
      type: Date,
      required: true,
    },
    outTime: {
      type: Date,
      required: true,
    },
    mostVisitedPage: {
      type: String,
      required: true,
    },
    linkClicks: {
      type: [String],
      default: [],
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { collection: "docxanalytics" } // Explicitly setting collection name
);

const DocxAnalytics = mongoose.model("docxanalytics", DocxAnalyticsSchema);
module.exports = DocxAnalytics;
