const sessionsModel = require("../models/ModelSessions");

const ServiceSessions = {
    createOrUpdateSessions: async (accountId, userId, token) => {
        return await sessionsModel.createOrUpdateSessions(
            accountId,
            userId,
            token,
        );
    },
    selectSessions: async (accountId) => {
        return await sessionsModel.selectSessions(accountId);
    },
    deleteSessions: async (accountId) => {
        return await sessionsModel.deleteSessions(accountId);
    },
    selectToken: async (token) => {
        return await sessionsModel.selectToken(token);
    },
};
module.exports = ServiceSessions;
