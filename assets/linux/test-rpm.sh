#!/usr/bin/env bash
set -euo pipefail
cd /workspace
dnf install -y /packages/*.rpm
desktop-file-validate /usr/share/applications/valecompanion.desktop
update-alternatives --display valecompanion
gtk-update-icon-cache -f /usr/share/icons/hicolor
test "$(getcap '/opt/Vale Companion/resources/collector/bin/bun')" = '/opt/Vale Companion/resources/collector/bin/bun cap_net_admin,cap_net_raw=eip'
test "$(cat '/opt/Vale Companion/resources/package-type')" = rpm
export VALECOMPANION_SMOKE_EXPECT_CAPTURE=1
export VALECOMPANION_SMOKE_CAPTURE_MODE=libpcap
runuser -u tester -- xvfb-run -a bun run smoke:package:linux '/opt/Vale Companion/valecompanion'
setcap -r '/opt/Vale Companion/resources/collector/bin/bun'
dnf reinstall -y /packages/*.rpm
test "$(getcap '/opt/Vale Companion/resources/collector/bin/bun')" = '/opt/Vale Companion/resources/collector/bin/bun cap_net_admin,cap_net_raw=eip'
runuser -u tester -- xvfb-run -a bun run smoke:package:linux '/opt/Vale Companion/valecompanion'
dnf remove -y valecompanion
test ! -e '/opt/Vale Companion/valecompanion'
test ! -L /usr/bin/valecompanion
echo 'PASS: RPM desktop registration, install, launch, reinstall, capture capabilities and uninstall.'
