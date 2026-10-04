import { request } from "./request.js";


const getSupporters = async ({ page, pageSize, url } = {}) => {
  return request({
    url: "api-scf/afd-info",
    params: { page, pageSize },
  });
};

export { getSupporters };
