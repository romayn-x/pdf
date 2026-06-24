import cloudbase from "@cloudbase/js-sdk";

const envId = import.meta.env.VITE_CLOUDBASE_ENV_ID;
const publishableKey = import.meta.env.VITE_CLOUDBASE_PUBLISHABLE_KEY;

/** @type {import("@cloudbase/js-sdk").App | null} */
let app = null;

/** @type {Promise<{ ready: boolean; reason?: string }> | null} */
let readyPromise = null;

export function isCloudBaseConfigured() {
  return Boolean(envId?.trim());
}

export function getCloudBaseApp() {
  if (!isCloudBaseConfigured()) {
    return null;
  }

  if (!app) {
    const options = { env: envId.trim() };
    if (publishableKey?.trim()) {
      options.accessKey = publishableKey.trim();
    }
    app = cloudbase.init(options);
  }

  return app;
}

export function getCloudBaseAuth() {
  const cloudApp = getCloudBaseApp();
  if (!cloudApp) {
    return null;
  }

  return cloudApp.auth({ persistence: "local" });
}

export function getCloudBaseDatabase() {
  const cloudApp = getCloudBaseApp();
  if (!cloudApp) {
    return null;
  }

  return cloudApp.database();
}

/**
 * 初始化 CloudBase：未配置环境 ID 时静默跳过；已配置则尝试匿名登录（需在控制台开启）。
 */
export async function ensureCloudBaseReady() {
  if (!isCloudBaseConfigured()) {
    return { ready: false, reason: "missing_env" };
  }

  const cloudApp = getCloudBaseApp();
  const auth = getCloudBaseAuth();
  if (!cloudApp || !auth) {
    return { ready: false, reason: "init_failed" };
  }

  const loginState = await auth.getLoginState();
  if (!loginState) {
    await auth.signInAnonymously();
  }

  return { ready: true, app: cloudApp, auth };
}

/**
 * 应用启动时调用一次，失败不阻塞页面（本地 PDF 功能不依赖云）。
 */
export function initCloudBase() {
  if (!isCloudBaseConfigured()) {
    return Promise.resolve({ ready: false, reason: "missing_env" });
  }

  if (!readyPromise) {
    readyPromise = ensureCloudBaseReady().catch((error) => {
      readyPromise = null;
      console.warn("[CloudBase] 初始化失败:", error);
      return { ready: false, reason: "error", error };
    });
  }

  return readyPromise;
}
