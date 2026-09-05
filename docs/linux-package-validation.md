# Linux package validation — 2026-09-05

Local test build: **0.1.3**, built from the uncommitted updater work. These artifacts are for review and must not replace the existing published v0.1.3 release. A new release needs a version bump and fresh builds.

## Results

| Check | Ubuntu 22.04 x64 | Fedora 43 x64 |
| --- | --- | --- |
| Linux build and complete test suite | 63 passed | Uses the same built RPM |
| AppImage launch, collector API, renderer, update settings | Passed, extract-and-run mode | Not run |
| AppImage non-root dumpcap capture | Passed; waiting for game | Not run |
| Native package installation with dependency resolution | DEB passed through apt | RPM passed through dnf |
| Desktop entry and executable registration | Passed | Passed |
| Icon-cache validation | Passed | Passed |
| Native non-root direct libpcap capture | Passed; waiting for game | Passed; waiting for game |
| Reinstall restores removed collector capabilities | Passed, then relaunched | Passed, then relaunched |
| Uninstall removes executable and launcher symlink | Passed | Passed |
| Final container exit status | 0 | 0 |

Both desktop environments ran under Xvfb as UID 1000 with Electron's sandbox enabled. Containers used their own network namespace, NET_ADMIN in addition to Docker's default capabilities, and relaxed Docker seccomp to permit nested sandbox namespaces. They had no host network or filesystem mounts. Test settings disabled community contribution and update network checks.

The build used Bun 1.4.0 and Electron 44.1.0. All three artifacts and `latest-linux.yml` were verified against their generated SHA-512 metadata both inside Linux and again after copying to Windows. Local files, test logs, and SHA-256 checksums are under `dist/linux/` (ignored by Git).

## Issues found and fixed

- Added the project homepage required to build native Linux packages, plus author metadata.
- Corrected smoke tests and artifact verification for the packager's native architecture names: AppImage/RPM use `x86_64`; DEB uses `amd64`.
- Changed dumpcap's output-format argument to `-P`, which works with Ubuntu 22.04's Wireshark 3.x. The previous `-F pcap` invocation failed even though the desktop window opened.
- Set the Linux executable name to `valecompanion`. The previous space-containing name broke Ubuntu's alternatives registration and icon cache. The display name remains Vale Companion.
- Changed the CI DEB installation step to use apt so declared dependencies are installed.
- Added repeatable Docker lifecycle tests and capture-start assertions to prevent a successful window launch from hiding a broken capture backend.

## Limits

No game was run. This does not establish game/Proton process attribution or live game packet decoding. AppImage was tested through extract-and-run, not a FUSE mount. A real desktop session, interactive elevation prompts, and an actual version-to-version in-app upgrade remain to be tested. Same-version reinstallation verifies installer behavior and permission restoration; it does not exercise the updater's download/install orchestration.

See [release maintenance](releases.md#linux-package-tests-with-docker) for the exact Docker commands.
