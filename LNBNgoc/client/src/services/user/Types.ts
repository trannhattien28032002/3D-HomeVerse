import type { Response } from "src/config/ApiConstants";
import { UserState } from "src/redux/reducer/user/Types";
import { CommonState } from "src/redux/reducer/common/Types";

export type ResFetchGetDataUser = Response<{
    time_fail: CommonState["time_fail"];
    number_failed: CommonState["number_failed"];
    errMsg: CommonState["errMsg"];
    accessTokenNew: UserState["accessTokenNew"];
    user: UserState["user"];
}>;


export type ResFetchGetDataChangePassword = Response<{
    msg: UserState["msg"];
    time_fail: CommonState["time_fail"];
    number_failed: CommonState["number_failed"];
    errMsg: CommonState["errMsg"];
}>;
