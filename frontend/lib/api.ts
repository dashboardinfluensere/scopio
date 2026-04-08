export function getServerApiUrl() {
  const apiUrl = process.env.API_URL;

  if (!apiUrl) {
    throw new Error("API_URL mangler i frontend sitt server-miljø");
  }

  return apiUrl;
}

export function getClientApiUrl() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;

  if (!apiUrl) {
    throw new Error("NEXT_PUBLIC_API_URL mangler i frontend sitt client-miljø");
  }

  return apiUrl;
}