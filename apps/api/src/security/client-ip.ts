import { isIP } from "node:net";
import type { Request } from "express";

/**
 * Returns the IP address of the client, for rate limits.
 * Cloudflare sets CF-Connecting-IP on each request through the tunnel. Traefik replaces
 * X-Forwarded-For with the address of the cloudflared container, so req.ip is the same
 * for all users. Only the tunnel can reach Traefik, so a client cannot set this header itself.
 */
export function clientIp(req: Request): string {
  const header = req.headers["cf-connecting-ip"];
  const value = Array.isArray(header) ? header[0] : header;
  if (value && isIP(value.trim()) !== 0) {
    return value.trim();
  }
  return req.ip ?? "unknown";
}
