const mongoose = require('mongoose');

// Define the schema for the user activity pdf document
const userActivityPdfSchema = new mongoose.Schema({
  userVisit: mongoose.Schema.Types.ObjectId,
  userId: String,
  pdfId: String,
  sourceUrl: String,
  totalPagesVisited: Number,
  totalTimeSpent: Number,
  pageTimeSpent: Map,
  selectedTexts: [String],
  totalClicks: Number,
  inTime: Date,
  outTime: Date,
  mostVisitedPage: String,
  linkClicks: [String],
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: Date,
});

// Create and export the model for the useractivitypdfs collection
const UserActivityPdf = mongoose.model('UserActivityPdf', userActivityPdfSchema, 'useractivitypdfs');
module.exports = UserActivityPdf;
