const mongoose = require('mongoose');

// Define a schema for the document
const webanalytics = new mongoose.Schema({
  userVisit: {
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User',  // Assuming you have a User model for the user reference
    required: true
  },
  webId: {
    type: String,
    required: true
  },
  sourceUrl: {
    type: String,
    required: true
  },
  inTime: {
    type: Date,
    required: true
  },
  outTime: {
    type: Date,
    required: true
  },
  totalTimeSpent: {
    type: Number,
    required: true
  },
  pointerHeatmap: [
    {
      position: {
        type: String,
        required: true
      },
      timeSpent: {
        type: Number,
        required: true
      }
    }
  ],
}, { timestamps: true , collection:'webanalytics'});

// Create and export the model
const Webanalytics = mongoose.model('webanalytics', webanalytics);

module.exports = Webanalytics;
