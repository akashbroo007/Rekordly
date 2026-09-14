# Recording on blocked networks

Some internet providers block access to cam sites. Rekordly handles this with a built-in **Secure Proxy** — no VPN subscription, no manual configuration, and nothing to install beyond the app itself.

## How it works

When you add or edit a creator, there is a **"Use secure proxy for this creator"** switch. It is off by default — most networks can reach every supported site directly.

With the switch on:

1. Rekordly first tries to reach the site **directly**. If your network can already reach it (for example, because you use a system VPN), everything runs at full speed and the built-in proxy stays idle.
2. If the direct connection fails at the network level — the classic signature of an ISP block — Rekordly automatically routes that creator's traffic through an **embedded secure proxy** (powered by the Tor network). The proxy runtime is downloaded automatically on first use; you never configure anything.

The proxy is decided **per creator**, because site blocking is a property of *your* network, not of the site. One creator can use the proxy while others stay direct.

## Managing the proxy

The **Secure Proxy** page (it appears in the sidebar the first time you enable the proxy for any creator) shows:

- Live status: standing by, downloading the runtime, connecting, active, or an error with a **Retry** button
- Every creator currently flagged for the proxy, with a quick on/off switch
- A **Test connection** button that verifies the route and shows the exit node's IP and latency
- The dashboard shows a slim banner while the proxy is in use

## Why it can be slower — and the free speed upgrade

The built-in proxy routes through the Tor network, which is resilient but slow. For full recording speed you can install [Cloudflare WARP](https://one.one.one.one/) — free, made by Cloudflare — on your PC.

Once WARP is running, Rekordly picks it up **automatically**: the direct connection starts working again, recordings go full speed, and the built-in proxy simply stays on standby as a backup. No settings, no changes inside Rekordly.

| Setup | Live checks | Recording speed |
| --- | --- | --- |
| Cloudflare WARP installed | Direct through WARP — full speed | Full speed |
| WARP off, proxy enabled | Through the built-in proxy — slower | Through the built-in proxy |
| WARP off, proxy off | Fails (the block stays) | — |

## FAQ

**Is the built-in proxy really free?**
Yes — it ships inside Rekordly, costs nothing, and requires no account. The tradeoff is speed: Tor routes through volunteer relays.

**Does Rekordly see my traffic?**
No. For flagged creators, traffic is routed through a local proxy process running on your own machine. Nothing leaves your computer except the requests to the sites you record, and nothing is uploaded anywhere unless you configure a cloud provider yourself.

**Do I have to use Cloudflare WARP?**
No — it is an optional speed upgrade. The built-in proxy alone is enough to record on a blocked network; WARP just makes it fast. Any system VPN works the same way, because Rekordly always prefers the direct route when it works.
