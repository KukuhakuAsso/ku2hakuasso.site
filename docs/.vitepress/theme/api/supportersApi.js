import { request } from "./request.js";


const getSupporters = async () => {
  return request("api-scf/afd-info", {
    method: "GET",
  });
};

export { getSupporters };
