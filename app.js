require("dotenv").config();
require('express-async-errors');

const connectDB = require("./db/connect");
const express = require("express");
const cors = require('cors')
const app = express();
const mainRouter = require("./routes/user");

app.use(express.json());




// Middleware
const corsOptions = {
    origin: ['https://filescencedashboard.vercel.app', 'http://localhost:3000', 'http://localhost:3001'],
    credentials: true,
};
app.use(cors(corsOptions));


app.use((req, res, next) => {
    const allowedOrigins = ['https://filescencedashboard.vercel.app', 'http://localhost:3000',  'http://localhost:3001'];
    const origin = req.headers.origin;
    if (allowedOrigins.includes(origin)) {
        res.header('Access-Control-Allow-Origin', origin);
    }
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'GET,HEAD,OPTIONS,POST,PUT,DELETE');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, csrf-token');
    next();
});
app.get('/', (req, res) => {
    res.send('Welcome to the API root endpoint admin dashboard api file scence');
});
app.use("/api/v1", mainRouter);

const port = process.env.PORT || 3000;

const start = async () => {

    try {        
        await connectDB(process.env.MONGO_URI);
        app.listen(port, () => {
            console.log(`Server is listening on port ${port}`);
        })

    } catch (error) {
       console.log(error); 
    }
}

start();

