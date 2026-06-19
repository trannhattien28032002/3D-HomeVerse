const { errors } = require("web3");
const httpHandler = require("../helper/HttpHandler");
const ServiceSessions = require("../services/ServiceSessions");
// const moment = require("moment");

const controllerSession = {
    updateSession: async (req, res) => {
        try {
            const result = { data: [], msg: String };
            const token = req.body.token;
            result.data = await ServiceSessions.selectToken(token);
            if (result.data.sessions.length === 0) {
                result.msg = "更新セッションエラー";
                return httpHandler.unauthorized(
                    res,
                    result.msg,
                    errors.message,
                );
            } else {
                result.data = await ServiceSessions.updateSession(token);
                result.msg = "セッションが正常に更新されました。";
                return httpHandler.success(res, result.msg);
            }
        } catch (error) {
            return httpHandler.serverError(res, error.message);
        }
    },
};
module.exports = controllerSession;
