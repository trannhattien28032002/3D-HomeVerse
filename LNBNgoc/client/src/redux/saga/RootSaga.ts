import { all, fork } from "redux-saga/effects";
import * as userSaga from "src/redux/saga/user/UserSaga";
import * as authSaga from "src/redux/saga/auth/AuthSaga";
import * as enginesSaga from "src/redux/saga/engines/EnginesSaga";

/**
 * Root saga
 * @return {void}
 */
export default function* rootSaga() {
    yield all([fork(userSaga.watchFetchDataUser)]);
    yield all([fork(authSaga.watchFetchToken)]);
    yield all([fork(enginesSaga.watchFetchDataEngines)]);
}
