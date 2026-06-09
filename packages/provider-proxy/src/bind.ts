export class ProxyBindError extends Error {
  readonly code = "remote_bind_requires_token_auth";
  readonly name = "ProxyBindError";

  constructor() {
    super("remote_bind_requires_token_auth");
  }
}

export type ProxyBindInput = {
  readonly allowRemoteBind?: boolean;
  readonly host?: string;
  readonly port?: number;
  readonly tokenAuth?: string;
};

export type ValidatedProxyBindOptions = {
  readonly allowRemoteBind: boolean;
  readonly host: string;
  readonly port: number;
  readonly tokenAuth?: string;
};

const defaultHost = "127.0.0.1";
const defaultPort = 41473;
const remoteHosts = new Set(["0.0.0.0", "::"]);

const requiresRemoteToken = (host: string): boolean => remoteHosts.has(host);

export const validateProxyBindOptions = (input: ProxyBindInput): ValidatedProxyBindOptions => {
  const allowRemoteBind = input.allowRemoteBind ?? false;
  const host = input.host ?? defaultHost;
  const port = input.port ?? defaultPort;
  const tokenAuth = input.tokenAuth;

  if (
    requiresRemoteToken(host) &&
    (!allowRemoteBind || tokenAuth === undefined || tokenAuth.length === 0)
  ) {
    throw new ProxyBindError();
  }

  return {
    allowRemoteBind,
    host,
    port,
    ...(tokenAuth === undefined ? {} : { tokenAuth }),
  };
};
