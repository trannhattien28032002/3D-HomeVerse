import { createSlice } from "@reduxjs/toolkit";
import * as Types from "src/redux/reducer/auth/Types";

const initialState: Types.AuthState = {
    isLoading: false,
    isLoadingBlock: false,
    isLoggedIn: false,
    isLoggedOut: false,
    msg: "",
    token: "",
    refreshToken: "",
};

const authSlice = createSlice({
    name: "auth",
    initialState,
    reducers: {
        reqGetDataLogin: (state, action: Types.ActionReqGetDataLogin) => {
            state.isLoading = true;
            state.isLoadingBlock = false;
        },

        reqGetDataRefreshToken: (state, action: Types.ActionReqGetDataLogin) => {
            state.isLoading = true;
            state.isLoadingBlock = false;
        },

        resGetDataLogin: (state, action: Types.ActionResGetDataLogin) => {
            const { token } = action.payload;
            const { refreshToken } = action.payload;
            state.isLoggedOut = false;
            state.isLoading = false;
            state.isLoggedIn = true;
            state.token = token;
            state.refreshToken = refreshToken;
        },

        resDataLogOut: (state, action: Types.ActionResLogOut): void => {
            const { msg } = action.payload;
            state.isLoading = false;
            state.msg = msg;
            state.isLoggedOut = true;
            state.isLoggedIn = false;
        },

        resGetDataRefreshToken: (state, action: Types.ActionResGetDataTokenRefresh) => {
            const { token } = action.payload;
            state.isLoggedIn = true;
            state.token = token;
        },

        reqDataLogOut: (state, action: Types.ActionReqGetDataLogin): void => {
            state.isLoggedOut = false;
        },

    },
});

export const authActions = authSlice.actions;
export default authSlice.reducer;
