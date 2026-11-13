export const getImageAgentUrl = () => {
  // 画像ツールは同じドメインの /image-tool/ で動く（ログインCookieを共有するため）
  const configuredUrl = import.meta.env.VITE_IMAGE_GEN_URL;
  if (configuredUrl && typeof window !== "undefined") {
    return new URL(configuredUrl, window.location.origin).href;
  }
  if (configuredUrl) return configuredUrl;

  if (
    typeof window !== "undefined" &&
    ["localhost", "127.0.0.1"].includes(window.location.hostname)
  ) {
    return "http://localhost:5177";
  }

  if (typeof window !== "undefined") {
    return `${window.location.origin}/image-tool/`;
  }
  return "";
};
