const ModelEngines = require("../models/ModelEngines");

const ServiceEngines = {
    createActual: async (timeTs, type, value, damId, hegId, dbName) => {
        return await ModelEngines.createActual(
            timeTs,
            type,
            value,
            damId,
            hegId,
            dbName,
        );
    },
    createGDam: async (timeTs, damId, temp, rain, dbName) => {
        return await ModelEngines.createGDam(timeTs, damId, temp, rain, dbName);
    },
    createMDam: async (timeTs, damId, temp, rain, dbName) => {
        return await ModelEngines.createMDam(timeTs, damId, temp, rain, dbName);
    },
    selectActual: async (timeTs, damId, dbName) => {
        return await ModelEngines.selectActual(timeTs, damId, dbName);
    },
    selectDataChart: async (timeTs, damId, type, dbName, table) => {
        return await ModelEngines.selectDataChart(
            timeTs,
            damId,
            type,
            dbName,
            table,
        );
    },
    selectMaxMin: async (timeTs, damId, type, dbName, table) => {
        return await ModelEngines.selectMaxMin(
            timeTs,
            damId,
            type,
            dbName,
            table,
        );
    },
    selectDam: async (dbName) => {
        return await ModelEngines.selectDam(dbName);
    },
};
module.exports = ServiceEngines;
