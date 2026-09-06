# Security policy

SCALEGO is an early Windows alpha. Security fixes target the current published alpha; older preview builds are not maintained separately.

## Report a vulnerability privately

Use [GitHub private vulnerability reporting](https://github.com/Oceannin/SCALEGO/security/advisories/new). Do not open a public issue with exploit details or private images. Include the version, Windows build, affected component, reproduction steps and impact. Use a synthetic file whenever possible.

If private reporting is unavailable, open an issue asking the maintainer for a private contact **without disclosing the vulnerability**. No response-time SLA is promised for this personal project.

## Scope

Relevant areas include image decoding, native process invocation, renderer/preload IPC, asset URLs, session recovery and file export. Source code uses renderer isolation and bounded input validation; these measures are not a claim that arbitrary hostile files are safe.

The app processes images locally and keeps working copies in the Windows user profile. Do not attach the full profile or `session.json` to public bug reports. Review [file storage](docs/USER_GUIDE.md#ваши-файлы-и-приватность) and [known limits](docs/VALIDATION.md).
