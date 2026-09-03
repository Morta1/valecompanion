# Vale Companion

Vale Companion is the preferred desktop companion for **Spirit Vale**. It combines the ValeLoot live bag and rule-based alerts with the ValeMarket browser and passive community contribution in one application.

- No DLL injection, BepInEx, runtime patching, or game-file modification
- No gameplay automation, input simulation, buying, selling, dismantling, or item movement
- Passive, process-scoped network observation through Npcap on Windows or libpcap/dumpcap on Linux
- Local loot rules, profiles, alert history, and sounds
- Equipment, artifacts, gems, and stack-aware card tracking
- Live inventory updates for drops, dismantling, selling, and personal-storage transfers
- Current market listings and seven-day observed asking-price summaries
- Optional market contribution; raw packets never leave the device

> **Download:** Get the latest build from [GitHub Releases](https://github.com/bjb2/valecompanion/releases/latest). Do not use GitHub's source-code ZIP as an application installer.

## Install

### Windows

Requirements:

- Windows 10 or 11, x64
- [Npcap](https://npcap.com/#download), installed separately
- Spirit Vale

1. Install Npcap using its default options.
2. Download `ValeCompanion-<version>-windows-x64.exe` from the [latest release](https://github.com/bjb2/valecompanion/releases/latest).
3. Run the downloaded executable as your normal user.
4. Start Spirit Vale. Vale Companion automatically selects the active network adapter and begins observing the game connection.

Npcap is not bundled. Without it, Vale Companion still opens its market browser and settings, but cannot observe inventory or contribute market listings.

The initial release is unsigned, so Windows may show an unknown-publisher warning. Verify that the download came from this repository and compare its SHA-256 checksum with the release notes.

### Linux

Requirements:

- Linux x64
- Spirit Vale running natively or through Proton
- libpcap
- `dumpcap` from Wireshark, recommended, or `CAP_NET_RAW` and `CAP_NET_ADMIN` on the packaged collector runtime

Native `.deb` and `.rpm` packages configure the collector's packet-capture capabilities during installation. Run Vale Companion as your normal user; do not run the desktop application with `sudo`.

The AppImage is portable but cannot retain Linux file capabilities. AppImage users should configure their distribution's `dumpcap` package for non-root capture. On Debian or Ubuntu, install `libpcap0.8` and `wireshark-common`, allow non-superusers to capture when prompted, add your account to the `wireshark` group, then sign out and back in.

## Loot workspace

Vale Companion maintains a live view of the character bag from authoritative server inventory updates. It tracks:

- Equipment and artifacts, including substats, roll percentages, chaos lines, refinement, and favorites
- Gems and refinement levels
- Cards and stack quantities
- Additions and removals caused by drops, sales, dismantling, and personal-storage transfers

A fresh installation includes a focused starter ruleset in [`docs/starter-ruleset.txt`](docs/starter-ruleset.txt). Rules are evaluated from top to bottom; the first matching rule wins. Rules only change presentation and local alerts.

```text
Show "high-roll armor"
  Type Chest, Feet, Head, Legs, Shield
  HighRolls >= 2
  Color #35e87a
  Tag ARMOR
  Highlight mark
  Background fill
  Sound chime

Show "cards"
  Type Card
  Color #d6ad4a
  Tag CARD
  Highlight glow
```

Use the in-app editor to validate rules, manage profiles, choose colors and emphasis, and configure built-in or custom WAV sounds.

## Market workspace

The market browser loads the current public listing snapshot from [market.spiritvalers.com](https://market.spiritvalers.com/). Item inspectors show a rolling seven-day series of hourly observed asking-price quartiles. These are listing observations, not completed-sale history.

Market contribution is enabled on fresh installations and can be disabled under **Settings → Market contribution**. The contributor observes market result traffic already delivered to the game client, normalizes supported listing fields, suppresses duplicates, and uploads bounded batches to the public service.

## Privacy and game boundary

Vale Companion is passive:

- It sends no gameplay RPCs or packets.
- It never clicks, types, moves, equips, buys, sells, dismantles, or picks up items.
- It does not inject code into Spirit Vale or modify the game installation.
- Loot inventory, filters, profiles, sounds, and alert history stay local.
- Raw captured packets are not persisted or uploaded.
- Market contribution sends normalized listing observations, not account credentials, character identity, seller identity, buyer identity, or raw packet payloads.

Capture can be disabled entirely, and market contribution has a separate toggle.

## Data and diagnostics

Settings and structured logs use the operating system's application-data directory. To keep data beside the executable or AppImage, place an empty `.valecompanion-portable` file beside it before launch.

Diagnostics cover application startup, capture selection, packet decoding, and contribution lifecycle events. They exclude raw packets, installation tokens, listing payloads, and player identity.

## Build from source

Prerequisites:

- Windows x64 or Linux x64
- [Bun](https://bun.sh/) 1.4 or newer
- Platform capture dependencies described above

```sh
git clone https://github.com/bjb2/valecompanion.git
cd valecompanion
bun install
bun run check
bun run dev
```

Useful commands:

```text
bun run dev           Build and launch a development window
bun run check         Type-check and run the complete test suite
bun run build         Prepare the Electron application
bun run package:win   Build the Windows portable executable
bun run package:linux Build Linux AppImage, deb, and rpm artifacts
```

## Project layout

```text
src/backend/       Capture lifecycle, local API, persistence, and market contribution
src/core/          Character decoding, inventory projection, and loot rules
src/electron/      Desktop shell and collector supervision
src/frontend/      Companion navigation, settings, and loot workspace
prototype/         Local market UI development server
test/              Decoder, capture, filter, and session contract tests
docs/              Starter ruleset and supporting assets
```

## License

Vale Companion is licensed under the GNU Affero General Public License, version 3 or later. See [LICENSE](LICENSE), [NOTICE](NOTICE), and [SOURCE-OFFER.txt](SOURCE-OFFER.txt).

Spirit Vale is a third-party game. Vale Companion is an independent community project and is not endorsed by or affiliated with the game's developer or publisher.
