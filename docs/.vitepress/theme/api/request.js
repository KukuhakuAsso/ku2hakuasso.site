const request = async ({
  url,
  method = "GET",
  params = {},
  headers = {},
  signal,
}) => {
  const requestUrl = new URL(url, window.location.origin);
  console.log(requestUrl.toString());

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      requestUrl.searchParams.set(key, String(value));
    }
  });

  const response = await fetch(requestUrl.toString(), {
    method,
    headers: {
      Accept: "application/json",
      ...headers,
    },
    cache: "no-store",
    signal,
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  return response.json();
};

export { request };
