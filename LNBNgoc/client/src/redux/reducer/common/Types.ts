import { PayloadAction } from "@reduxjs/toolkit";

export type CommonState = {
    isLoading: boolean;
    isLoadingBlock: boolean;
    isLoadingErr: boolean;
    errorMsg: string;
    time_fail: string;
    number_failed: number;
    errMsg: string;
    isTokenErr:boolean;
};

export type ActionSetDisplayError = PayloadAction<{}>;

export type ActionDisplayError = PayloadAction<{
    errorMsg: CommonState["errorMsg"];
    time_fail: CommonState["time_fail"];
    number_failed: CommonState["number_failed"];
    errMsg: CommonState["errMsg"];
}>;

export type ActionDisplayErrorFail = PayloadAction<{
    errorMsg: CommonState["errorMsg"];
    time_fail: CommonState["time_fail"];
    errMsg: CommonState["errMsg"];
}>;

export type ActionDisplayErrorUnauthorized= PayloadAction<{
    errorMsg: CommonState["errorMsg"];
    time_fail: CommonState["time_fail"];
    errMsg: CommonState["errMsg"];
}>;

export type ActionDisplayErrorServer = PayloadAction<{
    errorMsg: CommonState["errorMsg"];
}>;
