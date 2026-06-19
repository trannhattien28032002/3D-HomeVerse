import type { Response } from "src/config/ApiConstants";
import { EnginesState } from "src/redux/reducer/engines/Types";
import { CommonState } from "src/redux/reducer/common/Types";

export type ResFetchGetDataEngines = Response<{
    damMenu: EnginesState["damMenu"];
    time_fail: CommonState["time_fail"];
    number_failed: CommonState["number_failed"];
    errMsg: CommonState["errMsg"];
}>;

export type ResFetchGetDataEnginesDam = Response<{
    time_fail: CommonState["time_fail"];
    number_failed: CommonState["number_failed"];
    dataMainMsm: EnginesState["dataMainMsm"];
    dataMainGsm: EnginesState["dataMainGsm"];
    timeSelectChart: EnginesState["timeSelectChart"];
    errMsg: CommonState["errMsg"];
}>;
