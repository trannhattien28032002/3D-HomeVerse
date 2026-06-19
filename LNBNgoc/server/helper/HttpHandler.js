const errorHandler = require("../config/ErrorHandler");
require("dotenv").config({ path: __dirname + "/properties.dev.env" });
module.exports = {
    success: (res, data, message = "") => {
        return res.status(errorHandler.CODE_200).json({
            data: data,
            message: message || errorHandler.MSG_200,
            code: errorHandler.CODE_200,
        });
    },

    serverError: (res, data, message) => {
        return res.status(errorHandler.CODE_500).json({
            data: data,
            message: message || errorHandler.MSG_500,
            code: errorHandler.CODE_500,
        });
    },
    forbidden: (res, message) => {
        console.log(message);
        return res.status(errorHandler.CODE_403).json({
            message: message || errorHandler.MSG_403,
            code: errorHandler.CODE_403,
        });
    },

    fail: (res, data, message = "") => {
        // if exist message !== "" return message
        // some places using fail() pass the error message to data param position, so that seems like a error message param
        const logMsg = message !== "" ? message : data;
        console.log(logMsg);
        return res.status(errorHandler.CODE_400).json({
            data: data,
            message: message || errorHandler.MSG_400,
            code: errorHandler.CODE_400,
        });
    },

    unauthorized: (res, data) => {
        return res.status(errorHandler.CODE_401).json({
            data: data,
            message: errorHandler.MSG_401,
            code: errorHandler.CODE_401,
        });
    },

    notFound : (res, data) => {
        return res.status(errorHandler.CODE_403).json({
            data: data,
            message: errorHandler.MSG_403,
            code: errorHandler.CODE_403,
        });
    },
};
