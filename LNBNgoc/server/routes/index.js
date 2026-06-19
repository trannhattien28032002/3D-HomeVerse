const express = require("express");
const router = new express.Router();
require("dotenv").config({ path: __dirname + "/properties.dev.env" });
const CheckSessionMiddleware = require("../middleware/CheckSessionMiddleware");

// router.use(CheckSessionMiddleware.checkSession);
// declare route
router.use("/auth", require("./RouteAuth"));
router.use("/session",require("./RouteSession"));
router.use("/engines",CheckSessionMiddleware.checkAuth,require("./RouteEngines"));
router.use("/user",CheckSessionMiddleware.checkAuth,require("./RouteUser"));
module.exports = router;
