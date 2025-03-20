require("dotenv").config();
require("express-async-errors");

const express = require("express");
const cors = require("cors");
const connectDB = require("./db/connect");
const mainRouter = require("./routes/user");

const app = express();

// ✅ Correct CORS configuration
const corsOptions = {
    origin: ['https://filescencedashboard.vercel.app', 'http://localhost:3000', 'http://localhost:3001', 'https://dashboard.sendnow.live'],
    credentials: true,
    methods: 'GET,HEAD,OPTIONS,POST,PUT,DELETE',
    allowedHeaders: 'Origin, X-Requested-With, Content-Type, Accept, Authorization, csrf-token'
};

// Enable CORS
app.use(cors(corsOptions));

// ✅ Handle Preflight Requests (for CORS)
app.options('*', cors(corsOptions));

// Middleware for parsing JSON requests
app.use(express.json());

// Root endpoint
app.get("/", (req, res) => {
    res.send("Welcome to the API root endpoint of the admin dashboard.");
});

// API routes
app.use("/api/v1", mainRouter);

const port = process.env.PORT || 3000;

const start = async () => {
    try {
        await connectDB(process.env.MONGO_URI);
        app.listen(port, () => {
            console.log(`🚀 Server is running on port ${port}`);
        });
    } catch (error) {
        console.error("❌ Error starting server:", error);
    }
};

start();
