const authModel = require("../models/ModelAuth");
const sessionsModel = require("../models/ModelSessions");

const ServiceAuth = {
    signIn: async (account, username, password) => {
        return await authModel.checkSignIn(account, username, password);
    },
    getUser: async (username) => {
        return await authModel.getUser( username);
    },

    createOrUpdateSessions: async (accountId, userId, token) => {
        return await sessionsModel.createOrUpdateSessions(
            accountId,
            userId,
            token,
        );
    },
    createOrUpdateChallengers: async (accountId, userId) => {
        return await authModel.createOrUpdateChallengers(accountId, userId);
    },
    selectChallengers: async (accountId) => {
        return await authModel.selectChallengers(accountId);
    },
    
    deleteChallengers: async (accountId) => {
        return await authModel.deleteChallengers(accountId);
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
    updateUserPassword: async (account, username, password) => {
        return await authModel.updateUserPassword(account, username, password);
    },
};
module.exports = ServiceAuth;
