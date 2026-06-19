const PostgreSQL = require("../database/PostgreSQLConnect");

const modelAuth = {
    checkSignIn: async (account, username, password) => {
        try {
            const queryStringUserAccounts = `SELECT * from users_accounts WHERE username = '${username}' AND account = '${account}';`;
            const queryStringAccounts = `SELECT * from accounts WHERE id = '${username}'`;
            const request = { accounts: [], users_accounts: [] };
            request.accounts = await PostgreSQL.queryDBAuth(
                queryStringAccounts,
            );
            request.users_accounts = await PostgreSQL.queryDBSys(
                queryStringUserAccounts,
            );
            return request;
        } catch (error) {
            return null;
        }
    },

    getUser: async (username) => {
        try {
            const queryStringUserAccounts = `SELECT * from users_accounts WHERE username = '${username}'`;
            const queryStringAccounts = `SELECT * from accounts WHERE id = '${username}'`;
            const request = { accounts: [], users_accounts: [] };
            request.accounts = await PostgreSQL.queryDBAuth(
                queryStringAccounts,
            );
            request.users_accounts = await PostgreSQL.queryDBSys(
                queryStringUserAccounts,
            );
            return request;
        } catch (error) {
            return null;
        }
    },

    updateUserPassword: async (account, username, password) => {
        try {
            const queryStringUserAccounts = `
            UPDATE users_accounts SET password = '${password}' WHERE username = '${username}' AND account = '${account}' ; `;
            const request = await PostgreSQL.queryDBSys(
                queryStringUserAccounts,
            );
            return (request.msg = "更新成功");
        } catch (error) {
            return null;
        }
    },

    createOrUpdateChallengers: async (accountId, userId) => {
        try {
            const queryStringChallengers = `
            INSERT INTO challengers (account_id, user_id, failed, last_failed_at) VALUES ('${accountId}','${userId}', 1, NOW()) 
            ON CONFLICT (account_id, user_id) DO UPDATE SET failed = challengers.failed + 1, last_failed_at = NOW();`;
            const request = await PostgreSQL.queryDBAuth(
                queryStringChallengers,
            );
            return (request.msg = "成功");
        } catch (error) {
            return null;
        }
    },

    selectChallengers: async (accountId) => {
        try {
            const queryString = `SELECT failed as number_failed, TO_CHAR(last_failed_at,'yyyy-mm-dd HH24:MI') as time_fail from challengers WHERE account_id = '${accountId}'`;
            const request = await PostgreSQL.queryDBAuth(queryString);
            return request;
        } catch (error) {
            return null;
        }
    },

    deleteChallengers: async (accountId) => {
        try {
            const queryString = `DELETE FROM challengers WHERE account_id = '${accountId}'`;
            const request = await PostgreSQL.queryDBAuth(queryString);
            return (request.msg = "削除成功");
        } catch (error) {
            return null;
        }
    },
};
module.exports = modelAuth;
