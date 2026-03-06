<p align="center">
  <h1 align="center">D3V Server Manager</h1>
  <p align="center">
    A powerful, all-in-one web interface for managing Nginx reverse proxies, SSL certificates, and WireGuard VPN — built for self-hosters.
  </p>
</p>

<p align="center">
  <a href="https://github.com/xtcnet/D3V-Server-Manager"><img src="https://img.shields.io/github/stars/xtcnet/D3V-Server-Manager?style=for-the-badge" alt="Stars"></a>
  <a href="https://github.com/xtcnet/D3V-Server-Manager/issues"><img src="https://img.shields.io/github/issues/xtcnet/D3V-Server-Manager?style=for-the-badge" alt="Issues"></a>
  <a href="https://github.com/xtcnet/D3V-Server-Manager/blob/develop/LICENSE"><img src="https://img.shields.io/github/license/xtcnet/D3V-Server-Manager?style=for-the-badge" alt="License"></a>
</p>

---

## Overview

D3V Server Manager is a fork of [Nginx Proxy Manager](https://github.com/NginxProxyManager/nginx-proxy-manager) with integrated **WireGuard VPN management**, full rebranding, and an automated Ubuntu setup script. It provides a clean web UI for managing:

- **Reverse Proxy Hosts** — Forward domains to internal services with a few clicks
- **SSL Certificates** — Free Let's Encrypt certificates with automatic renewal, or bring your own
- **Redirection Hosts** — 301/302 redirects without touching config files
- **Streams** — TCP/UDP port forwarding
- **Access Lists** — HTTP basic auth and IP-based restrictions
- **404 Hosts** — Custom "not found" pages for unused domains
- **WireGuard VPN** — Create servers, manage peers, download configs, monitor live stats — all from the dashboard

No Nginx or WireGuard CLI knowledge required.

---

## Features

| Feature | Description |
|---|---|
| **Proxy Hosts** | Reverse proxy with SSL termination, WebSocket support, custom headers, caching |
| **SSL Certificates** | Let's Encrypt (HTTP-01 & DNS-01), custom certificates, auto-renewal |
| **WireGuard VPN** | Built-in server/peer management, key generation, config download, live transfer stats |
| **Redirections** | 301/302 redirects with regex support |
| **Streams** | TCP/UDP port forwarding |
| **Access Lists** | HTTP basic auth, IP allow/deny lists |
| **User Management** | Multi-user with role-based permissions (admin / user) |
| **Two-Factor Auth** | TOTP-based 2FA with backup codes |
| **Audit Log** | Track all configuration changes |
| **Dark/Light UI** | Modern Tabler-based responsive interface |

---

## Quick Start

### Option 1: Automated Setup (Ubuntu)

```bash
curl -sSL https://raw.githubusercontent.com/xtcnet/D3V-Server-Manager/develop/setup.sh -o setup.sh
chmod +x setup.sh
sudo ./setup.sh install
```

This installs Docker, WireGuard kernel modules, pulls the image from Docker Hub, and starts everything with a systemd service.

### Option 2: Docker Compose (Any OS)

```yaml
services:
  app:
    image: 'd3vac/d3v-server-manager:latest'
    container_name: d3v-server-manager
    restart: unless-stopped
    ports:
      - '80:80'       # HTTP
      - '81:81'       # Admin UI
      - '443:443'     # HTTPS
      - '51820:51820/udp'  # WireGuard
    environment:
      TZ: UTC
      DB_SQLITE_FILE: "/data/database.sqlite"
    volumes:
      - d3v_data:/data
      - d3v_letsencrypt:/etc/letsencrypt
      - d3v_wireguard:/etc/wireguard
    cap_add:
      - NET_ADMIN
      - SYS_MODULE
    sysctls:
      - net.ipv4.ip_forward=1
      - net.ipv4.conf.all.src_valid_mark=1
    healthcheck:
      test: ["CMD", "curl", "-sf", "http://localhost:81/api"]
      interval: 30s
      timeout: 10s
      retries: 3

volumes:
  d3v_data:
  d3v_letsencrypt:
  d3v_wireguard:
```

```bash
docker compose up -d
```

### Default Login

| | |
|---|---|
| **URL** | `http://YOUR_SERVER_IP:81` |
| **Email** | `admin@example.com` |
| **Password** | `changeme` |

> **Change these credentials immediately after first login.**

---

## Ports

| Port | Protocol | Service |
|---|---|---|
| `80` | TCP | HTTP proxy |
| `81` | TCP | Admin web UI |
| `443` | TCP | HTTPS proxy |
| `51820` | UDP | WireGuard VPN |

---

## WireGuard VPN

The integrated WireGuard module provides a full VPN solution directly inside the admin panel (admin-only).

### Capabilities

- **Create VPN servers** — Name, address range, listen port, endpoint, DNS, MTU, PostUp/PostDown scripts
- **Manage peers** — Add clients with allowed IPs, persistent keepalive, auto IP allocation
- **Download configs** — One-click `.conf` file download for each peer (import into any WireGuard client)
- **Live monitoring** — Real-time transfer stats (TX/RX), last handshake time, enable/disable peers
- **Multiple servers** — Run multiple WireGuard interfaces with separate subnets

### Requirements

The host must support the WireGuard kernel module. The container needs:

- `NET_ADMIN` and `SYS_MODULE` capabilities
- `net.ipv4.ip_forward=1` sysctl
- UDP port `51820` exposed

The setup script handles all of this automatically on Ubuntu.

---

## Setup Script Reference

```
Usage: sudo ./setup.sh <command>
```

| Command | Description |
|---|---|
| `install` | Full installation — Docker, WireGuard, image pull, systemd service |
| `uninstall` | Interactive removal — stop only / remove volumes / full purge |
| `repair` | Interactive repair — restart, rebuild, fix Docker, re-pull, reset DB, fix permissions, full |
| `reset-password` | Reset any user's password via bcrypt hash + SQLite |
| `update` | Pull latest image and recreate containers |
| `status` | Full diagnostic — system info, prerequisites, containers, endpoint health |
| `help` | Show usage |

### Supported Platforms

- Ubuntu 18.04 LTS
- Ubuntu 20.04 LTS
- Ubuntu 22.04 LTS
- Ubuntu 24.04 LTS

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Docker Container                  │
│                                                     │
│  ┌──────────┐  ┌──────────┐  ┌────────────────┐   │
│  │  Nginx   │  │ Node.js  │  │   WireGuard    │   │
│  │  :80/:443│  │ Backend  │  │   :51820/udp   │   │
│  │  reverse  │  │  :81 API │  │   wg-quick     │   │
│  │  proxy   │  │  Express  │  │   tunnels      │   │
│  └──────────┘  └────┬─────┘  └────────────────┘   │
│                      │                              │
│               ┌──────┴──────┐                       │
│               │   SQLite    │                       │
│               │  /data/db   │                       │
│               └─────────────┘                       │
│                                                     │
│  ┌──────────────────────────────────────────────┐  │
│  │          React Frontend (Vite + TS)          │  │
│  │          Tabler UI • React Query             │  │
│  └──────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

**Backend:** Node.js, Express, Objection.js (Knex), SQLite/PostgreSQL  
**Frontend:** React 18, TypeScript, Vite, Tabler, React Query, Formik  
**Infrastructure:** Docker, s6-overlay, Nginx, Certbot, WireGuard  

---

## Development

```bash
# Clone
git clone https://github.com/xtcnet/D3V-Server-Manager.git
cd D3V-Server-Manager

# Start dev environment (requires Docker)
cd docker
docker compose -f docker-compose.dev.yml up --build

# Frontend dev server
cd frontend
yarn install
yarn dev

# Backend runs inside the Docker container
```

The dev compose includes PostgreSQL, Redis, and a local CA for testing SSL.

---

## Hosting Your Home Network

1. Log into your router and set up **port forwarding** for ports `80`, `443`, and `51820/udp` to your server
2. Point your domain to your public IP using a DDNS service (DuckDNS, Cloudflare, Route53)
3. Open D3V Server Manager at `http://YOUR_SERVER:81`
4. Add proxy hosts to route domains to your internal services
5. Enable Let's Encrypt SSL with one click
6. Set up WireGuard VPN for secure remote access

---

## Contributing

Pull requests are welcome against the `develop` branch. All PRs must pass CI before review.

---

## Credits

Built on top of [Nginx Proxy Manager](https://github.com/NginxProxyManager/nginx-proxy-manager) by [jc21](https://github.com/jc21). WireGuard integration and D3V branding by [xtcnet](https://github.com/xtcnet).

---

## License

[MIT](LICENSE)
