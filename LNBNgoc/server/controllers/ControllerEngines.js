const { errors } = require("web3");
const httpHandler = require("../helper/HttpHandler");
const ServiceEngines = require("../services/ServiceEngines");

const dateTime = require("../utils/DateUtils");
const date = new Date();
const ControllerEngines = {
    getDam: async (req, res) => {
        try {
            const dbName = req.body.dbName;
            const result = { damMenu: [], msg: String };
            result.damMenu = await ServiceEngines.selectDam(
                dbName.toUpperCase(),
            );
            return httpHandler.success(res, result);
        } catch (error) {
            return httpHandler.serverError(res, error.message);
        }
    },

    createActual: async (req, res) => {
        try {
            const dbName = req.body.dbName;
            const type = req.body.type;
            // const value = req.body.value;
            const damId = req.body.damId;
            const hegId = req.body.hegId;
            const time = req.body.time;
            const result = { data: [], msg: String };
            const timestamps = dateTime.createStringStamp(time.toString());
            for (let i = 0; i < 24; i++) {
                result.data = await ServiceEngines.createActual(
                    timestamps[i],
                    type,
                    Math.random() * (10 - 0) + 0,
                    damId,
                    hegId,
                    dbName.toUpperCase(),
                );
            }
            return httpHandler.success(res, result);
        } catch (error) {
            return httpHandler.serverError(res, error.message);
        }
    },

    createGDam: async (req, res) => {
        try {
            const dbName = req.body.dbName;
            const damId = req.body.damId;
            const time = req.body.time;
            const result = { data: [], msg: String };
            const timestamps = dateTime.createStringStamp(time.toString());
            for (let i = 0; i < 24; i++) {
                result.data = await ServiceEngines.createGDam(
                    timestamps[i],
                    damId,
                    Math.random() * (10 - -10) + -10,
                    Math.random() * (10 - 0) + 0,
                    dbName.toUpperCase(),
                );
            }
            return httpHandler.success(res, result);
        } catch (error) {
            return httpHandler.serverError(res, error.message);
        }
    },

    createMDam: async (req, res) => {
        try {
            const dbName = req.body.dbName;
            const damId = req.body.damId;
            const time = req.body.time;
            const result = { data: [], msg: String };
            const timestamps = dateTime.createStringStamp(time.toString());
            for (let i = 0; i < 24; i++) {
                result.data = await ServiceEngines.createMDam(
                    timestamps[i],
                    damId,
                    Math.random() * (10 - -10) + -10,
                    Math.random() * (10 - 0) + 0,
                    dbName.toUpperCase(),
                );
            }
            return httpHandler.success(res, result);
        } catch (error) {
            return httpHandler.serverError(res, error.message);
        }
    },

    getChar: async (req, res) => {
        try {
            const dbName = req.body.dbName;
            const time = req.body.time;
            const damId = req.body.damId;
            const type = req.body.type;
            if (!dbName || !time || !damId || !type) {
                return httpHandler.fail(
                    res,
                    {
                        errMsg: " 情報を完全に入力してください ",
                        time_fail: date,
                    },
                    errors.message,
                );
            } else {
                const dataChartMSM = await ServiceEngines.selectDataChart(
                    time,
                    damId,
                    type,
                    dbName.toUpperCase(),
                    "m_dam",
                );
                const dataChartGSM = await ServiceEngines.selectDataChart(
                    time,
                    damId,
                    type,
                    dbName.toUpperCase(),
                    "g_dam",
                );
                const chartSettingMSM = await ServiceEngines.selectMaxMin(
                    time,
                    damId,
                    type,
                    dbName.toUpperCase(),
                    "m_dam",
                );
                const chartSettingGSM = await ServiceEngines.selectMaxMin(
                    time,
                    damId,
                    type,
                    dbName.toUpperCase(),
                    "g_dam",
                );
                const dataChart = {
                    timeSelectChart: time,
                    dataMainMsm: [
                        {
                            dataChart: dataChartMSM,
                            chartSetting: chartSettingMSM,
                        },
                    ],
                    dataMainGsm: [
                        {
                            dataChart: dataChartGSM,
                            chartSetting: chartSettingGSM,
                        },
                    ],
                };
                return httpHandler.success(res, dataChart);
            }
        } catch (error) {
            return httpHandler.serverError(res, error.message);
        }
    },
};
module.exports = ControllerEngines;
