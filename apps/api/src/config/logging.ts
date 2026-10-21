interface SerializedRequest {
  url?: string;
  query?: unknown;
  [key: string]: unknown;
}

/**
 * The request serializer of pino-http. It removes the query, because the Google callback
 * sends the OAuth code and state in the query. Logs never contain codes or tokens.
 */
export function serializeRequest(req: SerializedRequest): SerializedRequest {
  const logged: SerializedRequest = { ...req, url: req.url?.split("?")[0] };
  delete logged.query;
  return logged;
}
