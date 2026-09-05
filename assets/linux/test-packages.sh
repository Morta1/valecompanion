#!/usr/bin/env bash
set -euo pipefail
cd /workspace

# The container receives capture capabilities in its own network namespace only.
# Keep Electron's sandbox enabled and run the desktop as an ordinary user.
test "$(id -u)" = 0
runuser -u tester -- bun --version
file build/collector/bin/bun
setcap cap_net_raw,cap_net_admin=eip /usr/bin/dumpcap
export VALECOMPANION_SMOKE_EXPECT_CAPTURE=1
export VALECOMPANION_SMOKE_CAPTURE_MODE=dumpcap
runuser -u tester -- xvfb-run -a bun run smoke:package:linux

apt-get update
apt-get install -y ./dist/*.deb desktop-file-utils
desktop-file-validate /usr/share/applications/valecompanion.desktop
update-alternatives --display valecompanion
gtk-update-icon-cache -f /usr/share/icons/hicolor
getcap '/opt/Vale Companion/resources/collector/bin/bun'
test "$(getcap '/opt/Vale Companion/resources/collector/bin/bun')" = '/opt/Vale Companion/resources/collector/bin/bun cap_net_admin,cap_net_raw=eip'
test "$(cat '/opt/Vale Companion/resources/package-type')" = deb
export VALECOMPANION_SMOKE_CAPTURE_MODE=libpcap
runuser -u tester -- xvfb-run -a bun run smoke:package:linux '/opt/Vale Companion/valecompanion'

# Reinstallation must restore capabilities after replacing the runtime file.
setcap -r '/opt/Vale Companion/resources/collector/bin/bun'
dpkg -i dist/*.deb
test "$(getcap '/opt/Vale Companion/resources/collector/bin/bun')" = '/opt/Vale Companion/resources/collector/bin/bun cap_net_admin,cap_net_raw=eip'
runuser -u tester -- xvfb-run -a bun run smoke:package:linux '/opt/Vale Companion/valecompanion'
apt-get remove -y valecompanion
test ! -e '/opt/Vale Companion/valecompanion'
test ! -L /usr/bin/valecompanion
echo 'PASS: AppImage launch; DEB desktop registration, install, launch, reinstall, capture capabilities and uninstall.'
