import { describe, expect, it } from "vitest";
import { ProxyBindError, validateProxyBindOptions } from "./bind";

describe("validateProxyBindOptions", () => {
  it("remote_bind_requires_flag_and_token", () => {
    expect(() => validateProxyBindOptions({ host: "0.0.0.0", port: 47148 })).toThrow(
      ProxyBindError,
    );

    try {
      validateProxyBindOptions({ host: "0.0.0.0", port: 47148 });
    } catch (error) {
      expect(error).toBeInstanceOf(ProxyBindError);
      expect(error instanceof ProxyBindError ? error.code : "").toBe(
        "remote_bind_requires_token_auth",
      );
    }
  });

  it("defaults_to_loopback_bind", () => {
    const options = validateProxyBindOptions({});

    expect(options.host).toBe("127.0.0.1");
    expect(options.port).toBe(41473);
  });

  it("allows_remote_bind_with_flag_and_token", () => {
    const options = validateProxyBindOptions({
      allowRemoteBind: true,
      host: "0.0.0.0",
      port: 47148,
      tokenAuth: "local-token",
    });

    expect(options.host).toBe("0.0.0.0");
    expect(options.tokenAuth).toBe("local-token");
  });
});
