const authModel = require("../models/ModelAuth");

const ServiceAuth = {
    signIn: async (account, username, password) => {
        return await authModel.checkSignIn(account, username, password);
    },

    getUser: async (username) => {
        return await authModel.getUser( username);
    },

    updateUserPassword: async (account, username, password) => {
        return await authModel.updateUserPassword(account, username, password);
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
};
module.exports = ServiceAuth;
