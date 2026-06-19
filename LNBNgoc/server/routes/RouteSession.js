const express = require("express");
const router = new express.Router();
const ControllerSessions = require("../controllers/ControllerSessions");
const { apiConstants } = require("../config/index");

// declare api sign in
router.post(apiConstants.API_UPDATE_SESSION, ControllerSessions.updateSession);

module.exports = router;
