# Bible App (Electron)

The Ultimate Offline Bible App for Study & Reflection — built with Electron + React.

## Features

- 🌅 **Daily Verse** — Start each day with Scripture and reflection
- 📖 **Offline Bible** — 6 English translations included: King James Version (KJV), American Standard Version (ASV), World English Bible (WEB), Webster Bible (WBT), Young's Literal Translation (YLT), and Darby Translation (DBY)
- 🔍 **Instant Search** — Find any verse in milliseconds
- 🎨 **Beautiful Themes** — Light, Dark, and Sepia modes
- ✍️ **Journaling** — Write reflections on verses
- 🛡️ **Private** — All data stays on your device

## Installation

### Snap Store (Linux / Ubuntu)
```bash
sudo snap install bible-app
```

### Microsoft Store (Windows)
Search for **Bible App** in the Microsoft Store, or install directly from the Store link once published.

### From Source
```bash
npm install
npm run electron:dev
```

## Build for Distribution

### Linux (Snap)
```bash
npm run electron:build
```

### Windows (AppX / MSIX for Microsoft Store)
```bash
npm run electron:build:win
```

> **Note:** AppX packaging only runs on Windows — it needs `makeappx.exe` from the
> Windows SDK. Building this target on Linux or macOS will fail. Use the
> `build-windows` CI job or a Windows machine.
>
> Store icon and tile assets are committed to the repo:
> - `assets/icon.ico` — multi-resolution app icon (16–256px)
> - `build/appx/` — Store tile assets (StoreLogo, Square150x150, Wide310x150, etc.)

### CI / GitHub Actions
The workflow in `.github/workflows/build.yml` runs two parallel jobs:
- **build-linux** — builds the Snap and publishes to the Snap Store
- **build-windows** — builds the AppX/MSIX and publishes to the Microsoft Store

Both jobs build on every push and pull request. Publishing:
- **Snap:** pushes to `master`/`main` go to the `edge` channel; `v*` tags go to `stable`.
- **Microsoft Store:** only `v*` tags publish (the Store has no edge channel).

To keep Ubuntu and Windows users on the same version, bump `version` in `package.json`, then tag `v<version>`. Both stores receive the same build.

#### Secrets required for publishing

| Secret | Used by |
|---|---|
| `SNAPCRAFT_STORE_CREDENTIALS` | Snap Store publishing |
| `MS_STORE_TENANT_ID` | Microsoft Store publishing (Entra tenant ID) |
| `MS_STORE_SELLER_ID` | Microsoft Store publishing (Partner Center Seller ID) |
| `MS_STORE_CLIENT_ID` | Microsoft Store publishing (Entra app client ID) |
| `MS_STORE_CLIENT_SECRET` | Microsoft Store publishing (Entra app secret) |
| `MS_STORE_PRODUCT_ID` | Microsoft Store publishing (Store ID, e.g. `9NXXXXXXXXXX`) |

The AppX is built unsigned on purpose. The Microsoft Store signs packages it accepts.

## Microsoft Store: first-time setup

The CI publish step uses Microsoft's official Store CLI (`msstore`) and can only push **updates** to an app that is already live. The first submission must be done by hand.

1. Register a Microsoft [Partner Center](https://partner.microsoft.com/dashboard) developer account (one-time fee).
2. Reserve the app name to create the app entry.
3. Open **Product management → Product identity** and copy the three identity values.
4. Replace the placeholders in `package.json` under `build.appx` with those exact values:

   | `package.json` field | Partner Center value |
   |---|---|
   | `identityName` | Package/Identity/Name |
   | `publisher` | Package/Identity/Publisher |
   | `publisherDisplayName` | Package/Properties/PublisherDisplayName |

   These must match exactly or the Store will reject the package.
5. Run `npm run electron:build:win` on Windows (or download the `bible-app-appx` CI artifact) and upload the `.appx` manually for the first submission.
6. On the submission's **Properties** page, paste the privacy policy URL:
   `https://github.com/karaniph/Ubuntu-Bible-App/blob/master/PRIVACY.md`
   (required under [Microsoft Store Policy 10.5.1](https://learn.microsoft.com/en-us/windows/apps/publish/store-policies#105-personal-information) because the app stores journal reflections and highlights).
7. Complete the age rating questionnaire (IARC) — Bible App has no objectionable content, so this should rate as suitable for all ages.
8. After that first submission exists, tagging `v*` will publish updates automatically.

### Store policy compliance notes

- **10.5.1 Personal Information** — the app stores journal reflections/highlights locally in SQLite; nothing is transmitted. See [`PRIVACY.md`](./PRIVACY.md), linked from Settings → About inside the app, and must also be entered as the privacy policy URL in Partner Center.
- **10.1.1 Accurate representation** — app name, icon, and description must match actual functionality (offline Bible reader with 6 English translations).
- **10.4.2 Usability** — app must start promptly and handle errors gracefully; the existing `startupState: 'error'` fallback in `App.tsx` already covers DB init failures.
- **10.8.2 Voluntary donations** — the app has no purchases, subscriptions, or in-app currency. "Buy Me a Coffee" is a voluntary tip that unlocks nothing, so the Microsoft Store purchase API isn't required. Tips go through Buy Me a Coffee (a secure third-party payment provider) in the user's own browser; the app never handles payment details.
  - **At submission:** mention this in Partner Center's **Notes for certification**, e.g. "Optional 'Buy Me a Coffee' tip link opens buymeacoffee.com in the user's browser. Tips are voluntary and unlock no features or content."
  - **Keep it that way:** if a tip ever unlocks anything (features, removing a prompt, extra content), Store policy requires switching to the Microsoft Store in-app purchase API.

### Version parity with the Snap

Both targets build from the same `version` field in `package.json`, so Linux and Windows
users stay on matching versions as long as releases are cut from the same tag.

## Support

[![Buy Me a Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-ffdd00?style=for-the-badge&logo=buy-me-a-coffee&logoColor=black)](https://buymeacoffee.com/karaniph)

## License
MIT
