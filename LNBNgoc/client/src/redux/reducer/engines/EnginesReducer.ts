import { createSlice } from "@reduxjs/toolkit";
import * as Types from "src/redux/reducer/engines/Types";

const initialState: Types.EnginesState = {
    isLoading: false,
    isLoadingBlock: false,
    damMenu: [
        {
            id: 0,
            ent: 0,
            name: "",
        },
    ],
    timeSelectChart: "",
    dataMainMsm: [
        {
            dataChart: [
                {
                    datetime: "",
                    value_actual: 0,
                    value_rain: 0,
                    value_temp: 0,
                },
            ],
            chartSetting: [
                {
                    left_max_y: 0,
                    left_min_y: 0,
                    right_max_y: 0,
                    right_min_y: 0,
                },
            ],
        },
    ],
    dataMainGsm: [
        {
            dataChart: [
                {
                    datetime: "",
                    value_actual: 0,
                    value_rain: 0,
                    value_temp: 0,
                },
            ],
            chartSetting: [
                {
                    left_max_y: 0,
                    left_min_y: 0,
                    right_max_y: 0,
                    right_min_y: 0,
                },
            ],
        },
    ],
};

const enginesSlice = createSlice({
    name: "engines",
    initialState,
    reducers: {
        reqGetDataEngines: (state, action: Types.ActionReqGetDataEngines) => {
            state.isLoading = true;
            state.isLoadingBlock = false;
        },

        reqGetDataEnginesDam: (state, action: Types.ActionReqGetDataEngines) => {
            state.isLoading = true;
            state.isLoadingBlock = false;
        },
        resGetDataEngines: (state, action: Types.ActionResGetDataEngines) => {
            const { damMenu } = action.payload;
            state.isLoading = false;
            state.damMenu = damMenu;
        },

        resGetDataEnginesDam: (state, action: Types.ActionResGetDataEnginesDam) => {
            const { timeSelectChart } = action.payload;
            const { dataMainMsm } = action.payload;
            const { dataMainGsm } = action.payload;
            state.isLoading = false;
            state.timeSelectChart = timeSelectChart;
            state.dataMainMsm = dataMainMsm;
            state.dataMainGsm = dataMainGsm;
        },
    },
});

export const enginesAction = enginesSlice.actions;
export default enginesSlice.reducer;
