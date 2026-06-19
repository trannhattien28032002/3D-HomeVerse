const { errors } = require("web3");
const httpHandler = require("../helper/HttpHandler");
const ServiceAuth = require("../services/ServiceAuth");
// const cookie = require("cookie-parse");
const ServiceSessions = require("../services/ServiceSessions");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { constants } = require("../config/index");
const privateKey = constants.PRIVATE_KEY;

const controllerAuth = {
    // login
    signIn: async (req, res) => {
        try {
            const date = new Date();
            const account = req.body.account;
            const username = req.body.username;
            const password = req.body.password;
            if (!account || !username || !password) {
                return httpHandler.fail(
                    res,
                    {
                        errMsg: " 情報を完全に入力してください ",
                        time_fail: date,
                    },
                    errors.message,
                );
            } else {
                const result = {
                    sessions: [],
                    user: [],
                    token: String,
                };
                result.user = await ServiceAuth.signIn(
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
                        const verifiedAt = new Date();
                        const refreshToken = jwt.sign(
                            {
                                id: username,
                                username: account,
                                name: accounts,
                                verified_at: verifiedAt,
                            },
                            privateKey,
                            {
                                algorithm: "HS256",
                            },
                        );
                        if (!refreshToken) {
                            return httpHandler.fail(
                                res,
                                {
                                    errMsg: " 別のマシンにログインしています !!!",
                                    time_fail: date,
                                },
                                errors.message,
                            );
                        } else {
                            const accessToken = jwt.sign(
                                {
                                    id: username,
                                    username: account,
                                    name: accounts,
                                    verified_at: verifiedAt,
                                },
                                privateKey,
                                {
                                    algorithm: "HS256",
                                    expiresIn: 60 * 60 * 1,
                                },
                            );
                            if (!accessToken) {
                                return httpHandler.fail(
                                    res,
                                    {
                                        errMsg: " 別のマシンにログインしています !!! ",
                                        time_fail: date,
                                    },
                                    errors.message,
                                );
                            } else {
                                result.user =
                                    await ServiceAuth.deleteChallengers(
                                        username,
                                    );
                                result.sessions =
                                    await ServiceSessions.selectSessions(
                                        username,
                                    );

                                if (result.sessions.length !== 0) {
                                    return httpHandler.fail(
                                        res,
                                        {
                                            errMsg: " 別のマシンにログインしています !!! ",
                                            time_fail: date,
                                        },
                                        errors.message,
                                    );
                                } else {
                                    res.cookie("token", accessToken, {
                                        maxAge: 900000,
                                        httpOnly: true,
                                    });
                                    result.sessions =
                                        await ServiceSessions.createOrUpdateSessions(
                                            username,
                                            accounts,
                                            refreshToken,
                                        ); // luu session
                                    result.token = accessToken;
                                    return httpHandler.success(res, {
                                        msg: "正常にログインしました。",
                                        refreshToken: refreshToken,
                                        token: accessToken,
                                    });
                                }
                            }
                        }
                    } else {
                        // fail password
                        result.challengers =
                            await ServiceAuth.selectChallengers(username);
                        if (result.challengers.length === 0) {
                            result.challengers =
                                await ServiceAuth.createOrUpdateChallengers(
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
                            const failed = result.challengers[0].number_failed;
                            const time = result.challengers[0].time_fail;
                            const failing = failed + 1;
                            if (failed >= 9) {
                                result.challengers =
                                    await ServiceAuth.deleteChallengers(
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
                                    await ServiceAuth.createOrUpdateChallengers(
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
            }
        } catch (error) {
            return httpHandler.serverError(res, error.message);
        }
    },

    LogOut: async (req, res) => {
        try {
            const date = new Date();
            const result = { data: [], errorMsg: String };
            const accountId = req.body.accountId;
            const refreshToken = req.body.refreshToken;
            if (!accountId || !refreshToken) {
                return httpHandler.fail(
                    res,
                    {
                        errMsg: " 情報を完全に入力してください ",
                        time_fail: date,
                    },
                    errors.message,
                );
            } else {
                result.data = await ServiceSessions.selectSessions(accountId);
                if (!result.data) {
                    return httpHandler.fail(
                        res,
                        {
                            errMsg: "ログインに失敗しました",
                            time_fail: date,
                        },
                        errors.message,
                    );
                } else {
                    if (refreshToken !== result.data[0].token && !result.data) {
                        return httpHandler.unauthorized(
                            res,
                            {
                                errMsg: " トークンの失敗 ",
                                time_fail: date,
                                number_failed: 1,
                            },
                            errors.message,
                        );
                    } else {
                        result.data = await ServiceSessions.deleteSessions(
                            accountId,
                        );
                        result.msg = "正常にログアウトされました。";
                        return httpHandler.success(res, result);
                    }
                }
            }
        } catch (error) {
            return httpHandler.serverError(res, error.message);
        }
    },
};
module.exports = controllerAuth;
