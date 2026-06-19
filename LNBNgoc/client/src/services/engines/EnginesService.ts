import { ROOT_URL, CONTENT_TYPE, ENGINES } from "src/config/ApiConstants";
import * as Types from "./Types";

/**
 * Fetch get data sample
 * @return {object}
 */

export const fetchGetDateDam = async (dbName: string, token: string, refreshToken: string): Promise<Types.ResFetchGetDataEngines> => {
    const url = ROOT_URL + ENGINES.API_ENGINES_DAM.URL;
    const response = await fetch(url, {
        method: ENGINES.API_ENGINES_DAM.METHOD,
        body: JSON.stringify({ dbName, token, refreshToken }),
        headers: {
            "Content-Type": CONTENT_TYPE,
        },
    });
    return await response.json();
};

export const fetchGetDateDamChart = async (dbName: string, type: number, damId: number, time: string, token: string, refreshToken: string): Promise<Types.ResFetchGetDataEnginesDam> => {
    const url = ROOT_URL + ENGINES.API_ENGINES_CHART.URL;
    const response = await fetch(url, {
        method: ENGINES.API_ENGINES_CHART.METHOD,
        body: JSON.stringify({ dbName, type, damId, time, token, refreshToken }),
        headers: {
            "Content-Type": CONTENT_TYPE,
        },
    });
    return await response.json();
};
