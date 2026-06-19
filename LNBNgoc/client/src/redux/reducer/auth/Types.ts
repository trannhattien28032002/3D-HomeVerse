import { PayloadAction } from "@reduxjs/toolkit";

export type AuthState = {
    isLoading: boolean;
    isLoadingBlock: boolean;
    isLoggedIn: boolean;
    isLoggedOut: boolean;
    token: string;
    refreshToken: string;
    msg: string;
};

export type ActionReqGetDataLogin = PayloadAction<{}>;
export type ActionResGetDataLogin = PayloadAction<{
    token: AuthState["token"];
    refreshToken: AuthState["refreshToken"];
}>;

export type ActionResGetDataTokenRefresh = PayloadAction<{
    token: AuthState["token"];
}>;
export type ActionResLogOut = PayloadAction<{
    msg: AuthState["msg"];
}>;
