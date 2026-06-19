import { PayloadAction } from "@reduxjs/toolkit";

export type UserState = {
    isLoading: boolean;
    isLoadingBlock: boolean;
    isDisplay: boolean;
    accessTokenNew: string;
    user: {
        id: string;
        username: string;
        name: string;
        verified_at: string;
    };
    msg: string;
};

export type ActionReqUser = PayloadAction<{}>;
export type ActionReqGetDataChangePassword = PayloadAction<{}>;
export type ActionSetDisplaySuccess = PayloadAction<{}>;

export type ActionResUser = PayloadAction<{
    user: UserState["user"];
    accessTokenNew: UserState["accessTokenNew"];
}>;

export type ActionResGetDataChangePassword = PayloadAction<{
    msg: UserState["msg"];
}>;
