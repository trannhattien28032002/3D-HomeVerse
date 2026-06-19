export const ROOT_URL = process.env.REACT_APP_NODEJS_HOST + ":" + process.env.REACT_APP_NODEJS_PORT;
export const CONTENT_TYPE = "application/json; charset=UTF-8";

export type Response<Data> = {
    message: string;
    code: number;
    data: Data;
};

export const AUTH = {
    API_SIGN_IN: {
        URL: "/auth/api-sign-in",
        METHOD: "POST",
    },

    API_VERIFY_TOKEN: {
        URL: "/auth/api-verify",
        METHOD: "POST",
    },

    API_REGISTER: {
        URL: "/auth/api-register",
        METHOD: "POST",
    },

    API_LOG_OUT: {
        URL: "/auth/api-log-out",
        METHOD: "POST",
    },

};

export const ENGINES = {
    API_ENGINES_DAM: {
        URL: "/engines/api-dam",
        METHOD: "POST",
    },
    API_ENGINES_CHART: {
        URL: "/engines/api-chart",
        METHOD: "POST",
    },
};

export const USER = {

    API_USER_PROFILE: {
        URL: "/user/api-profile",
        METHOD: "POST",
    },

    API_UPDATE_PASSWORD: {
        URL: "/user/api-update-password",
        METHOD: "POST",
    }
};