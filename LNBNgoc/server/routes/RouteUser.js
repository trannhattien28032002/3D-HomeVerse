const express = require("express");
const router = new express.Router();
const { apiConstants } = require("../config/index");
const controllerUsers = require("../controllers/ControllerUsers");

router.post(apiConstants.API_USER_PROFILE, controllerUsers.getProfile);
router.post(apiConstants.API_UPDATE_PASSWORD, controllerUsers.updatePassword);
module.exports = router;
