import dns from 'dns';

// ---------------------------------------------------------------------------
// Supabase pooler DNS workaround
// ---------------------------------------------------------------------------
// On some networks the local/ISP resolver returns REFUSED for
// `*.pooler.supabase.com` (observed: "DNS operation refused"), even though the
// records resolve fine on public resolvers. Because `pg` connects through
// `net.connect`, it relies on the OS resolver (`dns.lookup` / getaddrinfo),
// which we cannot point at a different server the way `dns.Resolver` allows.
//
// Fix: monkey-patch `dns.lookup` so that ONLY Supabase hosts are resolved via a
// c-ares resolver pointed at public DNS servers. Every other hostname — and any
// failure of the public lookup — falls through to the original OS resolver, so
// behaviour is unchanged for the rest of the process.
//
// Override the servers with DNS_FALLBACK_SERVERS (comma-separated) if 1.1.1.1 /
// 8.8.8.8 are themselves blocked on the target network.

const FALLBACK_SERVERS = (process.env.DNS_FALLBACK_SERVERS ?? '1.1.1.1,8.8.8.8')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

function isSupabaseHost(hostname: string): boolean {
  return hostname.endsWith('.supabase.com') || hostname.endsWith('.supabase.co');
}

const resolver = new dns.Resolver();
resolver.setServers(FALLBACK_SERVERS);

const originalLookup = dns.lookup.bind(dns) as typeof dns.lookup;

// dns.lookup has several overloads (with/without options). We normalise the
// callback-style call and only intercept Supabase hosts; otherwise delegate.
function patchedLookup(
  hostname: string,
  options: unknown,
  callback?: unknown
): void {
  const cb = (typeof options === 'function' ? options : callback) as (
    err: NodeJS.ErrnoException | null,
    address: string | dns.LookupAddress[],
    family?: number
  ) => void;
  const opts = typeof options === 'function' ? {} : (options as dns.LookupOptions);

  if (!hostname || !isSupabaseHost(hostname)) {
    return (originalLookup as (...a: unknown[]) => void)(hostname, options, callback);
  }

  resolver.resolve4(hostname, (err, addresses) => {
    if (err || !addresses || addresses.length === 0) {
      // Fall back to the OS resolver on any failure.
      return (originalLookup as (...a: unknown[]) => void)(hostname, options, callback);
    }
    const address = addresses[0];
    if (opts && opts.all) {
      cb(null, addresses.map((a) => ({ address: a, family: 4 })));
    } else {
      cb(null, address as unknown as dns.LookupAddress[], 4);
    }
  });
}

// Preserve the static `__promisify__` member so `util.promisify(dns.lookup)`
// keeps working if anything in the stack relies on it.
(patchedLookup as unknown as { __promisify__?: unknown }).__promisify__ = (
  dns.lookup as unknown as { __promisify__?: unknown }
).__promisify__;

(dns as unknown as { lookup: unknown }).lookup = patchedLookup;
