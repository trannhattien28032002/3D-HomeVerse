import { call, put, takeLatest } from "redux-saga/effects";
import HttpHandler from "src/util/HttpHandler";
import type { ActionReqGetDataLogin } from "src/redux/reducer/auth/Types";
import { commonAction } from "../../reducer/common/CommonReducer";
import { authActions } from "src/redux/reducer/auth/AuthReducer";
import * as authService from "src/services/auth/AuthServices";
import { ResFetchGetDataLogin, ResFetchLogOut } from "src/services/auth/Types";

interface Payload {
    account: string;
    username: string;
    refreshToken: string;
    password: string;
    name: string;
    accountId: string;
}

/**
 * Get data item tag
 * @param {object} action
 * @return {void}
 */
function* getLogin(action: ActionReqGetDataLogin) {
    try {
        const { account, username, password } = action.payload as Payload;
        const response: ResFetchGetDataLogin = yield call(authService.fetchLogin, account, username, password);
        switch (response.code) {
            case HttpHandler.SUCCESS: {
                const { token, refreshToken } = response.data;
                yield put(authActions.resGetDataLogin({ token, refreshToken }));
                break;
            }
            case HttpHandler.FAIL:
                yield put(commonAction.displayErrorFail({ errorMsg: response.message, time_fail: response.data.time_fail, errMsg: response.data.errMsg }));
                break;
            case HttpHandler.UNAUTHORIZED:
                yield put(commonAction.displayError({ errorMsg: response.message, time_fail: response.data.time_fail, number_failed: response.data.number_failed, errMsg: response.data.errMsg }));
                break;
            default:
                yield put(commonAction.displayErrorServer({ errorMsg: response.message }));
                break;
        }
    } catch (error) {
        console.log(error);
    }
}
function* logOut(action: ActionReqGetDataLogin) {
    try {
        const { accountId, refreshToken } = action.payload as Payload;
        const response: ResFetchLogOut = yield call(authService.fetchLogOut, accountId, refreshToken);
        switch (response.code) {
            case HttpHandler.SUCCESS: {
                const { msg } = response.data;
                yield put(authActions.resDataLogOut({ msg }));
                break;
            }
            case HttpHandler.FAIL:
                yield put(commonAction.displayErrorFail({ errorMsg: response.message, time_fail: response.data.time_fail, errMsg: response.data.errMsg }));
                break;
            case HttpHandler.UNAUTHORIZED:
                yield put(commonAction.displayError({ errorMsg: response.message, time_fail: response.data.time_fail, number_failed: response.data.number_failed, errMsg: response.data.errMsg }));
                break;
            default:
                yield put(commonAction.displayErrorServer({ errorMsg: response.message }));
                break;
        }
    } catch (error) {
        console.log(error);
    }
}
/**
 * Watch login action
 * @return {void}
 */
export function* watchFetchToken() {
    yield takeLatest(authActions.reqGetDataLogin.type, getLogin);
    yield takeLatest(authActions.reqDataLogOut.type, logOut);
}
