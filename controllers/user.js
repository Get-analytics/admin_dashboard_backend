
const User = require("../models/User");
const jwt = require('jsonwebtoken');
const Pdfanalytics = require("../models/Pdfanalytics");
const Docxanalytics = require('../models/Docxanalytics')
const newUser = require("../models/newUser");
const ReturnedUser = require("../models/ReturnedUser");
const ShortenedUrl = require("../models/test"); // Updated model name
const UserVisit = require("../models/UserVisit"); // UserVisit model
const VideoAnalytics = require('../models/Videoanalytics')
const path = require('path');
const { upload, cloudinary } = require("./cloudinary");
const axios = require('axios');
const { v4: uuidv4 } = require("uuid");  // Import the UUID generator
const moment = require("moment");
const DocxAnalytics = require("../models/Docxanalytics");
const Webanalytics = require('../models/Webanalytics');
const { bucket } = require("../config/firebaseconfig"); 
const AWS = require("aws-sdk");






// ------------------------
// LOGIN
// ------------------------
const login = async (req, res) => {
  const { email, password } = req.body;
  console.log(email, password);

  if (!email || !password) {
    return res.status(400).json({
      msg: "Bad request. Please add email and password in the request body",
    });
  }

  let foundUser = await User.findOne({ email: req.body.email });
  console.log(foundUser,"founduser")
  if (foundUser) {
    const isMatch = await foundUser.comparePassword(password);
    if (isMatch) {
      // Generate a JWT token for the user
      const token = jwt.sign(
        { id: foundUser._id, name: foundUser.name },
        process.env.JWT_SECRET,
        { expiresIn: "30d" }
      );
      // Retrieve the UUID stored in the user document
      const userUuid = foundUser.uuid;

      console.log(userUuid, "uuid")

      return res.status(200).json({
        msg: "user logged in",
        token,
        uuid: userUuid,
      });
    } else {
      return res.status(400).json({ msg: "Bad password" });
    }
  } else {
    return res.status(400).json({ msg: "Bad credentials" });
  }
};

// ------------------------
// REGISTER
// ------------------------
const register = async (req, res) => {
  let foundUser = await User.findOne({ email: req.body.email });
  if (!foundUser) {
    let { username, email, password } = req.body;
    if (username.length && email.length && password.length) {
      // Generate a unique UUID for the new user
      const userUuid = uuidv4();
      const person = new User({
        name: username,
        email: email,
        password: password,
        uuid: userUuid  // Store the UUID in the user document
      });
      await person.save();
      return res.status(201).json({ person, uuid: userUuid });
    } else {
      return res.status(400).json({ msg: "Please add all values in the request body" });
    }
  } else {
    return res.status(400).json({ msg: "Email already in use" });
  }
};

// ------------------------
// UPLOAD FILE ENDPOINT
// ------------------------



// Upload file handler


// Configure AWS S3 client
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY || "AKIAYH6W6IWI5H4ORYLC",
  secretAccessKey: process.env.AWS_SECRET_KEY || "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",
  region: process.env.AWS_REGION || "eu-north-1",
});

const uploadFile = async (req, res) => {
  try {
    const { shortId, uuid } = req.body;

    if (!shortId) {
      return res.status(400).json({ message: "Short ID is required" });
    }

    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    const mimeType = req.file.mimetype;
    const fileSizeInMB = req.file.size / (1024 * 1024); // Convert bytes to MB

    // Define the super admin UUID
    const SUPER_ADMIN_UUID = "rWybQctzsvNvFoylACjDQRcjjoG2";
    const isSuperAdmin = uuid === SUPER_ADMIN_UUID;

    // Allowed MIME types and their max file size limits (in MB)
    const fileSizeLimits = {
      "application/pdf": 2,
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": 2,
      "application/msword": 2,
      "video/mp4": 30,
      "video/webm": 30,
      "video/ogg": 30,
      "image/jpeg": 2,
      "image/png": 2,
      "image/gif": 2,
    };

    // For non super admin users, enforce type, size, and upload-limit restrictions
    if (!isSuperAdmin) {
      // Check if file type is allowed
      if (!Object.keys(fileSizeLimits).includes(mimeType)) {
        return res.status(400).json({ message: "Unsupported file type" });
      }

      // Check file size limit
      const maxAllowedSize = fileSizeLimits[mimeType];
      if (fileSizeInMB > maxAllowedSize) {
        return res.status(400).json({
          message: `File size exceeds the limit. Max allowed size for ${mimeType.split("/")[1].toUpperCase()} is ${maxAllowedSize} MB.`,
        });
      }

      // Check user's upload limit
      const existingRecordCount = await ShortenedUrl.countDocuments({ userUuid: uuid });
      if (existingRecordCount >= 3) {
        return res.status(400).json({ message: "Your upload limit is finished" });
      }
    }

    // Determine folder based on file type
    let folder = "files/";
    if (mimeType.startsWith("video/")) {
      folder = "videos/";
    }

    // --- Branch 1: Video Files ---
    if (mimeType.startsWith("video/")) {
      const fileName = `${folder}${req.file.originalname}`;
      const params = {
        Bucket: process.env.AWS_S3_BUCKET || "sendnowupload",
        Key: fileName,
        Body: req.file.buffer,
        ContentType: mimeType,
      };

      const uploadResult = await s3.upload(params).promise();
      const videoUrl = uploadResult.Location;

      const newShortenedUrl = new ShortenedUrl({
        shortId,
        fileName: req.file.originalname,
        mimeType,
        originalUrl: videoUrl,
        userUuid: uuid,
      });
      await newShortenedUrl.save();

      return res.status(200).json({
        message: "Video uploaded successfully",
        file: { url: videoUrl, mimeType },
        shortId,
        originalUrl: videoUrl,
      });
    }

    // --- Branch 2: DOCX/DOC Files (Convert to PDF) ---
    else if (
      mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      mimeType === "application/msword"
    ) {
      try {
        const base64File = req.file.buffer.toString("base64");
        const apiResponse = await axios.post(
          "https://v2.convertapi.com/convert/docx/to/pdf",
          {
            Parameters: [
              {
                Name: "File",
                FileValue: {
                  Name: req.file.originalname,
                  Data: base64File,
                },
              },
              { Name: "StoreFile", Value: true },
            ],
          },
          {
            headers: {
              Authorization: `Bearer secret_K8PWagmpP2RYCsKJ`,
              "Content-Type": "application/json",
            },
          }
        );

        if (apiResponse.data.Files && apiResponse.data.Files[0]) {
          const pdfUrl = apiResponse.data.Files[0].Url;
          const pdfResponse = await axios.get(pdfUrl, { responseType: "arraybuffer" });
          const pdfBuffer = Buffer.from(pdfResponse.data, "binary");

          const pdfFileName = `files/${req.file.originalname.split(".")[0]}_converted.pdf`;
          const params = {
            Bucket: process.env.AWS_S3_BUCKET || "sendnowupload",
            Key: pdfFileName,
            Body: pdfBuffer,
            ContentType: "application/pdf",
            ContentDisposition: "inline",
          };

          const uploadResult = await s3.upload(params).promise();
          const uploadedPdfUrl = uploadResult.Location;
          const totalPages = await getTotalPages(uploadedPdfUrl);

          const newShortenedUrl = new ShortenedUrl({
            shortId,
            fileName: req.file.originalname,
            mimeType,
            originalUrl: uploadedPdfUrl,
            userUuid: uuid,
            totalPages,
          });
          await newShortenedUrl.save();

          return res.status(200).json({
            message: "File uploaded and converted to PDF successfully",
            file: {
              url: uploadedPdfUrl,
              mimeType: "application/pdf",
              totalPages,
            },
            shortId,
            originalUrl: uploadedPdfUrl,
          });
        } else {
          return res.status(500).json({ message: "Failed to convert DOCX to PDF" });
        }
      } catch (conversionError) {
        return res.status(500).json({
          message: "Error converting DOCX to PDF",
          error: conversionError.message,
        });
      }
    }

    // --- Branch 3: PDF Files ---
    else if (mimeType === "application/pdf") {
      const fileName = `${folder}${req.file.originalname}`;
      const params = {
        Bucket: process.env.AWS_S3_BUCKET || "sendnowupload",
        Key: fileName,
        Body: req.file.buffer,
        ContentType: mimeType,
        ContentDisposition: "inline",
      };

      const uploadResult = await s3.upload(params).promise();
      const fileUrl = uploadResult.Location;
      const totalPages = await getTotalPages(fileUrl);

      const newShortenedUrl = new ShortenedUrl({
        shortId,
        fileName: req.file.originalname,
        mimeType,
        originalUrl: fileUrl,
        userUuid: uuid,
        totalPages,
      });
      await newShortenedUrl.save();

      return res.status(200).json({
        message: "PDF uploaded successfully",
        file: { url: fileUrl, mimeType, totalPages },
        shortId,
        originalUrl: fileUrl,
      });
    }

    // --- Branch 4: Images and Other Supported Files ---
    else {
      const fileName = `${folder}${req.file.originalname}`;
      const params = {
        Bucket: process.env.AWS_S3_BUCKET || "sendnowupload",
        Key: fileName,
        Body: req.file.buffer,
        ContentType: mimeType,
      };

      const uploadResult = await s3.upload(params).promise();
      const fileUrl = uploadResult.Location;

      const newShortenedUrl = new ShortenedUrl({
        shortId,
        fileName: req.file.originalname,
        mimeType,
        originalUrl: fileUrl,
        userUuid: uuid,
      });
      await newShortenedUrl.save();

      return res.status(200).json({
        message: "File uploaded successfully",
        file: { url: fileUrl, mimeType },
        shortId,
        originalUrl: fileUrl,
      });
    }
  } catch (error) {
    console.error("Error during file upload:", error);
    return res.status(500).json({
      message: "Error uploading file",
      error: error.message,
    });
  }
};

// Function to get total pages using pdf.js
async function getTotalPages(pdfUrl) {
  try {
    const pdfjsLib = await import("pdfjs-dist/build/pdf.mjs");
    const response = await axios.get(pdfUrl, { responseType: "arraybuffer" });
    const pdfData = new Uint8Array(response.data);
    const pdfDocument = await pdfjsLib.getDocument({ data: pdfData }).promise;
    return pdfDocument.numPages;
  } catch (error) {
    console.error("Error fetching PDF or counting pages:", error);
    throw new Error("Failed to count pages in the PDF.");
  }
}


// Helper function to fetch page count using PDF.co API with a timeout
// Helper function to fetch page count using PDF.co API with a timeout
const getParsedDocumentDataWithTimeout = async (pdfUrl) => {
  const timeout = 15000; // 15 seconds timeout
  const fallbackPageCount = 10; // Static page count to use when API fails or times out

  // Create a promise for the API call (call the original getParsedDocumentData function)
  const apiCall = getParsedDocumentData(pdfUrl); // Ensure getParsedDocumentData is referenced correctly

  // Create a timeout promise that rejects after the specified time
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error("API request timed out")), timeout)
  );

  // Use Promise.race to race the API call and timeout
  try {
    const pageCount = await Promise.race([apiCall, timeoutPromise]);
    return pageCount;
  } catch (error) {
    console.error("Error or timeout during page count retrieval:", error);
    // Return the fallback page count if API call fails or times out
    return fallbackPageCount;
  }
};

// Original helper function (make sure this function is defined in the same file)
const getParsedDocumentData = async (pdfUrl) => {
  const apiKey = "elearn587@gmail.com_6e1Eo5OXTgFOR4MeALoKdxpZ0lnAMpPIuaZATF0ehXgyELmteyYWhzAQkaqEZwQ9"; // Replace with your PDF.co API key
  const url = "https://api.pdf.co/v1/pdf/documentparser";

  const headers = {
    "Content-Type": "application/json",
    "x-api-key": apiKey,
  };

  const body = JSON.stringify({
    url: pdfUrl,
    outputFormat: "JSON",
    templateId: "1", // Ensure this template ID matches your setup on PDF.co
    async: false,
    inline: "true",
    password: "",  // If your PDF is password-protected, add the password here
    profiles: ""    // Add any profiles if needed
  });

  try {
    const response = await axios.post(url, body, { headers });

    if (response.data && response.data.pageCount) {
      const pageCount = response.data.pageCount;  // Extract total page count from the response
      console.log("Parsed Document Data:", response.data);  // Log the response for debugging
      return pageCount;  // Return the total page count
    } else {
      throw new Error("Failed to retrieve page count from PDF.co");
    }
  } catch (error) {
    console.error("Error parsing document:", error);
    throw error;
  }
};





// ------------------------
// UPLOAD URL ENDPOINT
// ------------------------
const uploadurl = async (req, res) => {
  try {
    console.log(req.body, "url upload");

    const { originalUrl, shortId, mimeType, uuid } = req.body;

    if (!originalUrl || !shortId) {
      return res.status(400).json({ message: "Original URL and Short URL are required" });
    }

    const isSuperAdmin = uuid === "rWybQctzsvNvFoylACjDQRcjjoG2";

    if (!isSuperAdmin) {
      // 1. Check if user has already uploaded 3 or more links
      const existingCount = await ShortenedUrl.countDocuments({ userUuid: uuid });

      if (existingCount >= 3) {
        return res.status(400).json({ message: "Your upload limit is finished" });
      }
    }

    // 2. Save the new shortened URL
    const shortenedUrl = new ShortenedUrl({
      originalUrl,
      fileName: originalUrl,
      shortId,
      mimeType: "weblink", // For URL uploads
      userUuid: uuid,
    });

    await shortenedUrl.save();

    res.status(200).json({
      message: "URL saved successfully",
      shortenedUrl,
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error saving URL", error: error.message });
  }
};

const dashboardData = async (req, res) => {
  try {
    const { UUID } = req.body;
    if (!UUID) {
      return res.status(400).json({ message: "UUID is required" });
    }

    // Find all URL records associated with the given user UUID.
    const urls = await ShortenedUrl.find({ userUuid: UUID });

    // Prepare grouped data by category.
    const groupedData = {
      web: [],
      docx: [],
      pdf: [],
      video: []
    };

    // Function to calculate the expiration in human-readable format
    const getExpirationText = (expirationDate) => {
     
      if (!expirationDate) {
        return "No expiration"; // Default message if no expiration date
      }

      const now = new Date();
      const diffMs = new Date(expirationDate) - now; // milliseconds
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      const diffMonths = Math.floor(diffDays / 30);
      const diffYears = Math.floor(diffDays / 365);

      if (diffMs <= 0) {
        return "Expired";
      } else if (diffYears > 0) {
        return `${diffYears} year`;
      } else if (diffMonths > 0) {
        return `${diffMonths} month`;
      } else if (diffDays > 7) {
        return `${Math.floor(diffDays / 7)} week`;
      } else {
        return `${diffDays} day`;
      }
    };

    urls.forEach((urlDoc) => {

      console.log(urlDoc, "urldoc")
      // Determine the category based on the MIME type.
      let category = "";
      if (urlDoc.mimeType === "weblink") {
        category = "web";
      } else if (
        urlDoc.mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
        urlDoc.mimeType === "application/msword"
      ) {
        category = "docx";
      } else if (urlDoc.mimeType === "application/pdf") {
        category = "pdf";
      } else if (urlDoc.mimeType.startsWith("video/")) {
        category = "video";
      } else {
        category = "web"; // Default to web if no match.
      }

      // Calculate the time difference based on the createdAt timestamp.
      const createdDateObj = new Date(urlDoc.createdAt);
      const now = new Date();
      const diffMs = now - createdDateObj;
      const diffSeconds = Math.floor(diffMs / 1000);
      let timeAgo = "";

      if (diffSeconds < 60) {
        timeAgo = `${diffSeconds} seconds ago`;
      } else if (diffSeconds < 3600) {
        timeAgo = `${Math.floor(diffSeconds / 60)} minutes ago`;
      } else if (diffSeconds < 86400) {
        timeAgo = `${Math.floor(diffSeconds / 3600)} hours ago`;
      } else if (diffSeconds < 2592000) {
        timeAgo = `${Math.floor(diffSeconds / 86400)} days ago`;
      } else if (diffSeconds < 31536000) {
        timeAgo = `${Math.floor(diffSeconds / 2592000)} month(s) ago`;
      } else {
        timeAgo = `${Math.floor(diffSeconds / 31536000)} year(s) ago`;
      }

      // Get expiration date (corrected)

      const expirationText = getExpirationText(urlDoc.expirationDate);

      // Add the record to the appropriate group.
      groupedData[category].push({
        url: `https://view.sendnow.live/${urlDoc.shortId}`,
        fileName: urlDoc.fileName || "N/A", // Include fileName in response
        createdDate: createdDateObj.toISOString().split("T")[0], // Format as "YYYY-MM-DD"
        timeAgo: timeAgo,
        expiration: expirationText // Correct expiration value
      });
    });

    return res.status(200).json({
      status: "success",
      message: "Dashboard data fetched successfully",
      data: groupedData
    });
  } catch (error) {
    console.error("Error fetching dashboard data:", error);
    return res.status(500).json({
      message: "Error fetching dashboard data",
      error: error.message
    });
  }
};


const Pdf_pdfanalytics = async (req, res) => {
  try {
    const { url, category } = req.body;  
    console.log(req.body, "Request Body");

    // Normalize category to lowercase
    const normalizedCategory = category.toLowerCase();
    console.log(normalizedCategory, "Normalized Category");

    // Extract the document ID from the URL (assuming the ID is the last segment)
    const pdfId = url.split('/').pop();
    console.log(pdfId, "pdfId");

    // Fetch all analytics data for the given pdfId
    const pdfAnalytics = await Pdfanalytics.find({ pdfId });
    console.log(pdfAnalytics, "pdfAnalytics");

    if (!pdfAnalytics || pdfAnalytics.length === 0) {
      return res.status(404).json({ message: 'PDF document not found' });
    }

    let totalTimeSpent = 0;
    let totalPagesVisited = 0;
    let mostVisitedPage = '';
    let bounceSessions = 0;

    pdfAnalytics.forEach((doc) => {
      totalTimeSpent += doc.totalTimeSpent;
      totalPagesVisited += doc.totalPagesVisited;

      if (!mostVisitedPage && doc.mostVisitedPage) {
        mostVisitedPage = doc.mostVisitedPage;
      }

      // Bounce session condition (if only 1 page was visited)
      if (doc.totalPagesVisited === 1) {
        bounceSessions += 1;
      }
    });

    // Total sessions count (without Set)
    const totalSessions = pdfAnalytics.length;
    console.log("Total sessions for this PDF:", totalSessions);

    // Average Time Spent Calculation
    let averageTimeSpent = totalPagesVisited > 0 ? totalTimeSpent / totalPagesVisited : 0;
    console.log(averageTimeSpent, "Average Time Spent");

    // NEW USER COUNT
    const newUsers = await newUser.find({
      documentId: pdfId,
      [`count.${normalizedCategory}`]: { $gt: 0 },
    });

    const newUserCategoryCount = newUsers.reduce(
      (sum, user) => sum + (user.count[normalizedCategory] || 0),
      0
    );
    console.log("New user count for", normalizedCategory, ":", newUserCategoryCount);

    // RETURNED USER COUNT
    const returnedUsers = await ReturnedUser.find({
      documentId: pdfId,
      [`count.${normalizedCategory}`]: { $gt: 0 },
    });

    const returnedUserCategoryCount = returnedUsers.reduce(
      (sum, user) => sum + (user.count[normalizedCategory] || 0),
      0
    );
    console.log("Returned user count for", normalizedCategory, ":", returnedUserCategoryCount);

    // Bounce Rate Calculation
    const bounceRate = totalSessions > 0 ? (bounceSessions / totalSessions) * 100 : 0;
    console.log("Bounce Rate:", bounceRate.toFixed(2) + "%");

    // Prepare the response data
    const responseData = {
      totalPagesVisited,
      totalTimeSpent,
      averageTimeSpent,
      userCounts: {
        newuser: { [normalizedCategory]: newUserCategoryCount },
        returneduser: { [normalizedCategory]: ( returnedUserCategoryCount - newUserCategoryCount )},
      },
      mostVisitedPage,
      totalsession: totalSessions,  // Now using direct length instead of Set
      bounceRate
    };

    console.log(responseData, "Response Data");
    res.json(responseData);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: 'An error occurred while processing the metrics',
      error: error.message,
    });
  }
};


const Docx_docxanalytics = async (req, res) => {
  try {
    const { url, category } = req.body;
    console.log(req.body, "Request Body");

    // Validate input
    if (!url || !category) {
      return res.status(400).json({ message: "URL and category are required" });
    }

    // Normalize category to lowercase
    const normalizedCategory = category.toLowerCase();
    console.log(normalizedCategory, "Normalized Category");

    // Extract document ID from URL
    const docxId = url.split('/').pop();
    if (!docxId) {
      return res.status(400).json({ message: "Invalid document URL" });
    }
    console.log(docxId, "docxId");

    // Fetch analytics data
    const docxAnalytics = await Docxanalytics.find({ pdfId: docxId });
    if (!docxAnalytics.length) {
      return res.status(404).json({ message: "DOCX document not found" });
    }
    console.log(docxAnalytics, "docxAnalytics");

    // Compute metrics
    let totalTimeSpent = docxAnalytics.reduce((sum, doc) => sum + doc.totalTimeSpent, 0);
    let totalPagesVisited = docxAnalytics.reduce((sum, doc) => sum + doc.totalPagesVisited, 0);
    let mostVisitedPage = docxAnalytics
      .filter(doc => doc.mostVisitedPage)
      .sort((a, b) => b.totalPagesVisited - a.totalPagesVisited)[0]?.mostVisitedPage || "";

    let bounceSessions = docxAnalytics.filter(doc => doc.totalPagesVisited === 1).length;
    let totalSessions = docxAnalytics.length;
    let averageTimeSpent = totalPagesVisited > 0 ? totalTimeSpent / totalPagesVisited : 0;
    let bounceRate = totalSessions > 0 ? (bounceSessions / totalSessions) * 100 : 0;

    console.log({ averageTimeSpent, bounceRate }, "Computed Metrics");

    // Fetch New Users Count
    const newUsers = await newUser.find({
      documentId: docxId,
      [`count.${normalizedCategory}`]: { $gt: 0 },
    });
    let newUserCategoryCount = newUsers.reduce(
      (sum, user) => sum + (user.count[normalizedCategory] || 0),
      0
    );

    // Fetch Returned Users Count
    const returnedUsers = await ReturnedUser.find({
      documentId: docxId,
      [`count.${normalizedCategory}`]: { $gt: 0 },
    });
    let returnedUserCategoryCount = returnedUsers.reduce(
      (sum, user) => sum + (user.count[normalizedCategory] || 0),
      0
    );

    console.log("User Counts:", { newUserCategoryCount, returnedUserCategoryCount });

    // Prepare response
    const responseData = {
      totalPagesVisited,
      totalTimeSpent,
      averageTimeSpent,
      userCounts: {
        newuser: { [normalizedCategory]: newUserCategoryCount },
        returneduser: { [normalizedCategory]: ( returnedUserCategoryCount  - newUserCategoryCount ) },
      },
      mostVisitedPage,
      totalsession: totalSessions,
      bounceRate,
    };

    console.log(responseData, "Response Data");
    res.json(responseData);
  } catch (error) {
    console.error("Error processing DOCX metrics:", error);
    res.status(500).json({
      message: "An error occurred while processing the DOCX metrics",
      error: error.message,
    });
  }
};






const DeleteSession = async (req, res) => {
  try {
    const { shortId, mimeType } = req.body;

    console.log(shortId, mimeType);

    if (!shortId || !mimeType) {
      return res.status(400).json({ message: "URL and category are required." });
    }

    // Find and delete the record matching shortId.
    const deletedRecord = await ShortenedUrl.findOneAndDelete({ shortId });

    console.log(deletedRecord);

    if (!deletedRecord) {
      return res.status(404).json({ message: "Record not found." });
    }

    return res.status(200).json({
      message: "Record deleted successfully.",
      data: deletedRecord,  // Send the deleted record in the response
    });
  } catch (error) {
    console.error("Error deleting record:", error);
    return res.status(500).json({
      message: "Internal Server Error",
      error: error.message,
    });
  }
};




// Controller function to get documents filtered by pdfId and return only the createdAt field




const getUserActivitiesByPdfId = async (req, res) => {
  try {
    // Extract the pdfId from the URL in the request body
    const pdfIdFromUrl = req.body.url.split("/").pop();
    const { dateRange } = req.body; // Get the date range from the request body

    // Set date filters based on the provided date range
    let matchDateFilter = {};
    const today = moment().utc().startOf("day");

    switch (dateRange) {
      case "today":
        matchDateFilter = { createdAt: { $gte: today.toDate() } };
        break;
      case "yesterday":
        matchDateFilter = {
          createdAt: {
            $gte: moment().utc().subtract(1, "days").startOf("day").toDate(),
            $lt: moment().utc().subtract(1, "days").endOf("day").toDate(),
          },
        };
        break;
      case "lastWeek":
        matchDateFilter = {
          createdAt: {
            $gte: moment().utc().subtract(7, "days").startOf("day").toDate(),
            $lte: today.toDate(),
          },
        };
        break;
      case "lastMonth":
        matchDateFilter = {
          createdAt: {
            $gte: moment().utc().subtract(1, "months").startOf("month").toDate(),
            $lte: moment().utc().subtract(1, "months").endOf("month").toDate(),
          },
        };
        break;
      default:
        matchDateFilter = {}; // Fetch all records if no range is provided
    }

    // Aggregation pipeline for fetching user activities
    const aggregatePipeline = [
      { $match: { pdfId: pdfIdFromUrl, ...matchDateFilter } },
      {
        $project: {
          date: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          hour: { $hour: "$createdAt" },
        },
      },
      {
        $project: {
          date: 1,
          timeRange: {
            $cond: {
              if: { $lt: ["$hour", 12] },
              then: "00:00-12:00",
              else: "12:00-24:00",
            },
          },
        },
      },
      {
        $group: {
          _id: { date: "$date", timeRange: "$timeRange" },
          userCount: { $sum: 1 },
        },
      },
      { $sort: { "_id.date": 1, "_id.timeRange": 1 } },
    ];

    let userActivities = await Pdfanalytics.aggregate(aggregatePipeline);
    let response = [];

    if (userActivities.length > 0) {
      response = userActivities.map((item) => ({
        date: item._id.date,
        timeRange: item._id.timeRange,
        users: item.userCount,
      }));
    } else if (dateRange === "yesterday") {
      // Fetch all records from yesterday if no specific time-range data exists
      const fallbackData = await Pdfanalytics.find({
        pdfId: pdfIdFromUrl,
        createdAt: {
          $gte: moment().utc().subtract(1, "days").startOf("day").toDate(),
          $lt: moment().utc().subtract(1, "days").endOf("day").toDate(),
        },
      });

      response = fallbackData.map((record) => ({
        date: moment(record.createdAt).format("YYYY-MM-DD"),
        timeRange: "00:00-24:00",
        users: 1, // Assuming each record represents one user visit
      }));

      if (response.length === 0) {
        response = [
          {
            date: moment().utc().subtract(1, "days").format("YYYY-MM-DD"),
            timeRange: "00:00-12:00",
            users: 0,
          },
          {
            date: moment().utc().subtract(1, "days").format("YYYY-MM-DD"),
            timeRange: "12:00-24:00",
            users: 0,
          },
        ];
      }
    } else {
      // Default response when no data is found
      response = [
        {
          date: moment().utc().format("YYYY-MM-DD"),
          timeRange: "00:00-12:00",
          users: 0,
        },
        {
          date: moment().utc().format("YYYY-MM-DD"),
          timeRange: "12:00-24:00",
          users: 0,
        },
      ];
    }

    return res.status(200).json({
      success: true,
      data: response,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: "Server error, unable to fetch user activities",
    });
  }
};


const getUserActivitiesByDocxId = async (req, res) => {
  try {
    console.log("Incoming Request:", req.body); // Log request body

    // Extract the pdfId from the URL in the request body (assuming docx uses pdfId)
    const pdfIdFromUrl = req.body.url.split("/").pop();
    console.log("Extracted pdfId:", pdfIdFromUrl); // Log extracted pdfId

    const { dateRange } = req.body; // Get the date range from the request body
    console.log("Selected Date Range:", dateRange); // Log selected date range

    // Set date filters based on the provided date range
    let matchDateFilter = {};
    const today = moment().utc().startOf("day");

    switch (dateRange) {
      case "today":
        matchDateFilter = { createdAt: { $gte: today.toDate() } };
        break;
      case "yesterday":
        matchDateFilter = {
          createdAt: {
            $gte: moment().utc().subtract(1, "days").startOf("day").toDate(),
            $lt: moment().utc().subtract(1, "days").endOf("day").toDate(),
          },
        };
        break;
      case "lastWeek":
        matchDateFilter = {
          createdAt: {
            $gte: moment().utc().subtract(7, "days").startOf("day").toDate(),
            $lte: today.toDate(),
          },
        };
        break;
      case "lastMonth":
        matchDateFilter = {
          createdAt: {
            $gte: moment().utc().subtract(1, "months").startOf("month").toDate(),
            $lte: moment().utc().subtract(1, "months").endOf("month").toDate(),
          },
        };
        break;
      default:
        matchDateFilter = {}; // Fetch all records if no range is provided
    }

    console.log("Match Date Filter:", matchDateFilter); // Log date filter

    // Aggregation pipeline for fetching user activities
    const aggregatePipeline = [
      { $match: { pdfId: pdfIdFromUrl, ...matchDateFilter } }, // Using pdfId
      {
        $project: {
          date: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          hour: { $hour: "$createdAt" },
        },
      },
      {
        $project: {
          date: 1,
          timeRange: {
            $cond: {
              if: { $lt: ["$hour", 12] },
              then: "00:00-12:00",
              else: "12:00-24:00",
            },
          },
        },
      },
      {
        $group: {
          _id: { date: "$date", timeRange: "$timeRange" },
          userCount: { $sum: 1 },
        },
      },
      { $sort: { "_id.date": 1, "_id.timeRange": 1 } },
    ];

    console.log("Aggregation Pipeline:", JSON.stringify(aggregatePipeline, null, 2)); // Log pipeline

    let userActivities = await Docxanalytics.aggregate(aggregatePipeline);
    console.log("Fetched User Activities:", userActivities); // Log fetched activities

    let response = [];

    if (userActivities.length > 0) {
      response = userActivities.map((item) => ({
        date: item._id.date,
        timeRange: item._id.timeRange,
        users: item.userCount,
      }));
    } else if (dateRange === "yesterday") {
      // Fetch all records from yesterday if no specific time-range data exists
      const fallbackData = await Docxanalytics.find({
        pdfId: pdfIdFromUrl,
        createdAt: {
          $gte: moment().utc().subtract(1, "days").startOf("day").toDate(),
          $lt: moment().utc().subtract(1, "days").endOf("day").toDate(),
        },
      });

      response = fallbackData.map((record) => ({
        date: moment(record.createdAt).format("YYYY-MM-DD"),
        timeRange: "00:00-24:00",
        users: 1, // Assuming each record represents one user visit
      }));

      if (response.length === 0) {
        response = [
          {
            date: moment().utc().subtract(1, "days").format("YYYY-MM-DD"),
            timeRange: "00:00-12:00",
            users: 0,
          },
          {
            date: moment().utc().subtract(1, "days").format("YYYY-MM-DD"),
            timeRange: "12:00-24:00",
            users: 0,
          },
        ];
      }
    } else {
      // Default response when no data is found
      response = [
        {
          date: moment().utc().format("YYYY-MM-DD"),
          timeRange: "00:00-12:00",
          users: 0,
        },
        {
          date: moment().utc().format("YYYY-MM-DD"),
          timeRange: "12:00-24:00",
          users: 0,
        },
      ];
    }

    console.log("Final Response:", response); // Log final response

    return res.status(200).json({
      success: true,
      data: response,
    });
  } catch (error) {
    console.error("Error Occurred:", error); // Log error details
    return res.status(500).json({
      success: false,
      message: "Server error, unable to fetch user activities",
    });
  }
};

const getUserActivitiesByWebId = async (req, res) => {
  try {
    console.log("Incoming Request:", req.body); // Log request body

    // Extract the webId from the URL in the request body
    const webId = req.body.url.split("/").pop();
    console.log("Extracted webId:", webId); // Log extracted webId

    const { dateRange } = req.body; // Get the date range from the request body
    console.log("Selected Date Range:", dateRange); // Log selected date range

    // Set date filters based on the provided date range
    let matchDateFilter = {};
    const today = moment().utc().startOf("day");

    switch (dateRange) {
      case "today":
        matchDateFilter = { inTime: { $gte: today.toDate() } };
        break;
      case "yesterday":
        matchDateFilter = {
          inTime: {
            $gte: moment().utc().subtract(1, "days").startOf("day").toDate(),
            $lt: moment().utc().subtract(1, "days").endOf("day").toDate(),
          },
        };
        break;
      case "lastWeek":
        matchDateFilter = {
          inTime: {
            $gte: moment().utc().subtract(7, "days").startOf("day").toDate(),
            $lte: today.toDate(),
          },
        };
        break;
      case "lastMonth":
        matchDateFilter = {
          inTime: {
            $gte: moment().utc().subtract(1, "months").startOf("month").toDate(),
            $lte: moment().utc().subtract(1, "months").endOf("month").toDate(),
          },
        };
        break;
      default:
        matchDateFilter = {}; // Fetch all records if no range is provided
    }

    console.log("Match Date Filter:", matchDateFilter); // Log date filter

    // Aggregation pipeline for fetching user activities
    const aggregatePipeline = [
      { $match: { webId: webId, ...matchDateFilter } }, // Using webId
      {
        $project: {
          date: { $dateToString: { format: "%Y-%m-%d", date: "$inTime" } },
          hour: { $hour: "$inTime" },
        },
      },
      {
        $project: {
          date: 1,
          timeRange: {
            $cond: {
              if: { $lt: ["$hour", 12] },
              then: "00:00-12:00",
              else: "12:00-24:00",
            },
          },
        },
      },
      {
        $group: {
          _id: { date: "$date", timeRange: "$timeRange" },
          userCount: { $sum: 1 },
        },
      },
      { $sort: { "_id.date": 1, "_id.timeRange": 1 } },
    ];

    console.log("Aggregation Pipeline:", JSON.stringify(aggregatePipeline, null, 2)); // Log pipeline

    const userActivities = await Webanalytics.aggregate(aggregatePipeline); // Using Webanalytics collection
    console.log("Fetched User Activities:", userActivities); // Log fetched activities

    let response = [];

    if (userActivities.length > 0) {
      response = userActivities.map((item) => ({
        date: item._id.date,
        timeRange: item._id.timeRange,
        users: item.userCount,
      }));
    } else if (dateRange === "yesterday") {
      // Fetch all records from yesterday if no specific time-range data exists
      const fallbackData = await Webanalytics.find({
        webId: webId,
        inTime: {
          $gte: moment().utc().subtract(1, "days").startOf("day").toDate(),
          $lt: moment().utc().subtract(1, "days").endOf("day").toDate(),
        },
      });

      response = fallbackData.map((record) => ({
        date: moment(record.inTime).format("YYYY-MM-DD"),
        timeRange: "00:00-24:00",
        users: 1, // Assuming each record represents one user visit
      }));

      if (response.length === 0) {
        response = [
          {
            date: moment().utc().subtract(1, "days").format("YYYY-MM-DD"),
            timeRange: "00:00-12:00",
            users: 0,
          },
          {
            date: moment().utc().subtract(1, "days").format("YYYY-MM-DD"),
            timeRange: "12:00-24:00",
            users: 0,
          },
        ];
      }
    } else {
      // Default response when no data is found
      response = [
        {
          date: moment().utc().format("YYYY-MM-DD"),
          timeRange: "00:00-12:00",
          users: 0,
        },
        {
          date: moment().utc().format("YYYY-MM-DD"),
          timeRange: "12:00-24:00",
          users: 0,
        },
      ];
    }

    console.log("Final Response:", response); // Log final response

    return res.status(200).json({
      success: true,
      data: response,
    });
  } catch (error) {
    console.error("Error Occurred:", error); // Log error details
    return res.status(500).json({
      success: false,
      message: "Server error, unable to fetch user activities",
    });
  }
};






// Fetch coordinates dynamically based on location using a geocoding service
const fetchCoordinates = async (location) => {
  try {
    const apiKey = "8ff2824aad56454c81eb83de0ed489bd"; // OpenCage API Key
    const geocodingUrl = `https://api.opencagedata.com/geocode/v1/json?q=${encodeURIComponent(location)}&key=${apiKey}`;

    const response = await axios.get(geocodingUrl);
    
    if (response.data && response.data.results && response.data.results.length > 0) {
      const { lat, lng } = response.data.results[0].geometry;
      return [lng, lat]; // Returning coordinates [longitude, latitude]
    } else {
      console.warn(`No coordinates found for location: ${location}`);
      return [0, 0]; // Default fallback
    }
  } catch (error) {
    console.error("Error fetching coordinates:", error);
    return [0, 0]; // Default fallback
  }
};

// Fetch dynamic districts for each city (dynamically based on location)
const getDistricts = async (location) => {
  try {
    const apiKey = "8ff2824aad56454c81eb83de0ed489bd"; // OpenCage API Key
    const geocodingUrl = `https://api.opencagedata.com/geocode/v1/json?q=${encodeURIComponent(location)}&key=${apiKey}`;

    const response = await axios.get(geocodingUrl);
    
    if (response.data && response.data.results && response.data.results.length > 0) {
      const components = response.data.results[0].components;
      
      // Extract districts, city, or suburb if available
      const districts = components.city || components.suburb || components.town || [];
      return Array.isArray(districts) ? districts : [districts];
    } else {
      return []; // Return empty if no districts found
    }
  } catch (error) {
    console.error("Error fetching districts:", error);
    return []; // Fallback if API call fails
  }
};

// Calculate daily average percentage based on visit timestamps
const calculateDailyAvg = (visits) => {
  const days = visits.map(visit => visit.toISOString().split('T')[0]); // Extract date (YYYY-MM-DD)
  const uniqueDays = [...new Set(days)];
  return (visits.length / uniqueDays.length).toFixed(2); // Daily average views per day
};

// Calculate percentage change based on visits' views from first to last day
// Calculate percentage change based on views on the first day vs last day
// Calculate percentage change based on views on the first day vs last day
const calculateChange = (visits) => {
  // If there are fewer than two visits, we cannot calculate change
  if (visits.length <= 1) return 'no change'; // No change if only one visit

  // Sort the visits by date (earliest to latest)
  visits.sort((a, b) => new Date(a) - new Date(b));

  // Get the view count for the first and last visit day
  const firstDay = visits[0].toISOString().split('T')[0];  // First visit day
  const lastDay = visits[visits.length - 1].toISOString().split('T')[0]; // Last visit day

  // Filter the visits by first day and last day
  const firstDayViews = visits.filter(visit => visit.toISOString().split('T')[0] === firstDay).length;
  const lastDayViews = visits.filter(visit => visit.toISOString().split('T')[0] === lastDay).length;

  // If there's no difference in view counts between the first and last day
  if (firstDayViews === lastDayViews) {
    return 'no change'; // Return no change if views are the same
  }

  // Calculate percentage change based on the difference in views between first and last day
  const change = ((lastDayViews - firstDayViews) / firstDayViews) * 100;

  // Return 'up' or 'down' based on whether views increased or decreased
  return change > 0 ? 'up' : 'down';
};




// Calculate progress based on the number of visits over time (simplified for demo)
const calculateProgress = (visits) => {
  const timeSpan = visits[visits.length - 1] - visits[0]; // Time span between first and last visit
  const progress = (timeSpan / (1000 * 60 * 60 * 24)) * 100; // Progress based on time difference
  return progress;
};

const getPdfTraffic = async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ success: false, message: "URL is required" });

    // Extract PDF ID from URL
    const pdfId = url.split("/").pop();
    if (!pdfId) return res.status(400).json({ success: false, message: "Invalid URL format" });

    // Find all analytics data for the given PDF ID
    const analyticsData = await Pdfanalytics.find({ pdfId });
    if (!analyticsData.length) return res.status(404).json({ success: false, message: "No analytics found for this PDF" });

    // Extract unique userVisit ObjectIds
    const uniqueUserVisitIds = [...new Set(analyticsData.map(data => data.userVisit.toString()))];

    // Find all corresponding user visits
    const userVisitData = await UserVisit.find({ _id: { $in: uniqueUserVisitIds } });

    if (!userVisitData.length) return res.status(404).json({ success: false, message: "No user visit data found" });

    // Aggregate data to count unique region & city occurrences
    const aggregatedData = userVisitData.reduce((acc, visit) => {
      const location = visit.location.split(", ");
      const country = location.pop(); // Extract the country from location field
      const city = location.join(", "); // The city or district (e.g., "Mumbai")
      const region = visit.region; // Extract state (e.g., "Maharashtra")

      const key = country;

      if (!acc[key]) {
        acc[key] = {
          country: key,
          views: 0,
          visits: [], // Track visits to calculate daily averages and change
          districts: new Set(), // Track districts/regions
          states: new Set() // Track states (if needed)
        };
      }

      // Increment views for the country
      acc[key].views += 1;

      // Add timestamp of the visit for calculating daily averages and progress
      acc[key].visits.push(new Date(visit.createdAt));

      // Add district (city) to the district set (avoids duplicates)
      if (city) {
        acc[key].districts.add(city);
      }

      // Add state (region) to the state set (avoids duplicates)
      if (region) {
        acc[key].states.add(region);
      }

      return acc;
    }, {});

    // Now, we need to calculate dailyAvg, change, and progress dynamically
    const listViewData = await Promise.all(Object.values(aggregatedData).map(async (item) => {
      // Calculate daily average based on visit dates
      const dailyAvg = calculateDailyAvg(item.visits);
      const change = calculateChange(item.visits);
      const progress = calculateProgress(item.visits);

      // Fetch dynamic coordinates and districts based on country/city
      const coordinates = await fetchCoordinates(item.country);

      // Concatenate multiple districts and states (e.g., "Mumbai, Pune")
      const districts = Array.from(item.districts).join(", "); // Join districts with commas
      const states = Array.from(item.states).join(", "); // Join states with commas

      return {
        country: item.country,
        dailyAvg: `${dailyAvg}%`, // Format as a percentage
        change: change, // "up", "down", or "no change"
        views: item.views.toLocaleString(), // Format the views count
        progress: Math.round(progress), // Round progress to whole number
        coordinates: coordinates, // Dynamic coordinates
        districts: districts, // Dynamic districts (from region and city)
        states: states, // Dynamic states (from region)
      };
    }));

    return res.status(200).json({ success: true, data: { listViewData } });
  } catch (error) {
    console.error("Error fetching PDF traffic data:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};



const getdocxTraffic = async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ success: false, message: "URL is required" });

    // Extract PDF ID from URL
    const pdfId = url.split("/").pop();
    if (!pdfId) return res.status(400).json({ success: false, message: "Invalid URL format" });

    // Find all analytics data for the given PDF ID
    const analyticsData = await DocxAnalytics.find({ pdfId });
    if (!analyticsData.length) return res.status(404).json({ success: false, message: "No analytics found for this PDF" });

    // Extract unique userVisit ObjectIds
    const uniqueUserVisitIds = [...new Set(analyticsData.map(data => data.userVisit.toString()))];

    // Find all corresponding user visits
    const userVisitData = await UserVisit.find({ _id: { $in: uniqueUserVisitIds } });

    if (!userVisitData.length) return res.status(404).json({ success: false, message: "No user visit data found" });

    // Aggregate data to count unique region & city occurrences
    const aggregatedData = userVisitData.reduce((acc, visit) => {
      const location = visit.location.split(", ");
      const country = location.pop(); // Extract the country from location field
      const city = location.join(", "); // The city or district (e.g., "Mumbai")
      const region = visit.region; // Extract state (e.g., "Maharashtra")

      const key = country;

      if (!acc[key]) {
        acc[key] = {
          country: key,
          views: 0,
          visits: [], // Track visits to calculate daily averages and change
          districts: new Set(), // Track districts/regions
          states: new Set() // Track states (if needed)
        };
      }

      // Increment views for the country
      acc[key].views += 1;

      // Add timestamp of the visit for calculating daily averages and progress
      acc[key].visits.push(new Date(visit.createdAt));

      // Add district (city) to the district set (avoids duplicates)
      if (city) {
        acc[key].districts.add(city);
      }

      // Add state (region) to the state set (avoids duplicates)
      if (region) {
        acc[key].states.add(region);
      }

      return acc;
    }, {});

    // Now, we need to calculate dailyAvg, change, and progress dynamically
    const listViewData = await Promise.all(Object.values(aggregatedData).map(async (item) => {
      // Calculate daily average based on visit dates
      const dailyAvg = calculateDailyAvg(item.visits);
      const change = calculateChange(item.visits);
      const progress = calculateProgress(item.visits);

      // Fetch dynamic coordinates and districts based on country/city
      const coordinates = await fetchCoordinates(item.country);

      // Concatenate multiple districts and states (e.g., "Mumbai, Pune")
      const districts = Array.from(item.districts).join(", "); // Join districts with commas
      const states = Array.from(item.states).join(", "); // Join states with commas

      return {
        country: item.country,
        dailyAvg: `${dailyAvg}%`, // Format as a percentage
        change: change, // "up", "down", or "no change"
        views: item.views.toLocaleString(), // Format the views count
        progress: Math.round(progress), // Round progress to whole number
        coordinates: coordinates, // Dynamic coordinates
        districts: districts, // Dynamic districts (from region and city)
        states: states, // Dynamic states (from region)
      };
    }));

    return res.status(200).json({ success: true, data: { listViewData } });
  } catch (error) {
    console.error("Error fetching PDF traffic data:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};







const getTimeSpentByWeek = async (req, res) => {
  try {
      // Extract PDF ID from URL
      const { url } = req.body;
      const pdfId = url.split("/").pop();

      // Get the last 7 days (including today)
      const startDate = moment().subtract(6, "days").startOf("day");
      const endDate = moment().endOf("day");

      // Fetch documents matching pdfId and createdAt range
      const records = await Pdfanalytics.find({
          pdfId: pdfId,
          createdAt: { $gte: startDate.toDate(), $lte: endDate.toDate() },
      });

      // Initialize an object for last 7 days with default time as 0
      const timeSpentPerDay = {};
      for (let i = 0; i < 7; i++) {
          const day = moment().subtract(6 - i, "days").format("ddd"); // Generate last 7 days
          timeSpentPerDay[day] = 0;
      }

      // Aggregate time spent from records
      records.forEach((record) => {
          const dayName = moment(record.createdAt).format("ddd"); // Get day name
          if (timeSpentPerDay.hasOwnProperty(dayName)) {
              timeSpentPerDay[dayName] += record.totalTimeSpent || 0;
          }
      });

      // Convert to response format (ensuring exactly 7 unique days)
      const response = Object.entries(timeSpentPerDay).map(([day, time]) => ({
          name: day,
          time: time,
      }));

      return res.json(response);
  } catch (error) {
      console.error("Error fetching time spent by week:", error);
      return res.status(500).json({ message: "Server error" });
  }
};

const getTimeSpentByWeekDocx = async (req, res) => {
  try {
      // Extract PDF ID from URL
      const { url } = req.body;
      const pdfId = url.split("/").pop();

      // Get the last 7 days (including today)
      const startDate = moment().subtract(6, "days").startOf("day");
      const endDate = moment().endOf("day");

      // Fetch documents matching pdfId and createdAt range
      const records = await Docxanalytics.find({
          pdfId: pdfId,
          createdAt: { $gte: startDate.toDate(), $lte: endDate.toDate() },
      });

      // Initialize an object for last 7 days with default time as 0
      const timeSpentPerDay = {};
      for (let i = 0; i < 7; i++) {
          const day = moment().subtract(6 - i, "days").format("ddd"); // Generate last 7 days
          timeSpentPerDay[day] = 0;
      }

      // Aggregate time spent from records
      records.forEach((record) => {
          const dayName = moment(record.createdAt).format("ddd"); // Get day name
          if (timeSpentPerDay.hasOwnProperty(dayName)) {
              timeSpentPerDay[dayName] += record.totalTimeSpent || 0;
          }
      });

      // Convert to response format (ensuring exactly 7 unique days)
      const response = Object.entries(timeSpentPerDay).map(([day, time]) => ({
          name: day,
          time: time,
      }));

      return res.json(response);
  } catch (error) {
      console.error("Error fetching time spent by week:", error);
      return res.status(500).json({ message: "Server error" });
  }
};



const getDeviceAnalytics = async (req, res) => {
  try {
    const { url } = req.body;
    const pdfId = url.split("/").pop();

    if (!pdfId) {
      return res.status(400).json({ message: "PDF ID is required" });
    }

    // Fetch all user visits related to the given PDF ID
    const pdfVisits = await Pdfanalytics.find({ pdfId });

    if (!pdfVisits.length) {
      return res.status(404).json({ message: "No data found for this PDF ID" });
    }

    // Extract user IDs from the visits
    const userIds = pdfVisits.map((visit) => visit.userId);

    // Fetch device info based on userIds
    const devices = await UserVisit.find({ userId: { $in: userIds } });

    if (!devices.length) {
      return res.status(404).json({ message: "No device data found" });
    }

    // Count the number of devices per OS
    const osCount = {};
    devices.forEach((device) => {
      osCount[device.os] = (osCount[device.os] || 0) + 1;
    });

    // Convert OS data into required format
    const osData = Object.keys(osCount).map((os) => ({
      name: os,
      value: osCount[os],
    }));

    return res.status(200).json({
      totalDevices: devices.length,
      osData,
    });
  } catch (error) {
    console.error("Error fetching device analytics:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};


const getDeviceAnalyticsdocx = async (req, res) => {
  try {
    const { url } = req.body;
    const pdfId = url.split("/").pop();

    if (!pdfId) {
      return res.status(400).json({ message: "PDF ID is required" });
    }

    // Fetch all user visits related to the given PDF ID
    const pdfVisits = await DocxAnalytics.find({ pdfId });

    console.log(pdfVisits, "pdfvisits")

    if (!pdfVisits.length) {
      return res.status(404).json({ message: "No data found for this PDF ID" });
    }

    // Extract user IDs from the visits
    const userIds = pdfVisits.map((visit) => visit.userVisit);

    console.log(userIds , "userids")

    // Fetch device info based on userIds
    const devices = await UserVisit.find({ _id: { $in: userIds } });

    console.log(devices, "devices")

    if (!devices.length) {
      return res.status(404).json({ message: "No device data found" });
    }

    // Count the number of devices per OS
    const osCount = {};
    devices.forEach((device) => {
      osCount[device.os] = (osCount[device.os] || 0) + 1;
    });

    // Convert OS data into required format
    const osData = Object.keys(osCount).map((os) => ({
      name: os,
      value: osCount[os],
    }));

    return res.status(200).json({
      totalDevices: devices.length,
      osData,
    });
  } catch (error) {
    console.error("Error fetching device analytics:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};


const getVideoAnalytics = async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ message: "URL is required." });

    // Extract videoId from URL
    const videoId = url.split("/").pop();
    if (!videoId)
      return res.status(400).json({ message: "Video ID is required." });

    // Fetch all analytics data for the given videoId
    const videoAnalytics = await VideoAnalytics.find({ videoId });
    // If no analytics data exists, return dummy data
    if (!videoAnalytics || videoAnalytics.length === 0) {
      return res.json({
        totalTimeSpent: 0,
        playCount: 0,
        pauseCount: 0,
        seekCount: 0,
        averageWatchTime: 0,
        userCounts: { newuser: { video: 0 }, returneduser: { video: 0 } },
        totalsession: 0,
        bounceRate: 0,
        durationAnalytics: [],
      });
    }

    // ============================
    // Part 1: Overall Video Metrics
    // ============================
    let totalWatchTime = 0,
      playCount = 0,
      pauseCount = 0,
      seekCount = 0,
      totalSessions = videoAnalytics.length,
      bounceSessions = 0;

    videoAnalytics.forEach((video) => {
      totalWatchTime += video.totalWatchTime;
      playCount += video.playCount;
      pauseCount += video.pauseCount;
      seekCount += video.seekCount;
      // Bounce session logic: Adjust as needed
      if (video.playCount === 1 && video.totalWatchTime > 10) {
        bounceSessions++;
      }
    });

    let averageWatchTime = totalSessions > 0 ? totalWatchTime / totalSessions : 0;
    let bounceRate = totalSessions > 0 ? (bounceSessions / totalSessions) * 100 : 0;

    // Fetch user counts (new and returned) using videoId
    const newUsers = await newUser.find({ documentId: videoId, "count.video": { $gt: 0 } });
    let newUserVideoCount = newUsers.reduce((sum, user) => sum + user.count.video, 0);
    
    const returnedUsers = await ReturnedUser.find({ documentId: videoId, "count.video": { $gt: 0 } });
    let returnedUserVideoCount = returnedUsers.reduce((sum, user) => sum + user.count.video, 0);

    // ============================
    // Part 2: Duration Range Analytics
    // ============================
    // Initialize a mapping to store views and unique users for each duration range
    let durationViewsMap = {};

    videoAnalytics.forEach((data) => {
      // Process skip events (forward/backward)
      data.skipEvents.forEach((event) => {
        const from = Math.round(event.from);
        const to = Math.round(event.to);
        const start = Math.min(from, to);
        const end = Math.max(from, to);
        if (start === end) return; // ignore single point ranges

        const durationRange = `${start} to ${end}`;
        if (!durationViewsMap[durationRange]) {
          durationViewsMap[durationRange] = { views: 0, users: new Set() };
        }
        durationViewsMap[durationRange].views += 1;
        durationViewsMap[durationRange].users.add(data.userVisit.toString());
      });

      // Process jump events (e.g., replays)
      data.jumpEvents.forEach((event) => {
        const from = Math.round(event.from);
        const to = Math.round(event.to);
        const start = Math.min(from, to);
        const end = Math.max(from, to);
        if (start === end) return;

        const jumpRange = `${start} to ${end}`;
        if (!durationViewsMap[jumpRange]) {
          durationViewsMap[jumpRange] = { views: 0, users: new Set() };
        }
        durationViewsMap[jumpRange].views += 1;
        durationViewsMap[jumpRange].users.add(data.userVisit.toString());
      });
    });

    // Prepare a list from the mapping
    const finalDurationList = Object.keys(durationViewsMap).map((range) => {
      const segment = durationViewsMap[range];
      return {
        durationRange: range,
        views: segment.views,
        usersCount: segment.users.size,
      };
    });

    // Merge similar (overlapping or adjacent) ranges
    let mergedDurationList = [];
    finalDurationList.forEach((item) => {
      let found = false;
      mergedDurationList = mergedDurationList.map((existingItem) => {
        const [existingStart, existingEnd] = existingItem.durationRange
          .split(" to ")
          .map(Number);
        const [newStart, newEnd] = item.durationRange.split(" to ").map(Number);

        // If ranges are overlapping or adjacent, merge them
        if (
          (existingStart <= newStart && existingEnd >= newStart) ||
          (existingStart <= newEnd && existingEnd >= newEnd)
        ) {
          existingItem.views += item.views;
          existingItem.usersCount += item.usersCount;
          found = true;
        }
        return existingItem;
      });
      if (!found) {
        mergedDurationList.push({ ...item });
      }
    });

    // Sort by views (ascending) and then by usersCount (descending)
    mergedDurationList.sort((a, b) => {
      if (a.views === b.views) {
        return b.usersCount - a.usersCount;
      }
      return a.views - b.views;
    });

    // Filter out any ranges with less than 1 view (if necessary)
    const filteredDurationList = mergedDurationList.filter((item) => item.views >= 1);

    // ============================
    // Part 3: Prepare Final Response
    // ============================
    // Fetch the original URL for the video using the shortened URL model
    const shortenedUrl = await ShortenedUrl.findOne({ shortId: videoId });
    if (!shortenedUrl) {
      return res
        .status(404)
        .json({ message: "No original URL found for this video ID" });
    }

    const responseData = {
      totalTimeSpent: totalWatchTime,
      playCount,
      pauseCount,
      seekCount,
      averageWatchTime,
      userCounts: {
        newuser: { video: newUserVideoCount },
        returneduser: { video: ( returnedUserVideoCount - newUserVideoCount ) },
      },
      totalsession: totalSessions,
      bounceRate,
      durationAnalytics: filteredDurationList, // merged & sorted duration ranges
      Videosourceurl: shortenedUrl.originalUrl,
    };

    return res.json(responseData);
  } catch (error) {
    console.error("Error processing video metrics:", error);
    return res.status(500).json({
      message: "An error occurred while processing the video metrics",
      error: error.message,
    });
  }
};




const getUserActivitiesByVideoId = async (req, res) => {
  try {
    // Extract the pdfId from the URL in the request body
    const pdfIdFromUrl = req.body.url.split("/").pop();
    const { dateRange } = req.body; // Get the date range from the request body

    // Set date filters based on the provided date range
    let matchDateFilter = {};
    const today = moment().startOf("day");

    switch (dateRange) {
      case "today":
        matchDateFilter = { createdAt: { $gte: today.toDate() } };
        break;
      case "yesterday":
        matchDateFilter = {
          createdAt: {
            $gte: moment().subtract(1, "days").startOf("day").toDate(),
            $lt: moment().subtract(1, "days").endOf("day").toDate(),
          },
        };
        break;
        case "lastWeek":
          matchDateFilter = {
            createdAt: {
              $gte: moment().subtract(1, "weeks").startOf("week").toDate(),
              $lte: moment().subtract(1, "weeks").endOf("week").toDate(),
            },
          };
          break;        
      case "lastMonth":
        matchDateFilter = {
          createdAt: {
            $gte: moment().subtract(1, "months").startOf("month").toDate(),
            $lte: moment().subtract(1, "months").endOf("month").toDate(),
          },
        };
        break;
      default:
        matchDateFilter = {}; // Fetch all records if no range is provided
    }

    // Aggregation pipeline for fetching user activities
    const aggregatePipeline = [
      { $match: { videoId: pdfIdFromUrl, ...matchDateFilter } },
      {
        $project: {
          date: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          hour: { $hour: "$createdAt" },
        },
      },
      {
        $project: {
          date: 1,
          timeRange: {
            $cond: {
              if: { $lt: ["$hour", 12] },
              then: "00:00-12:00",
              else: "12:00-24:00",
            },
          },
        },
      },
      {
        $group: {
          _id: { date: "$date", timeRange: "$timeRange" },
          userCount: { $sum: 1 },
        },
      },
      { $sort: { "_id.date": 1, "_id.timeRange": 1 } },
    ];

    const userActivities = await VideoAnalytics.aggregate(aggregatePipeline);

    let response = [];

    if (userActivities.length > 0) {
      response = userActivities.map((item) => ({
        date: item._id.date,
        timeRange: item._id.timeRange,
        users: item.userCount,
      }));
    } else {
      // If no data, return today's date with 0 users
      response = [
        {
          date: moment().format("YYYY-MM-DD"),
          timeRange: "00:00-12:00",
          users: 0,
        },
        {
          date: moment().format("YYYY-MM-DD"),
          timeRange: "12:00-24:00",
          users: 0,
        },
      ];
    }

    return res.status(200).json({
      success: true,
      data: response,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: "Server error, unable to fetch user activities",
    });
  }
};



const getVideoTraffic = async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ success: false, message: "URL is required" });

    // Extract PDF ID from URL
    const videoId = url.split("/").pop();
    if (!videoId) return res.status(400).json({ success: false, message: "Invalid URL format" });

    // Find all analytics data for the given PDF ID
    const analyticsData = await VideoAnalytics.find({ videoId });
    console.log(analyticsData, "ana;lytics")
    if (!analyticsData.length) return res.status(404).json({ success: false, message: "No analytics found for this PDF" });

    // Extract unique userVisit ObjectIds
    const uniqueUserVisitIds = [...new Set(analyticsData.map(data => data.userVisit.toString()))];

    // Find all corresponding user visits
    const userVisitData = await UserVisit.find({ _id: { $in: uniqueUserVisitIds } });

    console.log(userVisitData, "uservit")

    if (!userVisitData.length) return res.status(404).json({ success: false, message: "No user visit data found" });

    // Aggregate data to count unique region & city occurrences
    const aggregatedData = userVisitData.reduce((acc, visit) => {
      const location = visit.location.split(", ");
      const country = location.pop(); // Extract the country from location field
      const city = location.join(", "); // The city or district (e.g., "Mumbai")
      const region = visit.region; // Extract state (e.g., "Maharashtra")

      const key = country;

      if (!acc[key]) {
        acc[key] = {
          country: key,
          views: 0,
          visits: [], // Track visits to calculate daily averages and change
          districts: new Set(), // Track districts/regions
          states: new Set() // Track states (if needed)
        };
      }

      // Increment views for the country
      acc[key].views += 1;

      // Add timestamp of the visit for calculating daily averages and progress
      acc[key].visits.push(new Date(visit.createdAt));

      // Add district (city) to the district set (avoids duplicates)
      if (city) {
        acc[key].districts.add(city);
      }

      // Add state (region) to the state set (avoids duplicates)
      if (region) {
        acc[key].states.add(region);
      }

      return acc;
    }, {});

    // Now, we need to calculate dailyAvg, change, and progress dynamically
    const listViewData = await Promise.all(Object.values(aggregatedData).map(async (item) => {
      // Calculate daily average based on visit dates
      const dailyAvg = calculateDailyAvg(item.visits);
      const change = calculateChange(item.visits);
      const progress = calculateProgress(item.visits);

      // Fetch dynamic coordinates and districts based on country/city
      const coordinates = await fetchCoordinates(item.country);

      // Concatenate multiple districts and states (e.g., "Mumbai, Pune")
      const districts = Array.from(item.districts).join(", "); // Join districts with commas
      const states = Array.from(item.states).join(", "); // Join states with commas

      return {
        country: item.country,
        dailyAvg: `${dailyAvg}%`, // Format as a percentage
        change: change, // "up", "down", or "no change"
        views: item.views.toLocaleString(), // Format the views count
        progress: Math.round(progress), // Round progress to whole number
        coordinates: coordinates, // Dynamic coordinates
        districts: districts, // Dynamic districts (from region and city)
        states: states, // Dynamic states (from region)
      };
    }));

    return res.status(200).json({ success: true, data: { listViewData } });
  } catch (error) {
    console.error("Error fetching PDF traffic data:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};



const getWebTraffic = async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ success: false, message: "URL is required" });

    // Extract webId from the URL
    const webId = url.split("/").pop();
    if (!webId) return res.status(400).json({ success: false, message: "Invalid URL format" });

    // Find all analytics data for the given webId
    const analyticsData = await Webanalytics.find({ webId });
    console.log(analyticsData, "analytics data");
    if (!analyticsData.length) return res.status(404).json({ success: false, message: "No analytics found for this web page" });

    // Extract unique userVisit ObjectIds
    const uniqueUserVisitIds = [...new Set(analyticsData.map(data => data.userVisit.toString()))];

    // Find all corresponding user visit data
    const userVisitData = await UserVisit.find({ _id: { $in: uniqueUserVisitIds } });
    console.log(userVisitData, "user visit data");

    if (!userVisitData.length) return res.status(404).json({ success: false, message: "No user visit data found" });

    // Aggregate data to count unique region & city occurrences
    const aggregatedData = userVisitData.reduce((acc, visit) => {
      const location = visit.location.split(", ");
      const country = location.pop(); // Extract the country from location field
      const city = location.join(", "); // The city or district (e.g., "Mumbai")
      const region = visit.region; // Extract state (e.g., "Maharashtra")

      const key = country;

      if (!acc[key]) {
        acc[key] = {
          country: key,
          views: 0,
          visits: [], // Track visits to calculate daily averages and change
          districts: new Set(), // Track districts/regions
          states: new Set() // Track states (if needed)
        };
      }

      // Increment views for the country
      acc[key].views += 1;

      // Add timestamp of the visit for calculating daily averages and progress
      acc[key].visits.push(new Date(visit.createdAt));

      // Add district (city) to the district set (avoids duplicates)
      if (city) {
        acc[key].districts.add(city);
      }

      // Add state (region) to the state set (avoids duplicates)
      if (region) {
        acc[key].states.add(region);
      }

      return acc;
    }, {});

    // Now, we need to calculate dailyAvg, change, and progress dynamically
    const listViewData = await Promise.all(Object.values(aggregatedData).map(async (item) => {
      // Calculate daily average based on visit dates
      const dailyAvg = calculateDailyAvg(item.visits);
      const change = calculateChange(item.visits);
      const progress = calculateProgress(item.visits);

      // Fetch dynamic coordinates and districts based on country/city
      const coordinates = await fetchCoordinates(item.country);

      // Concatenate multiple districts and states (e.g., "Mumbai, Pune")
      const districts = Array.from(item.districts).join(", "); // Join districts with commas
      const states = Array.from(item.states).join(", "); // Join states with commas

      return {
        country: item.country,
        dailyAvg: `${dailyAvg}%`, // Format as a percentage
        change: change, // "up", "down", or "no change"
        views: item.views.toLocaleString(), // Format the views count
        progress: Math.round(progress), // Round progress to whole number
        coordinates: coordinates, // Dynamic coordinates
        districts: districts, // Dynamic districts (from region and city)
        states: states, // Dynamic states (from region)
      };
    }));

    return res.status(200).json({ success: true, data: { listViewData } });
  } catch (error) {
    console.error("Error fetching web traffic data:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};




const getTimeSpentByWeekVideo = async (req, res) => {
  try {
      // Extract PDF ID from URL
      const { url } = req.body;
      const videoId = url.split("/").pop();
      console.log(videoId, "videoid")

      // Get the last 7 days (including today)
      const startDate = moment().subtract(6, "days").startOf("day");
      const endDate = moment().endOf("day");

      // Fetch documents matching pdfId and createdAt range
      const records = await VideoAnalytics.find({
          videoId: videoId,
          createdAt: { $gte: startDate.toDate(), $lte: endDate.toDate() },
      });

      console.log(records, 'records')

      // Initialize an object for last 7 days with default time as 0
      const timeSpentPerDay = {};
      for (let i = 0; i < 7; i++) {
          const day = moment().subtract(6 - i, "days").format("ddd"); // Generate last 7 days
          timeSpentPerDay[day] = 0;
      }

      console.log(timeSpentPerDay, "Initialized timeSpentPerDay");

      // Aggregate time spent from records
      records.forEach((record) => {
          const dayName = moment(record.createdAt).format("ddd"); // Get day name
          if (timeSpentPerDay.hasOwnProperty(dayName)) {
              timeSpentPerDay[dayName] += record.totalWatchTime || 0; // Use totalWatchTime instead of totalTimeSpent
          }
      });

      // Convert to response format (ensuring exactly 7 unique days)
      const response = Object.entries(timeSpentPerDay).map(([day, time]) => ({
          name: day,
          time: time,
      }));

      return res.json(response);
  } catch (error) {
      console.error("Error fetching time spent by week:", error);
      return res.status(500).json({ message: "Server error" });
  }
};


const getTimeSpentByWeekWeb = async (req, res) => {
  try {
    // Extract webId from URL
    const { url } = req.body;
    const webId = url.split("/").pop();
    console.log(webId, "webId");

    // Get the last 7 days (including today)
    const startDate = moment().subtract(6, "days").startOf("day");
    const endDate = moment().endOf("day");

    // Fetch documents matching webId and createdAt range
    const records = await Webanalytics.find({
      webId: webId,
      createdAt: { $gte: startDate.toDate(), $lte: endDate.toDate() },
    });

    console.log(records, 'records');

    // Initialize an object for last 7 days with default time as 0
    const timeSpentPerDay = {};
    for (let i = 0; i < 7; i++) {
      const day = moment().subtract(6 - i, "days").format("ddd"); // Generate last 7 days
      timeSpentPerDay[day] = 0;
    }

    console.log(timeSpentPerDay, "Initialized timeSpentPerDay");

    // Aggregate time spent from records
    records.forEach((record) => {
      const dayName = moment(record.createdAt).format("ddd"); // Get day name
      if (timeSpentPerDay.hasOwnProperty(dayName)) {
        timeSpentPerDay[dayName] += record.totalTimeSpent || 0; // Use totalTimeSpent
      }
    });

    // Convert to response format (ensuring exactly 7 unique days)
    const response = Object.entries(timeSpentPerDay).map(([day, time]) => ({
      name: day,
      time: time,
    }));

    return res.json(response);
  } catch (error) {
    console.error("Error fetching time spent by week:", error);
    return res.status(500).json({ message: "Server error" });
  }
};



const getDeviceAnalyticsVideo = async (req, res) => {
  try {
    const { url } = req.body;
    const videoId = url.split("/").pop();
    console.log(videoId, "videoid")

    if (!videoId) {
      return res.status(400).json({ message: "PDF ID is required" });
    }

    // Fetch all user visits related to the given PDF ID
    const pdfVisits = await VideoAnalytics.find({ videoId });
    console.log(pdfVisits, "videovisites")

    if (!pdfVisits.length) {
      return res.status(404).json({ message: "No data found for this PDF ID" });
    }

    // Extract user IDs from the visits
    const userIds = pdfVisits.map((visit) => visit.userVisit);

    console.log(userIds, "userIds")

    // Fetch device info based on userIds
    const devices = await UserVisit.find({ _id: { $in: userIds } });

    console.log(devices, 'devices')

    if (!devices.length) {
      return res.status(404).json({ message: "No device data found" });
    }

    // Count the number of devices per OS
    const osCount = {};
    devices.forEach((device) => {
      osCount[device.os] = (osCount[device.os] || 0) + 1;
    });

    // Convert OS data into required format
    const osData = Object.keys(osCount).map((os) => ({
      name: os,
      value: osCount[os],
    }));

    return res.status(200).json({
      totalDevices: devices.length,
      osData,
    });
  } catch (error) {
    console.error("Error fetching device analytics:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};


const getPdfviewanalytics = async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ message: "URL is required." });

    const pdfId = url.split("/").pop();

    // Fetch URL details from ShortenedUrl collection
    const urlData = await ShortenedUrl.findOne({ shortId: pdfId }).lean();
    if (!urlData) {
      return res.status(404).json({ message: "No URL data found for this shortId." });
    }

    const { totalPages } = urlData; // Extract total pages

    // Fetch all analytics for the given pdfId
    const analyticsData = await Pdfanalytics.find({ pdfId }).lean();
    if (!analyticsData.length) {
      return res.status(404).json({ message: "No analytics data found for this PDF." });
    }

    // Calculate total time spent per page
    const totalPageTime = {};
    let totalTimeSpent = 0; // Variable to store total time spent across all users
    let totalUsers = analyticsData.length; // Total number of users who viewed the PDF

    analyticsData.forEach((doc) => {
      totalTimeSpent += doc.totalTimeSpent; // Sum up all the time spent
      Object.entries(doc.pageTimeSpent || {}).forEach(([page, time]) => {
        totalPageTime[page] = (totalPageTime[page] || 0) + time;
      });
    });

    // Convert totalTimeSpent (in seconds) to hours, minutes, and seconds
    const totalTimeInMinutes = totalTimeSpent / 60;
    const totalTimeInHours = totalTimeInMinutes / 60;
    const remainingMinutes = Math.floor(totalTimeInMinutes % 60);
    const remainingSeconds = Math.floor(totalTimeSpent % 60);

    const totalTimeReadable = {
      hours: Math.floor(totalTimeInHours),
      minutes: remainingMinutes,
      seconds: remainingSeconds,
    };

    // Calculate average time spent per user (in seconds)
    const averageTimeSpent = totalTimeSpent / totalUsers;
    const averageTimeInMinutes = averageTimeSpent / 60;
    const averageTimeInHours = averageTimeInMinutes / 60;
    const avgRemainingMinutes = Math.floor(averageTimeInMinutes % 60);
    const avgRemainingSeconds = Math.floor(averageTimeSpent % 60);

    const averageTimeReadable = {
      hours: Math.floor(averageTimeInHours),
      minutes: avgRemainingMinutes,
      seconds: avgRemainingSeconds,
    };

    // Select only the **top 7 pages** based on the most time spent
    const topPages = Object.entries(totalPageTime)
      .sort((a, b) => b[1] - a[1]) // Sort pages by time spent (descending)
      .slice(0, 7) // Take only the top 7 pages
      .map(([page]) => parseInt(page)); // Extract page numbers

    // Track most selected text dynamically but only for the top 7 pages
    const textCountMap = new Map();
    analyticsData.forEach((doc) => {
      doc.selectedTexts.forEach(({ selectedText, count, page }) => {
        if (!topPages.includes(page)) return; // Skip pages not in top 7

        const key = `${selectedText}|||${page}`; // Unique key (text + page)
        if (!textCountMap.has(key)) {
          textCountMap.set(key, { selectedText, count, page });
        } else {
          textCountMap.get(key).count += count;
        }
      });
    });

    // Convert to sorted array based on most selected text
    const mostSelectedTexts = Array.from(textCountMap.values())
      .filter(item => item.count > 3) // Only include texts with count > 1
      .sort((a, b) => b.count - a.count || a.page - b.page); // Sort by count, then page

    res.json({
      totalPageTime,
      mostSelectedTexts, // Only most selected texts with count > 3
      totalPages,
      topPages, // Send back the top 7 pages calculated
      totalTimeReadable, // Return total time spent in readable format
      averageTimeReadable, // Return average time spent per user in readable format
    });
  } catch (error) {
    console.error("Error fetching analytics data:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};



const getDeviceAnalyticsWeb = async (req, res) => {
  try {
    const { url } = req.body;
    const webId = url.split("/").pop();
    console.log(webId, "webId");

    if (!webId) {
      return res.status(400).json({ message: "Web ID is required" });
    }

    // Fetch all user visits related to the given webId
    const webVisits = await Webanalytics.find({ webId });
    console.log(webVisits, "webVisits");

    if (!webVisits.length) {
      return res.status(404).json({ message: "No data found for this Web ID" });
    }

    // Extract user IDs from the visits
    const userIds = webVisits.map((visit) => visit.userVisit);

    console.log(userIds, "userIds");

    // Fetch device info based on userIds
    const devices = await UserVisit.find({ _id: { $in: userIds } });

    console.log(devices, 'devices');

    if (!devices.length) {
      return res.status(404).json({ message: "No device data found" });
    }

    // Count the number of devices per OS
    const osCount = {};
    devices.forEach((device) => {
      osCount[device.os] = (osCount[device.os] || 0) + 1;
    });

    // Convert OS data into required format
    const osData = Object.keys(osCount).map((os) => ({
      name: os,
      value: osCount[os],
    }));

    return res.status(200).json({
      totalDevices: devices.length,
      osData,
    });
  } catch (error) {
    console.error("Error fetching device analytics:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};




const getDocxiewanalytics = async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) {
      return res.status(400).json({ message: "URL is required." });
    }

    const pdfId = url.split("/").pop();
    console.log("pdfId extracted from URL:", pdfId);

    // Fetch URL details from ShortenedUrl collection
    const urlData = await ShortenedUrl.findOne({ shortId: pdfId }).lean();
    if (!urlData) {
      return res.status(404).json({ message: "No URL data found for this shortId." });
    }

    console.log("URL Data found:", urlData);

    const { totalPages } = urlData; // Extract total pages
    console.log("Total Pages in the document:", totalPages);

    // Fetch all analytics for the given pdfId
    const analyticsData = await Docxanalytics.find({ pdfId }).lean();
    if (!analyticsData.length) {
      return res.status(404).json({ message: "No analytics data found for this PDF." });
    }

    console.log("Analytics Data:", analyticsData);

    // Calculate total time spent per page and other metrics
    const totalPageTime = {};
    let totalTimeSpent = 0; // Variable to store total time spent across all users
    let totalUsers = analyticsData.length; // Total number of users who viewed the PDF

    analyticsData.forEach((doc, index) => {
      console.log(`Processing analytics for user ${index + 1}`);
      totalTimeSpent += doc.totalTimeSpent; // Sum up all the time spent
      console.log(`Total Time Spent by user ${index + 1}: ${doc.totalTimeSpent}`);
      
      // Process pageTimeSpent data
      Object.entries(doc.pageTimeSpent || {}).forEach(([page, time]) => {
        totalPageTime[page] = (totalPageTime[page] || 0) + time;
        console.log(`Added time for page ${page}: ${time}`);
      });
    });

    console.log("Total Time Spent Across All Users:", totalTimeSpent);
    console.log("Total Time Spent per Page:", totalPageTime);

    // Convert totalTimeSpent (in seconds) to hours, minutes, and seconds
    const totalTimeInMinutes = totalTimeSpent / 60;
    const totalTimeInHours = totalTimeInMinutes / 60;
    const remainingMinutes = Math.floor(totalTimeInMinutes % 60);
    const remainingSeconds = Math.floor(totalTimeSpent % 60);

    const totalTimeReadable = {
      hours: Math.floor(totalTimeInHours),
      minutes: remainingMinutes,
      seconds: remainingSeconds,
    };
    console.log("Total Time Readable:", totalTimeReadable);

    // Calculate average time spent per user (in seconds)
    const averageTimeSpent = totalTimeSpent / totalUsers;
    const averageTimeInMinutes = averageTimeSpent / 60;
    const averageTimeInHours = averageTimeInMinutes / 60;
    const avgRemainingMinutes = Math.floor(averageTimeInMinutes % 60);
    const avgRemainingSeconds = Math.floor(averageTimeSpent % 60);

    const averageTimeReadable = {
      hours: Math.floor(averageTimeInHours),
      minutes: avgRemainingMinutes,
      seconds: avgRemainingSeconds,
    };
    console.log("Average Time Readable:", averageTimeReadable);

    // Select only the **top 7 pages** based on the most time spent
    const topPages = Object.entries(totalPageTime)
      .sort((a, b) => b[1] - a[1]) // Sort pages by time spent (descending)
      .slice(0, 7) // Take only the top 7 pages
      .map(([page]) => parseInt(page)); // Extract page numbers
    console.log("Top 7 Pages by Time Spent:", topPages);

    // Track most selected text dynamically but only for the top 7 pages
    const textCountMap = new Map();
    analyticsData.forEach((doc, index) => {
      console.log(`Processing selected texts for user ${index + 1}`);
      doc.selectedTexts.forEach((selectedTextObj) => {
        console.log(`Selected Text Object:`, selectedTextObj); // Log the entire selected text object

        const { selectedText, count, page } = selectedTextObj;
        console.log(`User ${index + 1} selected text "${selectedText}" on page ${page} with count ${count}`);

        // If the page is in the top pages, we process it
        if (!topPages.includes(page)) {
          console.log(`Skipping page ${page} as it's not in the top pages.`);
          return; // Skip pages not in top 7
        }

        const key = `${selectedText}|||${page}`; // Unique key (text + page)
        if (!textCountMap.has(key)) {
          textCountMap.set(key, { selectedText, count, page });
        } else {
          textCountMap.get(key).count += count;
        }
      });
    });

    console.log("Text Count Map After Processing Selected Texts:", textCountMap);

    // Convert to sorted array based on most selected text and filter for counts > 3
    const mostSelectedTexts = Array.from(textCountMap.values())
      .filter(item => item.count > 3) // Only include texts with count > 3
      .sort((a, b) => b.count - a.count || a.page - b.page); // Sort by count, then page

    console.log("Most Selected Texts (Filtered and Sorted):", mostSelectedTexts);

    // Respond with the calculated analytics data
    res.json({
      totalPageTime,
      mostSelectedTexts, // Only most selected texts with count > 3
      totalPages,
      topPages, // Send back the top 7 pages calculated
      totalTimeReadable, // Return total time spent in readable format
      averageTimeReadable, // Return average time spent per user in readable format
    });
  } catch (error) {
    console.error("Error fetching analytics data:", error);
    res.status(500).json({ message: "Internal Server Error", error: error.message });
  }
};

;




const getVideoViewAnalytics = async (req, res) => {
  const { url , uuid} = req.body;
  if (!url) return res.status(400).json({ message: "URL is required." });
  console.log(req.body)

  const videoId = url.split("/").pop(); // Extract videoId from URL
  console.log(videoId)

  try {
    // Step 1: Fetch all video analytics documents for a given video ID
    if (!videoId) return res.status(400).json({ message: "Video ID is required." });

    let videoData = await VideoAnalytics.find({ videoId });

    // If no data is found, set the videoData to an empty array with sample data structure
    if (!videoData || videoData.length === 0) {
      videoData = [{
        skipEvents: [],
        jumpEvents: [],
        userVisit: { toString: () => "sampleUser" }
      }];
    }

    // Step 2: Initialize a mapping to store the views for each duration range
    let durationViewsMap = {};

    // Step 3: Loop through all video data documents
    videoData.forEach((data) => {
      // Process skip events (Forward and Backward)
      data.skipEvents.forEach((event) => {
        const from = Math.round(event.from);
        const to = Math.round(event.to);

        const start = Math.min(from, to);
        const end = Math.max(from, to);
        
        // Ignore single point ranges (e.g., "7 to 7")
        if (start === end) return;

        const durationRange = `${start} to ${end}`;
        
        // Add views to the duration range
        if (!durationViewsMap[durationRange]) {
          durationViewsMap[durationRange] = { views: 0, users: new Set() };
        }
        durationViewsMap[durationRange].views += 1;
        durationViewsMap[durationRange].users.add(data.userVisit.toString()); // Add user to the set
      });

      // Process jump events (e.g., replay)
      data.jumpEvents.forEach((event) => {
        const from = Math.round(event.from);
        const to = Math.round(event.to);

        const start = Math.min(from, to);
        const end = Math.max(from, to);
        
        // Ignore single point ranges (e.g., "7 to 7")
        if (start === end) return;

        const jumpRange = `${start} to ${end}`;

        // Add views to the jump range
        if (!durationViewsMap[jumpRange]) {
          durationViewsMap[jumpRange] = { views: 0, users: new Set() };
        }
        durationViewsMap[jumpRange].views += 1;
        durationViewsMap[jumpRange].users.add(data.userVisit.toString());
      });
    });

    // Step 4: Prepare the final list of durations with their aggregated views
    const finalDurationList = Object.keys(durationViewsMap).map((durationRange) => {
      const segment = durationViewsMap[durationRange];
      return {
        durationRange: durationRange,
        views: segment.views,
        usersCount: segment.users.size,  // Number of unique users for the range
      };
    });

    // Step 5: Merge similar ranges dynamically (ranges that are almost the same)
    let mergedDurationList = [];

    finalDurationList.forEach((item) => {
      let found = false;

      // Try to merge with an existing range in mergedDurationList
      mergedDurationList = mergedDurationList.map((existingItem) => {
        const [existingStart, existingEnd] = existingItem.durationRange.split(' to ').map(Number);
        const [newStart, newEnd] = item.durationRange.split(' to ').map(Number);

        // Check if the ranges are adjacent or overlap
        if (
          (existingStart <= newStart && existingEnd >= newStart) ||  // Overlapping or adjacent
          (existingStart <= newEnd && existingEnd >= newEnd)
        ) {
          // Merge the views and users
          existingItem.views += item.views;
          existingItem.usersCount += item.usersCount; // Add users count
          found = true;
        }
        return existingItem;
      });

      // If not merged, add as a new range
      if (!found) {
        mergedDurationList.push({ ...item });
      }
    });

    // Step 6: Sort by views (least to most), and then by usersCount (most to least)
    mergedDurationList.sort((a, b) => {
      // First compare by views (ascending)
      if (a.views === b.views) {
        // If views are equal, then compare by usersCount (descending)
        return b.usersCount - a.usersCount;
      }
      return a.views - b.views;  // Sort by views (ascending)
    });

    // Step 7: Filter out any ranges with low views if needed
    const filteredDurationList = mergedDurationList.filter((item) => item.views >= 1); // Keep those with views greater than or equal to 1

    // Step 8: Fetch the original URL corresponding to the video ID
    const shortenedUrl = await ShortenedUrl.findOne({ shortId: videoId });

    if (!shortenedUrl) {
      return res.status(404).json({ message: "No original URL found for this video ID" });
    }

    // Step 9: Return the final merged and sorted list with Videosourceurl
    return res.json({
      Videosourceurl: shortenedUrl.originalUrl, // The original URL corresponding to the shortened URL
      videoAnalytics: filteredDurationList,     // The filtered and sorted video analytics
    });
  } catch (error) {
    console.error("Error in getVideoViewAnalytics:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};


const Web_analytics = async (req, res) => {
  try {
    const { url, category } = req.body;
    console.log(req.body, "Request Body");

    // Normalize category to lowercase
    const normalizedCategory = "weblink";
    console.log(normalizedCategory, "Normalized Category");

    // Extract the webId from the URL (assuming the ID is the last segment)
    const webId = url.split('/').pop();
    console.log(webId, "webId");

    // Fetch all analytics data for the given webId
    const webAnalyticsData = await Webanalytics.find({ webId: webId });
    console.log(webAnalyticsData, "webAnalyticsData");

    if (!webAnalyticsData || webAnalyticsData.length === 0) {
      return res.status(404).json({ message: 'Web document not found' });
    }

    let totalTimeSpent = 0;
    let totalPagesVisited = 0;
    let mostVisitedPage = '';
    let bounceSessions = 0;

    // Process web analytics data to calculate metrics
    webAnalyticsData.forEach((doc) => {
      totalTimeSpent += doc.totalTimeSpent;
      totalPagesVisited += doc.totalPagesVisited;

      if (!mostVisitedPage && doc.mostVisitedPage) {
        mostVisitedPage = doc.mostVisitedPage;
      }

      // Count bounce sessions (sessions with time spent less than 10 seconds)
      if (doc.totalTimeSpent < 10) {
        bounceSessions += 1;
      }
    });

    // Total sessions count
    const totalSessions = webAnalyticsData.length;
    // Calculate average time spent per page
    let averageTimeSpent = totalPagesVisited > 0 ? totalTimeSpent / totalPagesVisited : 0;
    console.log(averageTimeSpent, "Average Time Spent");

    // ------------------------------
    // NEW USER COUNT using documentId similar to pdf analytics
    const newUsers = await newUser.find({
      documentId: webId,
      [`count.${normalizedCategory}`]: { $gt: 0 },
    });

    const newUserCategoryCount = newUsers.reduce(
      (sum, user) => sum + (user.count[normalizedCategory] || 0),
      0
    );
    console.log("New user count for", normalizedCategory, ":", newUserCategoryCount);

    // ------------------------------
    // RETURNED USER COUNT using documentId similar to pdf analytics
    const returnedUsers = await ReturnedUser.find({
      documentId: webId,
      [`count.${normalizedCategory}`]: { $gt: 0 },
    });

    const returnedUserCategoryCount = returnedUsers.reduce(
      (sum, user) => sum + (user.count[normalizedCategory] || 0),
      0
    );
    console.log("Returned user count for", normalizedCategory, ":", returnedUserCategoryCount);

    // ------------------------------
    // Calculate the Bounce Rate
    const bounceRate = totalSessions > 0 ? (bounceSessions / totalSessions) * 100 : 0;
    console.log("Bounce Rate:", bounceRate);

    // Prepare the response data
    const responseData = {
      totalPagesVisited,
      totalTimeSpent,
      averageTimeSpent,
      userCounts: {
        newuser: { [normalizedCategory]: newUserCategoryCount },
        returneduser: { [normalizedCategory]: (returnedUserCategoryCount - newUserCategoryCount) },
      },
      mostVisitedPage,
      totalsession: totalSessions,
      bounceRate,
    };

    console.log(responseData, "Response Data");
    res.json(responseData);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: 'An error occurred while processing the Web analytics data',
      error: error.message,
    });
  }
};







const getHeatmapAnalytics = async (req, res) => {
  try {
    const { url } = req.body; // Extract URL from request body

    if (!url) {
      return res.status(400).json({ message: "URL is required" });
    }

    // Extract webId from URL (Assuming the webId is the last part of the URL)
    const webId = url.split('/').pop();
    console.log(webId, "webId");

    // Step 1: Fetch all user visits related to the given webId from Webanalytics model
    const webAnalyticsData = await Webanalytics.find({ webId });
    console.log(webAnalyticsData, "user visits");

    if (!webAnalyticsData.length) {
      return res.status(404).json({ message: "No data found for this webId" });
    }

    // Step 2: Process all pointers for the heatmap
    let allPointers = [];
    webAnalyticsData.forEach((visit) => {
      const { pointerHeatmap } = visit; // Get the pointer data from each visit

      pointerHeatmap.forEach((pointer) => {
        const existingPointer = allPointers.find(
          (p) => p.position === pointer.position
        );

        if (existingPointer) {
          // If the position already exists, add the timeSpent to the existing pointer
          existingPointer.timeSpent += pointer.timeSpent;
        } else {
          // Otherwise, add a new pointer to the array
          allPointers.push({ position: pointer.position, timeSpent: pointer.timeSpent });
        }
      });
    });

    // Step 3: Retrieve the original URL from the ShortenedUrl model using the webId
    const shortenedUrl = await ShortenedUrl.findOne({ shortId: webId });

    if (!shortenedUrl) {
      return res.status(404).json({ message: "No original URL found for this webId" });
    }

    // Step 4: Return the aggregated heatmap pointers and the original URL
    return res.status(200).json({
      sourceurl: shortenedUrl.originalUrl, // The original URL corresponding to the shortened URL
      heapmappointers: allPointers, // The aggregated heatmap pointers
    });

  } catch (error) {
    console.error("Error fetching heatmap analytics:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};






module.exports = {
  login,
  register,
  uploadFile,
  uploadurl,
  dashboardData,
  DeleteSession,
  Pdf_pdfanalytics,
  Docx_docxanalytics,
  getUserActivitiesByPdfId,
  getUserActivitiesByDocxId,
  getPdfTraffic,
  getTimeSpentByWeek,
  getDeviceAnalytics,
  getVideoAnalytics,
  getUserActivitiesByVideoId,
  getVideoTraffic,
  getTimeSpentByWeekVideo,
  getDeviceAnalyticsVideo,
  getPdfviewanalytics,
  getDocxiewanalytics,
  getVideoViewAnalytics,
  getdocxTraffic,
  getTimeSpentByWeekDocx,
  getDeviceAnalyticsdocx,
  Web_analytics,
  getUserActivitiesByWebId,
  getWebTraffic,
  getTimeSpentByWeekWeb,
  getDeviceAnalyticsWeb,
  getHeatmapAnalytics
};


