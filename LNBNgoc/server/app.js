require("dotenv").config({ path: __dirname + "/properties.dev.env" });
const express = require("express");
const cookieParser = require("cookie-parser");
const cors = require("cors");

// create express
const app = express();

// setting cors for request
app.use(cors({}));
const corsMiddleware = require("./middleware/CorsMiddleware");
corsMiddleware.setHeaders(app);
app.use(cookieParser());

// size request default limit 1mb ==> increasing to 5mb
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true, limit: "5mb" }));

// use route
app.use(require("./routes"));

// run server
app.listen(process.env.SERVER_PORT);
