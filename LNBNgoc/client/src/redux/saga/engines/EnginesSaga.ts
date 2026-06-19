import { call, put, takeLatest } from "redux-saga/effects";
import HttpHandler from "src/util/HttpHandler";
import type { ActionReqGetDataEngines } from "src/redux/reducer/engines/Types";
import { commonAction } from "../../reducer/common/CommonReducer";
import { enginesAction } from "src/redux/reducer/engines/EnginesReducer";
import * as enginesService from "src/services/engines/EnginesService";
import { ResFetchGetDataEngines, ResFetchGetDataEnginesDam } from "src/services/engines/Types";

interface Payload {
    dbName: string;
    type: number;
    damId: number;
    time: string;
    damMenu: string[];
    token: string;
    refreshToken: string;
}

/**
 * Get data item tag
 * @param {object} action
 * @return {void}
 */
function* getDataEngines(action: ActionReqGetDataEngines) {
    try {
        const { dbName } = action.payload as Payload;
        const { token, refreshToken } = action.payload as Payload;
        const response: ResFetchGetDataEngines = yield call(enginesService.fetchGetDateDam, dbName, token, refreshToken);
        switch (response.code) {
            case HttpHandler.SUCCESS: {
                const { damMenu } = response.data;
                yield put(enginesAction.resGetDataEngines({ damMenu }));
                break;
            }
            case HttpHandler.FAIL:
                yield put(commonAction.displayErrorFail({ errorMsg: response.message, time_fail: response.data.time_fail, errMsg: response.data.errMsg }));
                break;
            case HttpHandler.UNAUTHORIZED:
                yield put(commonAction.displayErrorUnauthorized({ errorMsg: response.message, time_fail: response.data.time_fail, errMsg: response.data.errMsg }));
                break;
            default:
                yield put(commonAction.displayErrorServer({ errorMsg: response.message }));
                break;
        }
    } catch (error) {
        console.log(error);
    }
}

function* getDataEnginesDam(action: ActionReqGetDataEngines) {
    try {
        const { dbName, type, damId, time, token, refreshToken } = action.payload as Payload;
        const response: ResFetchGetDataEnginesDam = yield call(enginesService.fetchGetDateDamChart, dbName, type, damId, time, token, refreshToken);
        switch (response.code) {
            case HttpHandler.SUCCESS: {
                const { dataMainMsm } = response.data;
                const { timeSelectChart } = response.data;
                const { dataMainGsm } = response.data;
                yield put(enginesAction.resGetDataEnginesDam({ dataMainMsm, timeSelectChart, dataMainGsm }));
                break;
            }
            case HttpHandler.FAIL:
                yield put(commonAction.displayError({ errorMsg: response.message, time_fail: response.data.time_fail, number_failed: response.data.number_failed, errMsg: response.data.errMsg }));
                break;
            case HttpHandler.UNAUTHORIZED:
                yield put(commonAction.displayErrorUnauthorized({ errorMsg: response.message, time_fail: response.data.time_fail, errMsg: response.data.errMsg }));
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
export function* watchFetchDataEngines() {
    yield takeLatest(enginesAction.reqGetDataEngines.type, getDataEngines);
    yield takeLatest(enginesAction.reqGetDataEnginesDam.type, getDataEnginesDam);
}
