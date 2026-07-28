import { api } from "./api";

interface JsApiSignature {
  appId: string;
  timestamp: number;
  nonceStr: string;
  signature: string;
}

declare global {
  interface Window {
    h5sdk?: {
      config: (opts: JsApiSignature & { jsApiList: string[] }) => void;
      ready: (cb: () => void) => void;
      error: (cb: (err: unknown) => void) => void;
    };
    tt?: {
      requestAuthCode: (
        opts: { appId: string },
        cb: (res: { code?: string; err_msg?: string }) => void
      ) => void;
    };
  }
}

// Runs the Feishu silent-login handshake: sign the current URL via our own
// backend (/api/jsapi/signature), hand that to h5sdk.config(), then use
// tt.requestAuthCode() to get a one-time code — this only works because the
// page is running inside the Feishu client's webview. The result is
// exchanged for our own session cookie via POST /api/auth/login.
//
// tt.requestAuthCode is the currently-documented method name (Feishu 5.1+);
// older docs call it tt.requestAccess. If this starts failing after a
// Feishu client update, check the current "网页应用开发指南" for a rename.
export async function silentLogin(): Promise<void> {
  if (!window.h5sdk || !window.tt) {
    throw new Error("Feishu JS-SDK not loaded — open this page inside the Feishu client.");
  }

  const url = window.location.href.split("#")[0];
  const sig = await api.get<JsApiSignature>(`/jsapi/signature?url=${encodeURIComponent(url)}`);

  await new Promise<void>((resolve, reject) => {
    window.h5sdk!.error((err) => reject(new Error(`h5sdk.config failed: ${JSON.stringify(err)}`)));
    window.h5sdk!.config({ ...sig, jsApiList: [] });
    window.h5sdk!.ready(() => resolve());
  });

  const code = await new Promise<string>((resolve, reject) => {
    window.tt!.requestAuthCode({ appId: sig.appId }, (res) => {
      if (res.code) resolve(res.code);
      else reject(new Error(res.err_msg ?? "requestAuthCode failed"));
    });
  });

  await api.post("/auth/login", { code });
}
