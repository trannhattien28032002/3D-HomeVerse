const PostgreSQL = require("../database/PostgreSQLConnect");

const modelEngines = {
    createActual: async (timeTs, type, value, damId, hegId, dbName) => {
        try {
            const queryString = `INSERT INTO actual (time_ts, type, dam_id, heg_id, value) VALUES ('${timeTs}', ${type}, ${damId}, ${hegId}, ${value})`;
            const request = await PostgreSQL.queryDbUser(queryString, dbName);
            return (request.msg = "成功");
        } catch (error) {
            return null;
        }
    },

    createGDam: async (timeTs, damId, temp, rain, dbName) => {
        try {
            const queryString = `INSERT INTO g_dam (time_ts, dam_id, value) VALUES ('${timeTs}', ${damId} ,'{${temp},${rain}}') ;`;
            const request = await PostgreSQL.queryDbUser(queryString, dbName);
            return (request.msg = "成功");
        } catch (error) {
            return null;
        }
    },

    createMDam: async (timeTs, damId, temp, rain, dbName) => {
        try {
            const queryString = `INSERT INTO m_dam (time_ts, dam_id, value) VALUES ('${timeTs}', ${damId} ,'{${temp},${rain}}') ;`;
            console.log(queryString);
            const request = await PostgreSQL.queryDbUser(queryString, dbName);
            return (request.msg = "成功");
        } catch (error) {
            return null;
        }
    },

    selectDam: async (dbName) => {
        try {
            const queryString = "SELECT * FROM dam where ent = 1 ";
            const request = await PostgreSQL.queryDbUser(queryString, dbName);
            return request;
        } catch (error) {
            return null;
        }
    },

    selectActual: async (timeTs, damId, dbName) => {
        try {
            const queryString = `SELECT  time_ts AS hours, value as valuleActual 
            from actual , m_dam  
            WHERE time_ts >= '${timeTs} JST' 
            AND time_ts < ('${timeTs} JST'::date + INTERVAL '2 day') 
            AND dam_id = ${damId}`;
            const request = await PostgreSQL.queryDbUser(queryString, dbName);
            return request;
        } catch (error) {
            return null;
        }
    },

    selectDataChart: async (timeTs, damId, type, dbName, table) => {
        try {
            const queryString = `
            SELECT TO_CHAR(actual.time_ts,'yyyy-mm-dd HH24:MI') as datetime, actual.value as value_Actual, ${table}.value[2] as value_Rain, ${table}.value[1] AS value_temp 
            FROM actual  , ${table} 
            WHERE actual.time_ts = ${table}.time_ts 
            AND actual.time_ts >= '${timeTs} 00:00:00'::date 
            AND actual.time_ts < ('${timeTs} 23:59:59'::date + INTERVAL '2 day')  
            AND actual.dam_id = ${table}.dam_id 
            AND actual.dam_id = ${damId} 
            AND actual.type = ${type} 
            ORDER BY actual.time_ts`;
            const request = await PostgreSQL.queryDbUser(queryString, dbName);
            return request;
        } catch (error) {
            return null;
        }
    },

    selectMaxMin: async (timeTs, damId, type, dbName, table) => {
        try {
            const queryString = `
            SELECT 
              CASE
                WHEN MAX(actual.value) > MAX(${table}.value[2]) THEN MAX(actual.value)+10
                ELSE MAX(${table}.value[2])+10
              END as left_max_y, 
              0 as left_min_y,
              MAX(${table}.value[1]) + 10 as right_max_y,
              MIN(${table}.value[1]) as right_min_y
            FROM actual, ${table}
            WHERE actual.time_ts = ${table}.time_ts
            AND actual.time_ts >= '${timeTs} 00:00:00'::date
            AND actual.time_ts < ('${timeTs} 23:59:59'::date + INTERVAL '2 day')
            AND actual.dam_id = ${table}.dam_id
            AND actual.dam_id = ${damId}
            AND actual.type = ${type}`;
            const request = await PostgreSQL.queryDbUser(queryString, dbName);
            return request;
        } catch (error) {
            return null;
        }
    },
};
module.exports = modelEngines;
