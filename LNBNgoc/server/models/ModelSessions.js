const PostgreSQL = require("../database/PostgreSQLConnect");

const modelAuth = {
    createOrUpdateSessions: async (accountId, userId, token) => {
        try {
            const queryStringSessions = `
            INSERT INTO sessions (id, account_id, user_id, signed_at, verified_at, token) 
            VALUES ( NOW(), '${accountId}', '${userId}', NOW(), NOW()+ INTERVAL '2 hours', '${token}') 
            ON CONFLICT (account_id, user_id) DO UPDATE SET verified_at = NOW() + INTERVAL '2 hours', token = '${token}'`;
            const request = await PostgreSQL.queryDBAuth(queryStringSessions);
            return (request.msg = "成功");
        } catch (error) {
            return null;
        }
    },

    selectSessions: async (accountId) => {
        try {
            const queryString = `SELECT * from sessions WHERE account_id = '${accountId}'`;
            const request = await PostgreSQL.queryDBAuth(queryString);
            return request;
        } catch (error) {
            return null;
        }
    },

    deleteSessions: async (accountId, token) => {
        try {
            const queryString = `DELETE FROM sessions WHERE account_id = '${accountId}'`;
            const request = await PostgreSQL.queryDBAuth(queryString);
            return (request.msg = "削除成功");
        } catch (error) {
            return null;
        }
    },

    selectToken: async (token) => {
        try {
            const queryString = `SELECT * from sessions WHERE token= '${token}'`;
            const request = await PostgreSQL.queryDBAuth(queryString);
            return request;
        } catch (error) {
            return null;
        }
    },
};
module.exports = modelAuth;
