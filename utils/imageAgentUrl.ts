export const getImageAgentUrl = () => {
  const configuredUrl = import.meta.env.VITE_IMAGE_GEN_URL;
  if (configuredUrl) return configuredUrl;

  if (
    typeof window !== "undefined" &&
    ["localhost", "127.0.0.1"].includes(window.location.hostname)
  ) {
    return "http://localhost:5177";
  }

  return "";
};
