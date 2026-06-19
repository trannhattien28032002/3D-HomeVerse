// const serviceUsers = require("../services/ServiceUsers");
const httpHandler = require("../helper/HttpHandler");
const ServiceUsers = require("../services/ServiceUsers");
const { errors } = require("web3");
const bcrypt = require("bcryptjs");
const controllerUsers = {
    /**
     * Get all data guidance
     * @param {request} req
     * @param {response} res
     * @return {response}
     */
    getProfile: async (req, res) => {
        try {
            return httpHandler.success(res, req.user);
        } catch (error) {
            return httpHandler.serverError(res, error.message);
        }
    },

    updatePassword: async (req, res) => {
        try {
            const date = new Date();
            const account = req.body.account;
            const username = req.body.username;
            const password = req.body.password;
            const passwordNew = req.body.passwordNew;
            const passwordCheckNew = req.body.passwordCheckNew;
            if (
                !account ||
                !username ||
                !password ||
                !passwordNew ||
                !passwordCheckNew
            ) {
                return httpHandler.fail(
                    res,
                    {
                        errMsg: " 情報を完全に入力してください ",
                        time_fail: date,
                    },
                    errors.message,
                );
            } else {
                if (passwordNew !== password) {
                    if (passwordNew === passwordCheckNew) {
                        const result = {
                            sessions: [],
                            user: [],
                            token: String,
                        };
                        result.user = await ServiceUsers.signIn(
                            account,
                            username,
                            password,
                        ); // lay du lieu tu db
                        if (
                            result.user.accounts.length === 0 ||
                            result.user.users_accounts.length === 0
                        ) {
                            return httpHandler.fail(
                                res,
                                {
                                    errMsg: " 間違ったアカウントまたはユーザー !!! ",
                                    time_fail: date,
                                },
                                errors.message,
                            );
                        } else {
                            const user = result.user.users_accounts;
                            const accounts = result.user.accounts[0].name;
                            const isPasswordValid = await bcrypt.compare(
                                password,
                                user[0].password,
                            );
                            if (isPasswordValid) {
                                // true password
                                const hashPassword = bcrypt.hashSync(
                                    passwordNew,
                                    10,
                                );
                                result.user =
                                    await ServiceUsers.updateUserPassword(
                                        account,
                                        username,
                                        hashPassword,
                                    );
                                if (result.user !== null) {
                                    return httpHandler.success(res, {
                                        msg: "パスワードが正常に変更されました",
                                    });
                                } else {
                                    return httpHandler.fail(
                                        res,
                                        {
                                            errMsg: " 間違ったパスワードを入力しました ",
                                            time_fail: date,
                                        },
                                        errors.message,
                                    );
                                }
                            } else {
                                // fail password
                                result.challengers =
                                    await ServiceUsers.selectChallengers(
                                        username,
                                    );
                                if (result.challengers.length === 0) {
                                    result.challengers =
                                        await ServiceUsers.createOrUpdateChallengers(
                                            username,
                                            accounts,
                                        );
                                    return httpHandler.unauthorized(
                                        res,
                                        {
                                            errMsg: " 間違ったパスワードを入力しました ",
                                            time_fail: date,
                                            number_failed: 1,
                                        },
                                        errors.message,
                                    );
                                } else {
                                    const failed =
                                        result.challengers[0].number_failed;
                                    const time =
                                        result.challengers[0].time_fail;
                                    const failing = failed + 1;
                                    if (failed >= 9) {
                                        result.challengers =
                                            await ServiceUsers.deleteChallengers(
                                                username,
                                            );
                                        if (!result.challengers) {
                                            return httpHandler.fail(
                                                res,
                                                {
                                                    errMsg: " 間違ったアカウントまたはユーザー !!! ",
                                                    time_fail: date,
                                                },
                                                errors.message,
                                            );
                                        } else {
                                            return httpHandler.unauthorized(
                                                res,
                                                {
                                                    errMsg:
                                                        " 間違ったパスワードを入力しました: " +
                                                        failing,
                                                    time_fail: time,
                                                    number_failed: failing,
                                                },
                                                errors.message,
                                            );
                                        }
                                    } else {
                                        result.challengers =
                                            await ServiceUsers.createOrUpdateChallengers(
                                                username,
                                                accounts,
                                            );
                                        if (!result.challengers) {
                                            return httpHandler.fail(
                                                res,
                                                {
                                                    errMsg: " 間違ったアカウントまたはユーザー !!! ",
                                                    time_fail: date,
                                                },
                                                errors.message,
                                            );
                                        } else {
                                            return httpHandler.unauthorized(
                                                res,
                                                {
                                                    errMsg:
                                                        " 間違ったパスワードを入力しました: " +
                                                        failing,
                                                    time_fail: time,
                                                    number_failed: failing,
                                                },
                                                errors.message,
                                            );
                                        }
                                    }
                                }
                            }
                        }
                    } else {
                        return httpHandler.fail(
                            res,
                            {
                                errMsg: " 新しいパスワードが一致しません",
                                time_fail: date,
                            },
                            errors.message,
                        );
                    }
                } else {
                    return httpHandler.fail(
                        res,
                        {
                            errMsg: " 新しいパスワードと古いパスワードは同じです",
                            time_fail: date,
                        },
                        errors.message,
                    );
                }
            }
        } catch (error) {
            return httpHandler.serverError(res, error.message);
        }
    },
};

module.exports = controllerUsers;
