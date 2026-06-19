import { ROOT_URL, CONTENT_TYPE, AUTH } from "../../config/ApiConstants";
import * as Types from "./Types";

/**
 * Fetch get data sample
 * @return {object}
 */

export const fetchLogin = async (account: string, username: string, password: string): Promise<Types.ResFetchGetDataLogin> => {
    const url = ROOT_URL + AUTH.API_SIGN_IN.URL;
    const response = await fetch(url, {
        method: AUTH.API_SIGN_IN.METHOD,
        body: JSON.stringify({ account, username, password }),
        headers: {
            "Content-Type": CONTENT_TYPE,
        },
    });

    return await response.json();
};

export const fetchLogOut = async (accountId: string, refreshToken: string): Promise<Types.ResFetchLogOut> => {
    const url = ROOT_URL + AUTH.API_LOG_OUT.URL;
    const response = await fetch(url, {
        method: AUTH.API_LOG_OUT.METHOD,
        body: JSON.stringify({ accountId, refreshToken }),
        headers: {
            "Content-Type": CONTENT_TYPE,
        },
    });
    return await response.json();
};

export const fetchGetRefreshToken = async (tokenClient: string, refreshToken: string): Promise<Types.ResFetchGetDataTokenRefresh> => {
    const url = ROOT_URL + AUTH.API_REGISTER.URL;
    const response = await fetch(url, {
        method: AUTH.API_REGISTER.METHOD,
        body: JSON.stringify({ tokenClient, refreshToken }),
        headers: {
            "Content-Type": CONTENT_TYPE,
        },
    });

    return await response.json();
};
