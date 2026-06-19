const httpHandler = require("../helper/HttpHandler");
const ServiceUsers = require("../services/ServiceUsers");
// const ServiceSessions = require("../services/ServiceSessions");
const { constants } = require("../config/index");
// const cookie = require("cookie-parse");
const jwt = require("jsonwebtoken");
const privateKey = constants.PRIVATE_KEY;
const tokenUtil = require("../utils/tokenUtils");
module.exports = {
    /**
     * Check session middleware
     * @param {request} req
     * @param {response} res
     * @param {next} next
     * @return {void}
     */

    checkAuth: async (req, res, next) => {
        const date = new Date();
        const token =
            req.body.token || req.query.token || req.headers["x-access-token"];
        const refreshToken =
            req.body.refreshToken ||
            req.query.refreshToken ||
            req.headers["x-access-refreshToken"];
        if (!token) {
            return httpHandler.unauthorized(res, {
                errMsg: "トークンは利用できません ",
                time_fail: date,
            });
        } else {
            const decode = await tokenUtil.decodeToken(token, privateKey);
            if (!decode) {
                return httpHandler.unauthorized(res, {
                    errMsg: "トークンの有効期限が切れました",
                    time_fail: date,
                });
            } else {
                const user = await ServiceUsers.getUser(decode.id);
                const sessions = await ServiceUsers.selectSessions(decode.id);
                if(!sessions){
                    return httpHandler.unauthorized(res, {
                        errMsg: "トークンが存在しません ",
                        time_fail: date,
                    });
                }else{
                    if (refreshToken === sessions[0].token) {
                        const data = {
                            id: user.accounts[0].id,
                            username: user.users_accounts[0].account,
                            name: user.accounts[0].name,
                            verified_at: date,
                        };
                        if (Date.parse(sessions[0].verified_at) < Date.now()) {

                            return httpHandler.unauthorized(res, {
                                errMsg: "アカウントは長い間眠っていました",
                                time_fail: date,
                            });

                        } else {
                            if (decode.exp * 1000 < Date.now()) {
                                const accessTokenNew = jwt.sign(data, privateKey, {
                                    algorithm: "HS256",
                                    expiresIn: 60 * 60 * 1,
                                });
    
                                if (!accessTokenNew) {
                                    return httpHandler.unauthorized(res, {
                                        errMsg: "トークンの失敗 ",
                                        time_fail: date,
                                    });
                                } else {
                                    await ServiceUsers.createOrUpdateSessions(
                                        data.id,
                                        data.name,
                                        refreshToken,
                                    );
                                    res.cookie("token", accessTokenNew, {
                                        maxAge: 900000,
                                        httpOnly: true,
                                    });
                                    req.user = {
                                        accessTokenNew: accessTokenNew,
                                        user: data,
                                    };
                                    return next();
                                }
                            } else {
                                req.user = { accessTokenNew: "", user: data };
                                return next();
                            }
                        }
                    } else {
                        return httpHandler.unauthorized(res, {
                            errMsg: "トークンが存在しません ",
                            time_fail: date,
                        });
                    }
                }
            }
        }
    },

    // checkSession: async (req, res, next) => {
    //     const date = new Date();
    //     const accessToken =
    //         req.body.accessToken ||
    //         req.query.accessToken ||
    //         req.headers["x-access-token"];
    //     if (!accessToken) {
    //         return httpHandler.unauthorized(res, {
    //             errMsg: "トークンは利用できません",
    //             time_fail: date,
    //         });
    //     } else {
    //         const decode = await tokenUtil.decodeToken(accessToken, privateKey);
    //         if (!decode) {
    //             return httpHandler.unauthorized(res, {
    //                 errMsg: "トークンの有効期限が切れました",
    //                 time_fail: date,
    //             });
    //         } else {
    //             const user = await ServiceUsers.getUser(decode.account_id);
    //             const data = {
    //                 id: user.accounts[0].id,
    //                 username: user.users_accounts[0].account,
    //                 name: user.accounts[0].name,
    //                 verified_at: date,
    //             };
    //             if (decode.exp * 1000 < Date.now()) {
    //                 const accessTokenNew = jwt.sign(data, privateKey, {
    //                     algorithm: "HS256",
    //                     expiresIn: 60 * 60 * 1,
    //                 });
    //                 if (accessTokenNew !== null) {
    //                     res.cookie("token", accessTokenNew, {
    //                         maxAge: 900000,
    //                         httpOnly: true,
    //                     });
    //                     await ServiceSessions.createOrUpdateSessions(
    //                         data.id,
    //                         data.name,
    //                         accessTokenNew,
    //                     );
    //                     req.user = { refreshToken: accessTokenNew, data };
    //                     return next();
    //                 } else {
    //                     return httpHandler.unauthorized(res, {
    //                         errMsg: "トークンの失敗",
    //                         time_fail: date,
    //                     });
    //                 }
    //             } else {
    //                 req.user = data;
    //                 return next();
    //             }
    //         }
    //     }
    // },
};
