import { promises as dns, type LookupAddress, type LookupOptions } from "node:dns";
import type { LookupFunction } from "node:net";
import ipaddr from "ipaddr.js";

/** A proxy URL or one of its addresses can reach a private network. The API sends no request. */
export class BlockedUrlError extends Error {
  constructor() {
    super("The proxy URL is not allowed");
    this.name = "BlockedUrlError";
  }
}

type Resolver = (host: string) => Promise<Array<{ address: string; family: 4 | 6 }>>;

const systemResolve: Resolver = async (host) =>
  (await dns.lookup(host, { all: true })).map((entry) => ({
    address: entry.address,
    family: entry.family === 6 ? 6 : 4,
  }));

/**
 * True when the address is not a public unicast address: loopback, private, link-local (with the cloud
 * metadata address), CGNAT, unique local, multicast, and the other special ranges. An IPv4-mapped IPv6
 * address gets the IPv4 check. A text that is not an IP address is blocked too.
 */
export function isBlockedAddress(ip: string): boolean {
  if (!ipaddr.isValid(ip)) {
    return true;
  }
  return ipaddr.process(ip).range() !== "unicast";
}

function isLocalName(host: string): boolean {
  const name = host.toLowerCase().replace(/\.$/, "");
  return name === "localhost" || name.endsWith(".localhost");
}

/** The check of a proxy URL without DNS: https only, no localhost name, and no blocked IP literal. */
export function assertProxyUrl(value: string): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new BlockedUrlError();
  }
  // The hostname of an IPv6 literal has brackets, such as "[::1]".
  const host = url.hostname.replace(/^\[(.*)\]$/, "$1");
  if (url.protocol !== "https:" || isLocalName(host) || (ipaddr.isValid(host) && isBlockedAddress(host))) {
    throw new BlockedUrlError();
  }
}

/**
 * Makes a DNS lookup for the undici connector. It resolves the host and refuses the connection when any
 * address is blocked. The socket then connects to the address that this lookup checked, so a DNS change
 * between the check and the connection cannot pass the guard.
 */
export function createGuardedLookup(resolve: Resolver = systemResolve): LookupFunction {
  return (hostname: string, options: LookupOptions, callback) => {
    resolve(hostname).then(
      (addresses) => {
        if (addresses.length === 0 || isLocalName(hostname) || addresses.some((a) => isBlockedAddress(a.address))) {
          callback(new BlockedUrlError() as NodeJS.ErrnoException, "", 0);
          return;
        }
        if (options.all) {
          callback(null, addresses as LookupAddress[]);
          return;
        }
        const first = addresses[0]!;
        callback(null, first.address, first.family);
      },
      (error: NodeJS.ErrnoException) => callback(error, "", 0),
    );
  };
}
