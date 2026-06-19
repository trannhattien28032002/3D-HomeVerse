import { configureStore, ThunkAction, Action } from "@reduxjs/toolkit";
import createSagaMiddleware from "@redux-saga/core";
import rootSaga from "src/redux/saga/RootSaga";
import userReducer from "src/redux/reducer/user/UserReducer";
import commonReducer from "src/redux/reducer/common/CommonReducer";
import authReducer from "src/redux/reducer/auth/AuthReducer";
import enginesReducer from "src/redux/reducer/engines/EnginesReducer";
const sagaMiddleware = createSagaMiddleware();
export const store = configureStore({
    reducer: {
        authReducer,
        userReducer,
        enginesReducer,
        commonReducer,
    },
    middleware: [sagaMiddleware],
});
sagaMiddleware.run(rootSaga);

export type AppDispatch = typeof store.dispatch;
export type RootState = ReturnType<typeof store.getState>;
export type AppThunk<ReturnType = void> = ThunkAction<ReturnType, RootState, unknown, Action<string>>;
