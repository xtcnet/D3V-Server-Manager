#!/bin/bash
set -euo pipefail

# ─── D3V Server Manager - Setup Script ───────────────────────────────────────
# Supports: Ubuntu 18.04, 20.04, 22.04, 24.04
# Commands: install, uninstall, repair, reset-password, status, update, help
# ─────────────────────────────────────────────────────────────────────────────

APP_NAME="D3V Server Manager"
IMAGE_NAME="d3vac/d3v-server-manager:latest"
INSTALL_DIR="/opt/d3v-server-manager"
LOG_FILE="/var/log/d3v-server-manager-setup.log"
GITHUB_REPO="xtcnet/D3V-Server-Manager"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
PURPLE='\033[0;35m'
BOLD='\033[1m'
NC='\033[0m'

log()  { echo -e "  ${GREEN}✓${NC} $*"; echo "[$(date)] $*" >> "$LOG_FILE" 2>/dev/null || true; }
warn() { echo -e "  ${YELLOW}!${NC} $*"; echo "[$(date)] WARN: $*" >> "$LOG_FILE" 2>/dev/null || true; }
fail() { echo -e "  ${RED}✗${NC} $*"; echo "[$(date)] FAIL: $*" >> "$LOG_FILE" 2>/dev/null || true; exit 1; }
step() { echo -e "\n  ${BLUE}▶${NC} ${BOLD}$*${NC}"; echo "[$(date)] STEP: $*" >> "$LOG_FILE" 2>/dev/null || true; }

check_root() {
    if [[ $EUID -ne 0 ]]; then
        fail "This script must be run as root. Use: sudo $0 $*"
    fi
}

get_compose_cmd() {
    if docker compose version &>/dev/null; then
        echo "docker compose"
    elif command -v docker-compose &>/dev/null; then
        echo "docker-compose"
    else
        echo ""
    fi
}

# ─── System checks ───────────────────────────────────────────────────────────

check_os() {
    if [[ ! -f /etc/os-release ]]; then
        fail "Cannot detect OS. This script requires Ubuntu."
    fi
    . /etc/os-release
    if [[ "$ID" != "ubuntu" ]]; then
        fail "This script requires Ubuntu. Detected: $ID"
    fi
    local ver_major
    ver_major=$(echo "$VERSION_ID" | cut -d. -f1)
    if [[ "$ver_major" -lt 18 ]]; then
        fail "Ubuntu 18.04+ required. Detected: $VERSION_ID"
    fi
    log "OS: Ubuntu $VERSION_ID ($PRETTY_NAME)"
}

check_system_requirements() {
    step "Checking system requirements"

    local mem_kb mem_mb
    mem_kb=$(grep MemTotal /proc/meminfo | awk '{print $2}')
    mem_mb=$((mem_kb / 1024))
    if [[ $mem_mb -lt 1024 ]]; then
        warn "Low memory: ${mem_mb}MB (recommended: 2048MB+ for building)"
    else
        log "RAM: ${mem_mb}MB"
    fi

    local disk_avail
    disk_avail=$(df -BM "$INSTALL_DIR" 2>/dev/null | awk 'NR==2{print $4}' | tr -d 'M' || df -BM / | awk 'NR==2{print $4}' | tr -d 'M')
    if [[ "$disk_avail" -lt 4096 ]]; then
        warn "Low disk space: ${disk_avail}MB (recommended: 4096MB+ for building)"
    else
        log "Disk: ${disk_avail}MB available"
    fi

    log "CPU: $(nproc) cores"
}

# ─── Install dependencies ────────────────────────────────────────────────────

install_docker() {
    step "Installing Docker"

    if command -v docker &>/dev/null; then
        log "Docker already installed: $(docker --version)"
        return 0
    fi

    apt-get update -qq
    apt-get install -y -qq ca-certificates curl gnupg lsb-release

    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg 2>/dev/null
    chmod a+r /etc/apt/keyrings/docker.gpg

    echo \
      "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
      $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
      tee /etc/apt/sources.list.d/docker.list > /dev/null

    apt-get update -qq
    apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

    systemctl enable docker
    systemctl start docker

    log "Docker installed: $(docker --version)"
}

install_wireguard_kernel() {
    step "Checking WireGuard kernel support"

    if modprobe wireguard 2>/dev/null; then
        log "WireGuard kernel module loaded"
        return 0
    fi

    apt-get update -qq
    apt-get install -y -qq wireguard-tools

    if modprobe wireguard 2>/dev/null; then
        log "WireGuard kernel module installed and loaded"
    else
        warn "WireGuard kernel module not available. VPN features may not work."
        warn "You may need to install linux-headers: apt install linux-headers-\$(uname -r)"
    fi
}

install_base_packages() {
    step "Installing base packages"
    apt-get update -qq
    apt-get install -y -qq curl git openssl jq
    log "Base packages installed"
}

# ─── Clone / update repo ─────────────────────────────────────────────────────

clone_or_update_repo() {
    step "Downloading source code"

    if [[ -d "$INSTALL_DIR/.git" ]]; then
        cd "$INSTALL_DIR"
        git fetch --all -q
        git reset --hard origin/develop -q
        log "Repository updated"
    else
        rm -rf "$INSTALL_DIR"
        git clone -b develop "https://github.com/${GITHUB_REPO}.git" "$INSTALL_DIR" -q
        log "Repository cloned"
    fi
}

# ─── Pull Docker image ────────────────────────────────────────────────────────

pull_image() {
    step "Pulling Docker image"
    docker pull "$IMAGE_NAME"
    if docker image inspect "$IMAGE_NAME" &>/dev/null; then
        log "Docker image ready: $IMAGE_NAME"
    else
        fail "Docker image pull failed"
    fi
}

# ─── Docker compose setup ────────────────────────────────────────────────────

create_docker_compose() {
    step "Creating Docker Compose configuration"

    cat > "$INSTALL_DIR/docker-compose.yml" <<COMPOSE
services:
  app:
    image: '${IMAGE_NAME}'
    container_name: d3v-server-manager
    restart: unless-stopped
    ports:
      - '80:80'
      - '81:81'
      - '443:443'
      - '51820:51820/udp'
    environment:
      TZ: \${TZ:-UTC}
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
COMPOSE

    log "Docker Compose file created"
}

# ─── Wait for healthy ────────────────────────────────────────────────────────

wait_for_services() {
    step "Waiting for services to start"

    local max_wait=180
    local waited=0
    echo -n "  "

    while ! curl -sf http://localhost:81/api &>/dev/null; do
        if [[ $waited -ge $max_wait ]]; then
            echo ""
            warn "Service did not respond within ${max_wait}s"
            warn "Check logs: cd $INSTALL_DIR && $(get_compose_cmd) logs"
            return 1
        fi
        echo -n "."
        sleep 3
        waited=$((waited + 3))
    done

    echo -e " ${GREEN}ready${NC}"
    log "All services healthy"
}

# ─── Systemd service ─────────────────────────────────────────────────────────

create_systemd_service() {
    step "Creating systemd service"

    local compose_cmd
    compose_cmd=$(get_compose_cmd)

    cat > /etc/systemd/system/d3v-server-manager.service <<UNIT
[Unit]
Description=D3V Server Manager
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=$INSTALL_DIR
ExecStart=$compose_cmd up -d
ExecStop=$compose_cmd down
ExecReload=$compose_cmd restart
TimeoutStartSec=300

[Install]
WantedBy=multi-user.target
UNIT

    systemctl daemon-reload
    systemctl enable d3v-server-manager.service 2>/dev/null || true
    log "Systemd service created and enabled"
}

# ─── Print success ───────────────────────────────────────────────────────────

print_success() {
    local server_ip
    server_ip=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "127.0.0.1")

    echo ""
    echo -e "${PURPLE}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${PURPLE}  ${APP_NAME} - Installed Successfully${NC}"
    echo -e "${PURPLE}═══════════════════════════════════════════════════════════════${NC}"
    echo ""
    echo -e "  ${BOLD}${BLUE}── Web Addresses ──────────────────────────────────────────${NC}"
    echo ""
    echo -e "  ${BOLD}Admin Panel:${NC}"
    echo -e "    Local:          ${CYAN}http://localhost:81${NC}"
    echo -e "    Network:        ${CYAN}http://${server_ip}:81${NC}"
    echo ""
    echo -e "  ${BOLD}HTTP Proxy:${NC}"
    echo -e "    Local:          ${CYAN}http://localhost:80${NC}"
    echo -e "    Network:        ${CYAN}http://${server_ip}:80${NC}"
    echo ""
    echo -e "  ${BOLD}HTTPS Proxy:${NC}"
    echo -e "    Network:        ${CYAN}https://${server_ip}:443${NC}"
    echo ""
    echo -e "  ${BOLD}WireGuard VPN:${NC}"
    echo -e "    UDP Port:       ${CYAN}${server_ip}:51820${NC}"
    echo ""
    echo -e "  ${BOLD}${BLUE}── Default Login ──────────────────────────────────────────${NC}"
    echo ""
    echo -e "    Email:          ${CYAN}admin@example.com${NC}"
    echo -e "    Password:       ${CYAN}changeme${NC}"
    echo ""
    echo -e "    ${RED}⚠  Change these credentials immediately after first login!${NC}"
    echo ""
    echo -e "  ${BOLD}${BLUE}── Configuration ──────────────────────────────────────────${NC}"
    echo ""
    echo -e "    Install dir:    $INSTALL_DIR"
    echo -e "    Docker image:   $IMAGE_NAME"
    echo -e "    Data volume:    d3v_data"
    echo -e "    SSL certs:      d3v_letsencrypt"
    echo -e "    WireGuard:      d3v_wireguard"
    echo -e "    Database:       SQLite (inside data volume)"
    echo ""
    echo -e "  ${BOLD}${BLUE}── Management Commands ────────────────────────────────────${NC}"
    echo ""
    echo -e "    sudo $0 status                    # Full diagnostic"
    echo -e "    sudo $0 update                    # Update to latest"
    echo -e "    sudo $0 repair                    # Repair installation"
    echo -e "    sudo $0 reset-password            # Reset admin password"
    echo -e "    sudo $0 uninstall                 # Uninstall"
    echo ""
    echo -e "    sudo systemctl status d3v-server-manager"
    echo -e "    sudo systemctl restart d3v-server-manager"
    echo ""
    echo -e "  ${BOLD}${BLUE}── Logs ───────────────────────────────────────────────────${NC}"
    echo ""
    echo -e "    Setup log:      $LOG_FILE"
    echo -e "    App logs:       cd $INSTALL_DIR && $(get_compose_cmd) logs -f"
    echo ""
    echo -e "${PURPLE}═══════════════════════════════════════════════════════════════${NC}"
    echo ""
}

# ═══════════════════════════════════════════════════════════════════════════════
# Commands
# ═══════════════════════════════════════════════════════════════════════════════

do_install() {
    echo ""
    echo -e "${PURPLE}═══════════════════════════════════════${NC}"
    echo -e "${PURPLE}  ${APP_NAME} Installer${NC}"
    echo -e "${PURPLE}═══════════════════════════════════════${NC}"
    echo ""

    check_root
    mkdir -p "$(dirname "$LOG_FILE")"
    echo "--- Install started: $(date) ---" >> "$LOG_FILE"

    check_os
    check_system_requirements
    install_base_packages
    install_docker
    install_wireguard_kernel

    pull_image
    mkdir -p "$INSTALL_DIR"
    create_docker_compose

    step "Starting services"
    cd "$INSTALL_DIR"
    local compose_cmd
    compose_cmd=$(get_compose_cmd)
    [[ -z "$compose_cmd" ]] && fail "Docker Compose not found"

    $compose_cmd up -d

    wait_for_services
    create_systemd_service
    print_success
}

do_uninstall() {
    echo ""
    echo -e "${RED}═══════════════════════════════════════${NC}"
    echo -e "${RED}  ${APP_NAME} Uninstall${NC}"
    echo -e "${RED}═══════════════════════════════════════${NC}"
    echo ""

    check_root

    echo "  Uninstall options:"
    echo "    1) Stop containers only (keep data)"
    echo "    2) Remove containers and volumes (delete ALL data)"
    echo "    3) Full removal (containers + data + image + source + systemd)"
    echo "    4) Cancel"
    echo ""

    local choice
    read -rp "$(echo -e "${YELLOW}Select option [1-4]: ${NC}")" choice

    local compose_cmd
    compose_cmd=$(get_compose_cmd)

    case "$choice" in
        1)
            step "Stopping containers"
            if [[ -d "$INSTALL_DIR" ]] && [[ -n "$compose_cmd" ]]; then
                cd "$INSTALL_DIR"
                $compose_cmd down 2>/dev/null || true
            fi
            log "Containers stopped. Data preserved."
            ;;
        2)
            step "Removing containers and volumes"
            if [[ -d "$INSTALL_DIR" ]] && [[ -n "$compose_cmd" ]]; then
                cd "$INSTALL_DIR"
                $compose_cmd down -v --remove-orphans 2>/dev/null || true
            fi
            log "Containers and volumes removed."
            ;;
        3)
            echo ""
            read -rp "$(echo -e "${RED}This will DELETE ALL DATA. Type 'yes' to confirm: ${NC}")" confirm
            if [[ "$confirm" != "yes" ]]; then
                log "Uninstall cancelled"
                exit 0
            fi

            step "Full removal"

            if [[ -d "$INSTALL_DIR" ]] && [[ -n "$compose_cmd" ]]; then
                (cd "$INSTALL_DIR" && $compose_cmd down -v --remove-orphans 2>/dev/null) || true
            fi

            docker rmi "$IMAGE_NAME" 2>/dev/null || true

            if [[ -f /etc/systemd/system/d3v-server-manager.service ]]; then
                systemctl stop d3v-server-manager 2>/dev/null || true
                systemctl disable d3v-server-manager 2>/dev/null || true
                rm -f /etc/systemd/system/d3v-server-manager.service
                systemctl daemon-reload
                log "Systemd service removed"
            fi

            if [[ -d "$INSTALL_DIR" ]]; then
                rm -rf "$INSTALL_DIR"
                log "Removed $INSTALL_DIR"
            fi

            docker image prune -f &>/dev/null || true
            log "${APP_NAME} fully uninstalled"
            ;;
        4|*)
            log "Uninstall cancelled"
            ;;
    esac
    echo ""
}

do_repair() {
    echo ""
    echo -e "${YELLOW}═══════════════════════════════════════${NC}"
    echo -e "${YELLOW}  ${APP_NAME} Repair${NC}"
    echo -e "${YELLOW}═══════════════════════════════════════${NC}"
    echo ""

    check_root

    echo "  Repair options:"
    echo "    1) Restart all services"
    echo "    2) Rebuild image and restart (keep data)"
    echo "    3) Fix Docker installation"
    echo "    4) Pull latest source, rebuild, and restart"
    echo "    5) Reset database (WARNING: deletes all config)"
    echo "    6) Fix file permissions"
    echo "    7) Full repair (fix everything)"
    echo "    8) Cancel"
    echo ""

    local choice
    read -rp "$(echo -e "${YELLOW}Select option [1-8]: ${NC}")" choice

    local compose_cmd
    compose_cmd=$(get_compose_cmd)

    case "$choice" in
        1)
            step "Restarting services"
            cd "$INSTALL_DIR" || fail "$INSTALL_DIR not found"
            $compose_cmd restart
            wait_for_services
            log "Services restarted"
            ;;
        2)
            step "Rebuilding containers"
            cd "$INSTALL_DIR" || fail "$INSTALL_DIR not found"
            $compose_cmd down
            pull_image
            create_docker_compose
            $compose_cmd up -d
            wait_for_services
            log "Image pulled and services restarted"
            ;;
        3)
            install_docker
            systemctl restart docker
            log "Docker repaired"
            ;;
        4)
            step "Pulling latest image and restarting"
            cd "$INSTALL_DIR" || fail "$INSTALL_DIR not found"
            $compose_cmd down 2>/dev/null || true
            pull_image
            create_docker_compose
            $compose_cmd up -d
            wait_for_services
            log "Updated to latest image"
            ;;
        5)
            echo ""
            read -rp "$(echo -e "${RED}This will DELETE all proxy hosts, certs, and users. Type 'yes': ${NC}")" confirm
            if [[ "$confirm" != "yes" ]]; then
                log "Database reset cancelled"
                exit 0
            fi
            step "Resetting database"
            cd "$INSTALL_DIR" || fail "$INSTALL_DIR not found"
            $compose_cmd down
            docker volume rm d3v_data 2>/dev/null || true
            $compose_cmd up -d
            wait_for_services
            log "Database reset. Use default credentials: admin@example.com / changeme"
            ;;
        6)
            step "Fixing permissions"
            chmod -R 755 "$INSTALL_DIR" 2>/dev/null || true
            log "Permissions fixed"
            ;;
        7)
            step "Full repair"
            check_os
            install_base_packages
            install_docker
            install_wireguard_kernel
            systemctl restart docker
            sleep 3

            pull_image
            mkdir -p "$INSTALL_DIR"
            create_docker_compose

            cd "$INSTALL_DIR"
            compose_cmd=$(get_compose_cmd)
            $compose_cmd down 2>/dev/null || true
            $compose_cmd up -d --force-recreate
            wait_for_services
            create_systemd_service
            log "Full repair completed"
            ;;
        8|*)
            log "Repair cancelled"
            ;;
    esac
    echo ""
}

do_reset_password() {
    echo ""
    echo -e "${YELLOW}═══════════════════════════════════════${NC}"
    echo -e "${YELLOW}  ${APP_NAME} - Reset Password${NC}"
    echo -e "${YELLOW}═══════════════════════════════════════${NC}"
    echo ""

    check_root

    local compose_cmd
    compose_cmd=$(get_compose_cmd)
    [[ -z "$compose_cmd" ]] && fail "Docker Compose not found"

    cd "$INSTALL_DIR" || fail "$INSTALL_DIR not found. Run install first."

    local container
    container=$($compose_cmd ps -q app 2>/dev/null)
    if [[ -z "$container" ]]; then
        fail "Container is not running. Start it first: sudo $0 repair"
    fi

    echo "  This will reset the admin user password."
    echo ""

    local email
    read -rp "$(echo -e "  ${BOLD}Admin email${NC} [admin@example.com]: ")" email
    email="${email:-admin@example.com}"

    local new_password
    while true; do
        read -rsp "$(echo -e "  ${BOLD}New password${NC}: ")" new_password
        echo ""
        if [[ ${#new_password} -lt 6 ]]; then
            warn "Password must be at least 6 characters"
            continue
        fi
        local confirm_password
        read -rsp "$(echo -e "  ${BOLD}Confirm password${NC}: ")" confirm_password
        echo ""
        if [[ "$new_password" != "$confirm_password" ]]; then
            warn "Passwords do not match. Try again."
            continue
        fi
        break
    done

    step "Resetting password"

    # Escape single quotes in password for safe shell embedding
    local escaped_password
    escaped_password=$(printf '%s' "$new_password" | sed "s/'/'\\\\''/g")

    # Generate bcrypt hash inside the container using Node.js
    local hash
    hash=$(docker exec "$container" node -e "
        import('bcrypt').then(b => b.default.hash('${escaped_password}', 13).then(h => process.stdout.write(h)));
    " 2>/dev/null) || true

    if [[ -z "$hash" ]]; then
        hash=$(docker exec "$container" node -e "
            const bcrypt = require('bcrypt');
            bcrypt.hash('${escaped_password}', 13).then(h => process.stdout.write(h));
        " 2>/dev/null) || true
    fi

    if [[ -z "$hash" ]]; then
        fail "Could not generate password hash. Container may not be healthy."
    fi

    # Update via SQLite
    docker exec "$container" sqlite3 /data/database.sqlite \
        "UPDATE auth SET secret='${hash}' WHERE user_id IN (SELECT id FROM user WHERE email='${email}' AND is_deleted=0) AND type='password';" 2>/dev/null

    if [[ $? -eq 0 ]]; then
        echo ""
        log "Password reset successfully!"
        echo ""
        echo -e "    Email:    ${CYAN}${email}${NC}"
        echo -e "    Password: ${CYAN}(your new password)${NC}"
        echo ""
    else
        fail "Failed to reset password. Please check the email address and try again."
    fi
}

do_status() {
    echo ""
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}  ${APP_NAME} - Status${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
    echo ""

    local server_ip
    server_ip=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "127.0.0.1")

    echo -e "  ${BOLD}${BLUE}── System ─────────────────────────────────────────────────${NC}"
    echo ""
    echo -e "    Hostname:         $(hostname 2>/dev/null || echo 'unknown')"
    echo -e "    Server IP:        $server_ip"
    local mem_kb mem_mb
    mem_kb=$(grep MemTotal /proc/meminfo 2>/dev/null | awk '{print $2}' || echo 0)
    mem_mb=$((mem_kb / 1024))
    echo -e "    RAM:              ${mem_mb}MB"
    echo -e "    CPU:              $(nproc 2>/dev/null || echo 'unknown') cores"
    echo ""

    echo -e "  ${BOLD}${BLUE}── Prerequisites ──────────────────────────────────────────${NC}"
    echo ""
    local all_ok=true

    if command -v docker &>/dev/null; then
        echo -e "    Docker:           ${GREEN}$(docker --version 2>/dev/null | head -c 50)${NC}"
    else
        echo -e "    Docker:           ${RED}missing${NC}"; all_ok=false
    fi

    local cc; cc=$(get_compose_cmd)
    if [[ -n "$cc" ]]; then
        echo -e "    Docker Compose:   ${GREEN}installed${NC}"
    else
        echo -e "    Docker Compose:   ${RED}missing${NC}"; all_ok=false
    fi

    if docker info &>/dev/null 2>&1; then
        echo -e "    Docker daemon:    ${GREEN}running${NC}"
    else
        echo -e "    Docker daemon:    ${RED}not running${NC}"; all_ok=false
    fi

    if docker image inspect "$IMAGE_NAME" &>/dev/null 2>&1; then
        echo -e "    D3V Image:        ${GREEN}$IMAGE_NAME${NC}"
    else
        echo -e "    D3V Image:        ${RED}not built${NC}"; all_ok=false
    fi

    if lsmod | grep -q wireguard 2>/dev/null; then
        echo -e "    WireGuard:        ${GREEN}kernel module loaded${NC}"
    else
        echo -e "    WireGuard:        ${YELLOW}kernel module not loaded${NC}"
    fi
    echo ""

    echo -e "  ${BOLD}${BLUE}── Application ────────────────────────────────────────────${NC}"
    echo ""

    if [[ -d "$INSTALL_DIR" ]]; then
        echo -e "    Install dir:      ${GREEN}$INSTALL_DIR${NC}"
        if [[ -d "$INSTALL_DIR/.git" ]]; then
            local commit
            commit=$(cd "$INSTALL_DIR" && git rev-parse --short HEAD 2>/dev/null || echo "unknown")
            echo -e "    Source commit:    ${CYAN}$commit${NC}"
        fi
    else
        echo -e "    Install dir:      ${RED}not found${NC}"; all_ok=false
    fi

    if systemctl is-enabled d3v-server-manager &>/dev/null 2>&1; then
        echo -e "    Systemd service:  ${GREEN}enabled${NC}"
    else
        echo -e "    Systemd service:  ${YELLOW}not configured${NC}"
    fi
    echo ""

    if [[ -d "$INSTALL_DIR" ]] && docker info &>/dev/null 2>&1 && [[ -n "$cc" ]]; then
        echo -e "  ${BOLD}${BLUE}── Containers ─────────────────────────────────────────────${NC}"
        echo ""
        cd "$INSTALL_DIR"
        $cc ps 2>/dev/null | while IFS= read -r line; do
            if echo "$line" | grep -qi "up\|running"; then
                echo -e "    ${GREEN}$line${NC}"
            elif echo "$line" | grep -qi "name\|---\|CONTAINER"; then
                echo -e "    ${BOLD}$line${NC}"
            else
                echo -e "    ${RED}$line${NC}"
            fi
        done
        echo ""
    fi

    echo -e "  ${BOLD}${BLUE}── Web Endpoints ──────────────────────────────────────────${NC}"
    echo ""

    echo -e "    ${BOLD}Admin Panel:${NC}"
    if curl -sf http://localhost:81/api &>/dev/null 2>&1; then
        echo -e "      Local:          ${GREEN}http://localhost:81${NC}  (healthy)"
        echo -e "      Network:        ${GREEN}http://${server_ip}:81${NC}"
    else
        echo -e "      Local:          ${RED}http://localhost:81${NC}  (unreachable)"
        echo -e "      Network:        ${RED}http://${server_ip}:81${NC}"
    fi
    echo ""

    echo -e "    ${BOLD}HTTP Proxy:${NC}         http://${server_ip}:80"
    echo -e "    ${BOLD}HTTPS Proxy:${NC}        https://${server_ip}:443"
    echo -e "    ${BOLD}WireGuard UDP:${NC}      ${server_ip}:51820"
    echo ""

    echo -e "  ${BOLD}${BLUE}── Management ─────────────────────────────────────────────${NC}"
    echo ""
    echo -e "    sudo $0 update             # Pull latest source and rebuild"
    echo -e "    sudo $0 repair             # Repair"
    echo -e "    sudo $0 reset-password     # Reset password"
    echo -e "    sudo $0 uninstall          # Uninstall"
    echo ""

    if [[ "$all_ok" == false ]]; then
        echo -e "  ${YELLOW}Some components need attention. Run: sudo $0 repair${NC}"
        echo ""
    fi
}

do_update() {
    echo ""
    echo -e "${BLUE}═══════════════════════════════════════${NC}"
    echo -e "${BLUE}  ${APP_NAME} Update${NC}"
    echo -e "${BLUE}═══════════════════════════════════════${NC}"
    echo ""

    check_root

    local compose_cmd
    compose_cmd=$(get_compose_cmd)
    [[ -z "$compose_cmd" ]] && fail "Docker Compose not found"

    step "Pulling latest image"
    pull_image
    create_docker_compose

    step "Recreating containers"
    cd "$INSTALL_DIR"
    $compose_cmd down 2>/dev/null || true
    $compose_cmd up -d

    wait_for_services
    log "Update complete"
    echo ""
}

do_help() {
    echo ""
    echo -e "${BOLD}${APP_NAME} Setup Script${NC}"
    echo ""
    echo "Usage: sudo $0 <command>"
    echo ""
    echo "Commands:"
    echo "  install           Install ${APP_NAME} (clone source, build image, start)"
    echo "  uninstall         Uninstall (interactive, 3 levels)"
    echo "  repair            Repair installation (interactive, 7 options)"
    echo "  reset-password    Reset admin user password"
    echo "  update            Pull latest source, rebuild image, restart"
    echo "  status            Show full diagnostic information"
    echo "  help              Show this help"
    echo ""
    echo "Examples:"
    echo "  sudo $0 install"
    echo "  sudo $0 status"
    echo "  sudo $0 reset-password"
    echo ""
}

# ─── Main ─────────────────────────────────────────────────────────────────────

case "${1:-help}" in
    install)        do_install ;;
    uninstall)      do_uninstall ;;
    repair)         do_repair ;;
    reset-password) do_reset_password ;;
    update)         do_update ;;
    status)         do_status ;;
    help|--help|-h) do_help ;;
    *)
        echo -e "${RED}Unknown command: $1${NC}"
        do_help
        exit 1
        ;;
esac
