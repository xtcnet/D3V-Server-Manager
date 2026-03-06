#!/command/with-contenv bash
# shellcheck shell=bash

set -e
set +x

echo "
-------------------------------------
 ____  _______     __
|  _ \|___ /\ \   / /
| | | | |_ \ \ \ / /
| |_| |___) | \ V /
|____/|____/   \_/
-------------------------------------
User:  $NPMUSER PUID:$PUID ID:$(id -u "$NPMUSER") GROUP:$(id -g "$NPMUSER")
Group: $NPMGROUP PGID:$PGID ID:$(get_group_id "$NPMGROUP")
-------------------------------------
"
