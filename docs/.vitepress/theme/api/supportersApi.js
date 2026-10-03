import { request } from "./request.js";


const getSupporters = async ({ page, pageSize, url } = {}) => {
  return request({
    url: "https://1438673597-khgbed6mze.ap-shanghai.tencentscf.com",
    params: { page, pageSize },
  });
};

export { getSupporters };
