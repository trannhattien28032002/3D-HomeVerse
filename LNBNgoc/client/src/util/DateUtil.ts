import moment from 'moment';
import 'moment-timezone'; 
const getHM = (timeString: string) => {
    const time = new Date(timeString);
    const hours = String(time.getHours()).padStart(1, "0");
    const minutes = String(time.getMinutes()).padStart(2, "0");
    const formattedDate = `${hours}:${minutes}`;
    return formattedDate;
};
const getDMY = (time: Date) => {
    const day = String(time.getDate()).padStart(2, "0");
    const month = String(time.getMonth() + 1).padStart(2, "0");
    const year = time.getFullYear();
    const formattedDate = `${day}/${month}/${year}`;
    return formattedDate;
};

const getYMD = (time: Date) => {
    const day = String(time.getDate()).padStart(2, "0");
    const month = String(time.getMonth() + 1).padStart(2, "0");
    const year = time.getFullYear();
    const formattedDate = `${year}/${month}/${day}`;
    return formattedDate;
};

const getDMYHM = (time: Date) => {
    const day = String(time.getDate()).padStart(2, "0");
    const month = String(time.getMonth() + 1).padStart(2, "0");
    const year = time.getFullYear();
    const hours = String(time.getHours()).padStart(2, "0");
    const minutes = String(time.getMinutes()).padStart(2, "0");
    const formattedDate = `${day}/${month}/${year} ${hours}:${minutes}`;
    return formattedDate;
};

const getYMDString = (time: string) => {
    const dateTimeObj = new Date(time);

    dateTimeObj.setDate(dateTimeObj.getDate());
    const year = dateTimeObj.getFullYear();
    const month = dateTimeObj.getMonth()+1;
    const day = dateTimeObj.getDate();

    const newDateString = `${year}/${month.toString().padStart(2, "0")}/${day.toString().padStart(2, "0")}`;
    return newDateString;
};

const getNextDay = (dateTimeString: string) => {
    const dateTimeObj = new Date(dateTimeString);

    dateTimeObj.setDate(dateTimeObj.getDate() + 1);
    const year = dateTimeObj.getFullYear();
    const month = dateTimeObj.getMonth() + 1;
    const day = dateTimeObj.getDate();

    const newDateString = `${year}/${month.toString().padStart(2, "0")}/${day.toString().padStart(2, "0")}`;
    return newDateString;
};

const createStringStamp = (timeline:string) => {
    const starTime = moment.tz(timeline);
    // Tạo danh sách các timestamp cho từng giờ
    const timestamps = [];
    for (let i = 0; i < 24; i++) {
        timestamps.push(
            starTime.clone().add(i, "hours").format("YYYY-MM-DD HH:mm"),
        );
    }
    return timestamps;
};

export { getHM, getDMY, getYMD, getDMYHM, getNextDay,getYMDString,createStringStamp };
