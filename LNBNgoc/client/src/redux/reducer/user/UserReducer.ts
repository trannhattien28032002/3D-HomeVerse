import { createSlice } from "@reduxjs/toolkit";
import * as AuthTypes from "src/redux/reducer/user/Types";

const initialState: AuthTypes.UserState = {
    accessTokenNew: "",
    isLoading: false,
    isLoadingBlock: false,
    user: {
        id: "",
        username: "",
        name: "",
        verified_at: "",
    },
    msg: "",
    isDisplay: false,
};

export const userSlice = createSlice({
    name: "user",
    initialState,
    reducers: {
        reqDataUser: (state, action: AuthTypes.ActionReqUser): void => {
            state.isLoading = true;
            state.isLoadingBlock = false;
        },

        resDataUser: (state, action: AuthTypes.ActionResUser): void => {
            const { user } = action.payload;
            const { accessTokenNew } = action.payload;
            state.isLoading = false;
            state.user = user;
            state.accessTokenNew = accessTokenNew;
        },

        reqGetDataChangePassword: (state, action: AuthTypes.ActionReqGetDataChangePassword) => {
            state.isLoading = true;
            state.isLoadingBlock = false;
        },

        resGetDataChangePassword: (state, action: AuthTypes.ActionResGetDataChangePassword) => {
            const { msg } = action.payload;
            state.isLoading = false;
            state.isDisplay = true;
            state.msg = msg;
        },

        setDisplaySuccess: (state, action: AuthTypes.ActionSetDisplaySuccess) => {
            state.isDisplay = false;
        },
    },
});

export const userActions = userSlice.actions;
export default userSlice.reducer;
