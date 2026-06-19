import { createSlice } from "@reduxjs/toolkit";
import * as Types from "src/redux/reducer/common/Types";
import { getDMY } from "src/util/DateUtil";


const initialState: Types.CommonState = {
    isLoading: false,
    isLoadingBlock: false,
    isLoadingErr: false,
    errorMsg: "",
    errMsg: "",
    time_fail: "",
    number_failed: 0,
    isTokenErr:false,
};
const commonSlice = createSlice({
    name: "common",
    initialState,
    reducers: {
        displayError: (state, action: Types.ActionDisplayError) => {
            const { errorMsg } = action.payload;
            const { errMsg } = action.payload;
            const { time_fail } = action.payload;
            const { number_failed } = action.payload;
            state.isLoadingErr = true;
            state.errorMsg = errorMsg;
            state.errMsg = errMsg;
            state.time_fail = time_fail;
            state.number_failed = number_failed;
        },

        displayErrorFail: (state, action: Types.ActionDisplayErrorFail) => {
            const { errorMsg } = action.payload;
            const { errMsg } = action.payload;
            const { time_fail } = action.payload;
            state.isLoadingErr = true;
            state.errorMsg = errorMsg;
            state.errMsg = errMsg;
            state.time_fail = time_fail;
        },

        displayErrorUnauthorized: (state, action: Types.ActionDisplayErrorUnauthorized) => {
            const { errorMsg } = action.payload;
            const { errMsg } = action.payload;
            const { time_fail } = action.payload;
            state.isLoadingErr = true;
            state.errorMsg = errorMsg;
            state.errMsg = errMsg;
            state.time_fail = time_fail;
            state.isTokenErr = true;
        },

        displayErrorFailToken: (state, action: Types.ActionDisplayErrorFail) => {
            const { errorMsg } = action.payload;
            const { errMsg } = action.payload;
            const { time_fail } = action.payload;
            state.isLoadingErr = true;
            state.errorMsg = errorMsg;
            state.errMsg = errMsg;
            state.time_fail = time_fail;
        },

        displayErrorServer: (state, action: Types.ActionDisplayErrorServer ) => {
            const { errorMsg } = action.payload;
            const time = new Date;
            state.isLoadingErr = true;
            state.errorMsg = errorMsg;
            state.errMsg = "サーバーでエラーが発生しました";
            state.time_fail =getDMY(time);
        },

        setDisplayFailToken: (state, action: Types.ActionSetDisplayError) => {
            state.isTokenErr = false;
        },

        setDisplayError: (state, action: Types.ActionSetDisplayError) => {
            state.isLoadingErr = false;
        },
    },
});

export const commonAction = commonSlice.actions;
export default commonSlice.reducer;
