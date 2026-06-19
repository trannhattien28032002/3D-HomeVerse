const express = require("express");
const router = new express.Router();
const ControllerEngines = require("../controllers/ControllerEngines");
const { apiConstants } = require("../config/index");

// create Actual
router.post(
    apiConstants.API_CREATE_ENGINES_ACTUAL,
    ControllerEngines.createActual,
);
// create g dam
router.post(
    apiConstants.API_CREATE_ENGINES_G_DAM,
    ControllerEngines.createGDam,
);
// create m dam
router.post(
    apiConstants.API_CREATE_ENGINES_M_DAM,
    ControllerEngines.createMDam,
);

router.post(apiConstants.API_ENGINES_DAM, ControllerEngines.getDam);

router.post(apiConstants.API_ENGINES_CHART, ControllerEngines.getChar);
module.exports = router;
