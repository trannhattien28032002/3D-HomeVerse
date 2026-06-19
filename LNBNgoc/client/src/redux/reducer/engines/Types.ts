import { PayloadAction } from "@reduxjs/toolkit";

export type EnginesState = {
    isLoading: boolean;
    isLoadingBlock: boolean;
    damMenu: [
        {
            id: number;
            ent: number;
            name: string;
        }
    ];
    timeSelectChart: string;
    dataMainMsm: [
        {
            dataChart: [
                {
                    datetime: string ;
                    value_actual: number ;
                    value_rain: number;
                    value_temp: number;
                }
            ];
            chartSetting: [
                {
                    left_max_y: number;
                    left_min_y: number;
                    right_max_y: number;
                    right_min_y: number;
                }
            ];
        }
    ];
    dataMainGsm: [
        {
            dataChart: [
                {
                    datetime: string;
                    value_actual: number;
                    value_rain: number;
                    value_temp: number;
                }
            ];
            chartSetting: [
                {
                    left_max_y: number;
                    left_min_y: number;
                    right_max_y: number;
                    right_min_y: number;
                }
            ];
        }
    ];
};

export type ActionReqGetDataEngines = PayloadAction<{}>;
export type ActionResGetDataEngines = PayloadAction<{
    damMenu: EnginesState["damMenu"];
}>;

export type ActionResGetDataEnginesDam = PayloadAction<{
    dataMainMsm: EnginesState["dataMainMsm"];
    dataMainGsm: EnginesState["dataMainGsm"];
    timeSelectChart: EnginesState["timeSelectChart"];
}>;
