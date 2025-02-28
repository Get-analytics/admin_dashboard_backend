const express = require("express");
const router = express.Router();
const { upload } = require("../controllers/cloudinary");
const { login, register , uploadurl, uploadFile,dashboardData , Pdf_pdfanalytics, Docx_docxanalytics, DeleteSession , getUserActivitiesByPdfId , getPdfTraffic , getTimeSpentByWeek, getDeviceAnalytics, getUserActivitiesByDocxId, getVideoAnalytics , getUserActivitiesByVideoId , getVideoTraffic , getTimeSpentByWeekVideo, getDeviceAnalyticsVideo , getPdfviewanalytics,getDocxiewanalytics, getVideoViewAnalytics, getdocxTraffic , getTimeSpentByWeekDocx, getDeviceAnalyticsdocx , Web_analytics, getUserActivitiesByWebId, getWebTraffic, getTimeSpentByWeekWeb, getDeviceAnalyticsWeb, getHeatmapAnalytics} = require("../controllers/user");
const authMiddleware = require('../middleware/auth')

router.route("/login").post(login);
router.route("/register").post(register);
// router.route("/dashboard").get(authMiddleware, dashboard);
// router.route("/users").get(getAllUsers);
// File upload route
router.post("/fileupload", upload.single("file"), uploadFile);

router.post("/linkupload", uploadurl);

router.post("/client/dashboard", dashboardData);


//pdf

router.post("/pdf/analytics", Pdf_pdfanalytics);

router.post("/pdf/session", getUserActivitiesByPdfId);

router.post("/pdf/traffic", getPdfTraffic);

router.post("/pdf/timespend", getTimeSpentByWeek);

router.post("/pdf/device", getDeviceAnalytics);

//docx

router.post("/docx/analytics", Docx_docxanalytics);

router.post("/docx/session", getUserActivitiesByDocxId);

router.post("/docx/traffic", getdocxTraffic);

router.post("/docx/timespend", getTimeSpentByWeekDocx);

router.post("/docx/device", getDeviceAnalyticsdocx);

router.delete("/removesession", DeleteSession);

//video

router.post("/video/analytics", getVideoAnalytics);

router.post("/video/session", getUserActivitiesByVideoId);

router.post("/video/traffic", getVideoTraffic);

router.post("/video/timespend", getTimeSpentByWeekVideo);

router.post("/video/device", getDeviceAnalyticsVideo);


//web


router.post("/web/analytics", Web_analytics);

router.post("/web/session", getUserActivitiesByWebId);

router.post("/web/traffic", getWebTraffic);

router.post("/web/timespend", getTimeSpentByWeekWeb);

router.post("/web/device", getDeviceAnalyticsWeb);



//pdfadmin view

router.post("/pdf/viewanalytics", getPdfviewanalytics);

//webheatmap view

router.post("/web/heatmap", getHeatmapAnalytics);

//docxadmin most page view 
router.post("/docx/viewanalytics", getDocxiewanalytics);


//video
router.post("/video/viewanalytics", getVideoViewAnalytics);


module.exports = router;