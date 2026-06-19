const { Pool, Client } = require("pg");
const { constants } = require("../config/index");
const configConnect = {
    host: constants.PG_HOST,
    user: constants.PG_USER,
    port: constants.PG_PORT,
    password: constants.PG_PASSWORD,
    max: constants.PG_MAXPOOL,
    idleTimeoutMillis: constants.PG_TIMEOUT,
};
const configConnectDbSys = {
    ...configConnect,
    database: constants.PG_DB_SYS,
};
const configConnectDbAuth = {
    ...configConnect,
    database: constants.PG_DB_AUTH,
};

let clientDBUser = null;

const postgreSQLConnect = {
    connectDbSys: async () => {
        return new Pool(configConnectDbSys);
    },
    connectDbAuth: async () => {
        return new Pool(configConnectDbAuth);
    },
    connectDbUser: async (dbName) => {
        const configConnectDbUser = {
            ...configConnect,
            database: dbName,
        };
        return new Pool(configConnectDbUser);
    },
    queryDBSys: async (stringQuery) => {
        const pool = new Pool(configConnectDbSys);
        const result = await pool.query(stringQuery);
        pool.end();
        return result.rows;
    },
    queryDBAuth: async (stringQuery) => {
        const pool = new Pool(configConnectDbAuth);
        const result = await pool.query(stringQuery);
        pool.end();
        return result.rows;
    },

    queryDbUser: async (stringQuery, dbName) => {
        const configConnectDbUser = {
            ...configConnect,
            database: dbName,
        };
        const pool = new Pool(configConnectDbUser);
        const result = await pool.query(stringQuery);
        pool.end();
        return result.rows;
    },
    connectClientDbUser: async (dbName) => {
        const configConnectDbUser = {
            ...configConnect,
            database: dbName,
        };
        clientDBUser = new Client(configConnectDbUser);
        clientDBUser.connect();
        return clientDBUser;
    },
    queryClientDbUser: async (stringQuery) => {
        const result = await clientDBUser.query(stringQuery);
        return result.rows;
    },
    releaseClientDbUser: async () => {
        clientDBUser.end();
        clientDBUser = null;
    },
};
module.exports = postgreSQLConnect;
