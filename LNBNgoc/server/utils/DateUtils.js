const moment = require("moment-timezone");
const { DATE_FORMAT } = require("../config/Constants");

/**
 * Create string stamp
 * @return {string}
 */
const formatTime = () => {
    return moment().format(DATE_FORMAT);
};

const createStringStamp = (timeline) => {
    const starTime = moment.tz(timeline, "Asia/Ho_Chi_Minh");
    // Tạo danh sách các timestamp cho từng giờ
    const timestamps = [];
    for (let i = 0; i < 24; i++) {
        timestamps.push(
            starTime.clone().add(i, "hours").format("YYYY-MM-DD HH:mm:ss z"),
        );
    }
    return timestamps;
};

module.exports = {
    createStringStamp,
    formatTime,
};
