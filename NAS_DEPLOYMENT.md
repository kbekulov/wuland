# WULAND Synology NAS Deployment

This guide runs the WULAND multiplayer server on a Synology NAS using Container Manager. The static game client can stay on GitHub Pages.

Recommended setup:

- Client: `https://wuland.bekulov.com`
- Server: `wss://wuland-server.bekulov.com`
- Synology: runs the Docker containers
- Cloudflare Tunnel: exposes the server without router port forwarding

## Best Synology Option: Upload One YML File

If Synology only shows an option to upload a `.yml` file, use this easier flow:

1. Push this repository to GitHub.
2. Run the GitHub Action named `Publish WULAND Server Docker Image`.
3. In GitHub, open the published package `wuland-server` and make it public, or log in to GHCR from Synology if you keep it private.
4. Edit `synology-compose.yml` before uploading it:

```yaml
image: ghcr.io/YOUR_GITHUB_USERNAME/wuland-server:latest
```

Replace `YOUR_GITHUB_USERNAME` with your GitHub username.

5. In the same file, replace:

```txt
PASTE_CLOUDFLARE_TUNNEL_TOKEN_HERE
```

with your Cloudflare Tunnel token.

6. If your NAS main storage is not `/volume1`, change this path:

```yaml
/volume1/docker/wuland-data:/app/server/data
```

7. Upload `synology-compose.yml` in Synology Container Manager.

This option does not require copying the whole project to the NAS. The NAS pulls the already-built game server image from GitHub Container Registry.

## Alternative: Copy The Source Folder To The NAS

Use this route if you want Synology to build the Docker image locally from source.

## 1. Copy Files To The NAS

Copy the whole WULAND repository folder to the NAS, for example:

```txt
/volume1/docker/wuland
```

The important files for the NAS source-build route are:

```txt
docker-compose.yml
.env.synology.example
.dockerignore
server/Dockerfile
server/data/.gitkeep
package.json
package-lock.json
client/package.json
shared/package.json
shared/src
shared/tsconfig.json
server/package.json
server/src
server/tsconfig.json
```

Copying the whole repository is simpler and safer.

Do not copy `node_modules`; Docker installs dependencies inside the container.

## 2. Create The NAS Environment File For Source-Build Route

In `/volume1/docker/wuland`, copy:

```txt
.env.synology.example
```

to:

```txt
.env
```

Then edit `.env`:

```bash
ALLOWED_ORIGINS=https://wuland.bekulov.com
WULAND_SERVER_PORT=2567
OFFLINE_PLAYER_TTL_HOURS=168
CLOUDFLARE_TUNNEL_TOKEN=replace_with_your_cloudflare_tunnel_token
```

Leave `ALLOWED_ORIGINS` as your public game website URL. If you later test from another domain, add it separated by a comma.

## 3. Create A Cloudflare Tunnel

Use this path if your domain is managed by Cloudflare.

1. Open Cloudflare Dashboard.
2. Go to `Zero Trust`.
3. Go to `Networks` -> `Tunnels`.
4. Create a tunnel.
5. Choose the Docker connector.
6. Copy the tunnel token into `CLOUDFLARE_TUNNEL_TOKEN` in `.env`.
7. Add a Public Hostname:

```txt
Hostname: wuland-server.bekulov.com
Service: http://wuland-server:2567
```

The browser will connect with:

```txt
wss://wuland-server.bekulov.com
```

Cloudflare supports WebSockets through proxied connections. No router port forwarding is needed for this tunnel setup.

## 4. Start In Synology Container Manager

1. Open Synology DSM.
2. Open `Container Manager`.
3. Go to `Project`.
4. Click `Create`.
5. Name the project:

```txt
wuland
```

6. Set the path to:

```txt
/volume1/docker/wuland
```

7. Choose the existing `docker-compose.yml`.
8. Build and start the project.

You should see two containers:

```txt
wuland-server
wuland-tunnel
```

## 5. Test The Server

From a device on your home network, open:

```txt
http://YOUR_NAS_LOCAL_IP:2567/health
```

Example:

```txt
http://192.168.1.50:2567/health
```

Expected response:

```json
{
  "ok": true,
  "service": "wuland-server"
}
```

Then test the public tunnel:

```txt
https://wuland-server.bekulov.com/health
```

If that works, WebSocket multiplayer should use:

```txt
wss://wuland-server.bekulov.com
```

## 6. Build The Client For GitHub Pages

The client must be built with:

```bash
VITE_SERVER_URL=wss://wuland-server.bekulov.com
```

For GitHub Actions Pages deployment, add this repository variable:

```txt
Name: VITE_SERVER_URL
Value: wss://wuland-server.bekulov.com
```

Local example:

```bash
cd client
cp .env.production.example .env.production
npm run build
```

## 7. Router Configuration

Recommended Cloudflare Tunnel setup:

```txt
No router port forwarding is required.
```

Your NAS only needs normal outbound internet access.

Direct port-forwarding setup, only if you do not use Cloudflare Tunnel:

1. Use `docker-compose.direct.yml` instead of `docker-compose.yml`.
2. Forward router TCP port `2567` to NAS TCP port `2567`.
3. Use Synology reverse proxy or another proxy to provide HTTPS/WSS.
4. Point your client at `wss://your-domain.example`.
5. Keep `ALLOWED_ORIGINS` limited to your real website URL.

Directly exposing NAS services is riskier. Cloudflare Tunnel is the easier and safer default.

## 8. Persistence

Sleeping/offline player data is stored on the NAS at:

```txt
/volume1/docker/wuland/server/data/wuland-players.json
```

This survives container rebuilds and restarts because `server/data` is mounted into the container.

JSON persistence is prototype-only. A serious public production version should use accounts/authentication and database persistence such as SQLite, Redis, Postgres, or another managed database.
