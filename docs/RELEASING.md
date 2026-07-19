# Releasing Holy Roof Rides

Two release paths: Android APKs come off a GitHub Action, iOS goes through EAS
Build (works fine from Windows — no Mac required). Both are separate from the
app's self-hosted server, which each church runs on its own.

## Android: APK via GitHub Actions

Every tag matching `v*` (e.g. `v0.1.0`) triggers
[`.github/workflows/android-apk.yml`](../.github/workflows/android-apk.yml),
which builds `app/` into a release APK and attaches it to the GitHub Release
for that tag. You can also run it manually from the Actions tab
(`workflow_dispatch`) to sanity-check a build without cutting a release.

```
git tag v0.1.0
git push origin v0.1.0
```

Wait for the "Android APK" workflow to finish, then grab `app-release.apk`
from the release page.

### Without signing secrets (default)

If the repo has none of the four secrets below set, the workflow still
produces an installable APK — Expo's generated Android project falls back to
its own debug keystore. That's fine for testing and for forks, but every
build is signed with a different, throwaway key, so devices can't upgrade
in place from one debug-signed release to the next (Android refuses to
install an update signed with a different key over an existing install —
you'd have to uninstall first). Set up real signing before handing the APK
to your congregation.

### With a real signing key (one-time setup)

1. **Generate a keystore.** Needs a JDK (`keytool` ships with it) on any OS:

   ```
   keytool -genkeypair -v -storetype PKCS12 \
     -keystore release.keystore \
     -alias holy-roof-rides \
     -keyalg RSA -keysize 2048 -validity 10000
   ```

   You'll be prompted for a keystore password and a key password — save
   both. **Back up `release.keystore` somewhere safe.** If you lose it, you
   can never publish an update that installs over an existing install; you'd
   have to ship under a new package id and everyone reinstalls from scratch.

2. **Base64-encode it**, so it can live in a GitHub secret:

   - Windows (PowerShell): `[Convert]::ToBase64String([IO.File]::ReadAllBytes("release.keystore")) | Set-Content keystore-base64.txt`
   - macOS: `base64 -i release.keystore -o keystore-base64.txt`
   - Linux: `base64 -w0 release.keystore > keystore-base64.txt`

3. **Add four repository secrets** — GitHub repo → Settings → Secrets and
   variables → Actions → New repository secret:

   | Secret | Value |
   |---|---|
   | `ANDROID_KEYSTORE_BASE64` | contents of `keystore-base64.txt` |
   | `ANDROID_KEYSTORE_PASSWORD` | the keystore password from step 1 |
   | `ANDROID_KEY_ALIAS` | `holy-roof-rides` (or whatever alias you used) |
   | `ANDROID_KEY_PASSWORD` | the key password from step 1 |

   Delete `release.keystore` and `keystore-base64.txt` from your machine
   once they're saved somewhere safe (a password manager, an encrypted
   backup) — don't leave them sitting in a repo checkout.

4. Push a tag. Every future build now signs with this key automatically.

## iOS: TestFlight via EAS Build (from Windows)

Apple requires a Mac to build iOS apps locally, but
[EAS Build](https://docs.expo.dev/build/introduction/) builds and signs the
`.ipa` on Expo's macOS infrastructure, so this works from Windows. Config
lives in [`app/eas.json`](../app/eas.json).

You'll need an [Apple Developer Program](https://developer.apple.com/programs/)
membership ($99/year) — required by Apple for TestFlight distribution,
independent of EAS.

```
npm i -g eas-cli
cd app
eas login
eas build --platform ios --profile production
```

`eas build` prompts to create/reuse Apple signing credentials on first run —
follow the prompts (it can generate certificates and provisioning profiles
for you, or you can supply your own). When the build finishes:

```
eas submit --platform ios --latest
```

That uploads the build to App Store Connect. Add internal/external testers
in App Store Connect → TestFlight to let them install it.

Repeat `eas build` + `eas submit` for each release; `eas.json`'s
`production` profile has `autoIncrement` on so the build number bumps
automatically.

## Local development

Run the server and the app separately; the app talks to the server over
plain HTTP + WebSocket, so both just need to be reachable from your device.

### Server

```
cd server
npm install
npm start
```

Listens on `http://0.0.0.0:8787`. On first run (no members yet) it logs a
founding-deacon bootstrap invite code — use that to join as the first
(deacon) account. Set `PORT` to change the port, or `HRR_BOOTSTRAP_CODE` to
pin the bootstrap code instead of getting a random one.

### App

```
cd app
npm install
npx expo start
```

Then open it in Expo Go, an emulator, or a simulator. The app defaults its
server URL to `http://10.0.2.2:8787`, which is the Android emulator's alias
for your dev machine's `localhost` — that works out of the box against a
server started with the command above. For a physical device, an iOS
simulator, or a server on another machine, open the app's Settings screen
and change the server URL to `http://<your-machine's-LAN-IP>:8787`.
