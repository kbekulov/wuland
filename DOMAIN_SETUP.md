# kbekulov.live Domain Setup

Use `kbekulov.live` as the parent domain for multiplayer service endpoints and future game subdomains.

Recommended pattern:

```txt
wuland.bekulov.com            -> WULAND static client on GitHub Pages
wuland-server.kbekulov.live   -> WULAND multiplayer server through Cloudflare Tunnel

futuregame.kbekulov.live        -> future game static client
futuregame-server.kbekulov.live -> future game multiplayer server
```

## Gandi

Keep Gandi as the registrar, but do not use Gandi Advanced DNS for this domain.

In Gandi, change only the domain nameservers to the two nameservers Cloudflare gives you for `kbekulov.live`.

This affects only `kbekulov.live`, not your other domains.

## Cloudflare DNS

For WULAND, you do not need a `wuland.kbekulov.live` record because the browser game stays at `wuland.bekulov.com`.

Do not create a wildcard record such as `*.kbekulov.live`. Add explicit subdomains for each game or service to avoid accidental domain takeovers and confusing routing.

## Cloudflare Tunnel

For WULAND, add a published application route:

```txt
Hostname: wuland-server.kbekulov.live
Service type: HTTP
Service URL: http://YOUR_NAS_LOCAL_IP:2567
Access protection: off
```

Cloudflare should create the tunnel DNS record automatically when the zone is using Cloudflare nameservers. If you create it manually, use:

```txt
Type: CNAME
Name: wuland-server
Target: YOUR_TUNNEL_ID.cfargotunnel.com
Proxy status: Proxied
TTL: Auto
```

## GitHub Pages

In the `kbekulov/wuland` repository:

```txt
Settings -> Pages -> Custom domain -> wuland.bekulov.com
```

Then enable HTTPS once GitHub allows it.

The repository `CNAME` file already contains:

```txt
wuland.bekulov.com
```

The production client should use:

```txt
VITE_SERVER_URL=wss://wuland-server.kbekulov.live
```

## Synology

Upload `synology-compose.yml` to Container Manager after replacing the Cloudflare token placeholder. The server allows:

```txt
https://wuland.bekulov.com
```

as the production browser origin.
