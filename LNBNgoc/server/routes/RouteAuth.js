const express = require("express");
const router = new express.Router();
const ControllerAuth = require("../controllers/ControllerAuth");
const { apiConstants } = require("../config/index");

// declare api sign in
router.post(apiConstants.API_SIGN_IN, ControllerAuth.signIn);

router.post(apiConstants.API_LOG_OUT, ControllerAuth.LogOut);


module.exports = router;
