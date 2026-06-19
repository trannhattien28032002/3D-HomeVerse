import { ROOT_URL, USER, CONTENT_TYPE } from "src/config/ApiConstants";
import { ResFetchGetDataUser, ResFetchGetDataChangePassword } from "src/services/user/Types";

/**
 * Get data chart, grid
@return {object}
 */
export const fetchGetDataUser = async (token: string, refreshToken: string): Promise<ResFetchGetDataUser> => {
    const url = ROOT_URL + USER.API_USER_PROFILE.URL;
    const response = await fetch(url, {
        method: USER.API_USER_PROFILE.METHOD,
        body: JSON.stringify({ token, refreshToken }),
        headers: {
            "Content-Type": CONTENT_TYPE,
        },
    });
    return await response.json();
};

export const fetchGetChangePassword = async (account: string, username: string, password: string, passwordNew: string, passwordCheckNew: string, token: string, refreshToken: string): Promise<ResFetchGetDataChangePassword> => {
    const url = ROOT_URL + USER.API_UPDATE_PASSWORD.URL;
    const response = await fetch(url, {
        method: USER.API_UPDATE_PASSWORD.METHOD,
        body: JSON.stringify({ account, username, password, passwordNew, passwordCheckNew, token, refreshToken }),
        headers: {
            "Content-Type": CONTENT_TYPE,
        },
    });

    return await response.json();
};
