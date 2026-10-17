# Third-party notices

The MIT license at the repository root covers original OpenClaude code. It does
not replace licenses for third-party software, fonts, skills, plugins, models or
services. OpenClaude is independent of Anthropic and does not include its private
system prompts or restricted desktop skill packs.

## Source and desktop releases

- React, Vite, Fastify, Tauri, llama-cpp-python and their dependencies retain their
  original licenses and copyright notices. Exact JavaScript dependency versions
  and license identifiers are recorded in `package-lock.json` and in the desktop
  package's `backend/licenses/npm-inventory.json`.
- Desktop packages include original license/notice files under
  `backend/licenses/npm/`, and preserve license files in the bundled production
  packages. Packages with source-availability requirements are accompanied by
  corresponding-source archives or source links in that directory.
- Node.js is distributed under its own license and third-party notices, copied
  verbatim to `backend/node/LICENSE`.
- The bundled CPython distribution is provided by python-build-standalone. Its
  original Python and bundled dependency licenses are preserved in
  `backend/python/`. Exact download URLs and SHA-256 checksums are pinned in
  `scripts/release/inputs.json` and the release's runtime manifest.
- DM Sans and Lora fonts retain their SIL Open Font License notices. Font files
  are not licensed under the application's MIT license.
- Mermaid and its diagram dependencies retain their original licenses. Any ELK
  dependency is covered by the Eclipse Public License; corresponding-source
  information accompanies the release notices. No claim is made that an
  upstream dependency is authored by OpenClaude.
- Windows desktop functionality uses Microsoft WebView2 and Windows APIs.
  WebView2 Runtime is Microsoft software subject to Microsoft's terms, not the
  application's MIT license. The dependency helper installs the official runtime
  when requested; it does not bypass license or administrator requirements.

## Optional downloads and services

Model weights are not included. Each downloaded model has its own license,
hardware requirements and supported input formats. CUDA, NVIDIA drivers, Docker
Desktop and downloaded inference wheels have their own terms. The installer
does not redistribute NVIDIA drivers or private model files.

Docker images are built from the included Dockerfile and download upstream
packages. Those packages retain their own licenses. Docker Desktop installation
is optional and requires acceptance of Docker's license; commercial subscription
requirements may apply.

Only original OpenClaude skills are bundled in this application repository.
Skills installed from OpenClaude-Skills include their upstream license file.
Official Claude plugins are retrieved from their official upstream repository,
not mirrored as OpenClaude-owned software. Installing a skill or extension does
not change its license or grant permissions beyond the application's controls.

See the pinned manifests and upstream license files for the controlling terms.
