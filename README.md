# WebAR Title Screen (split files)
This package contains the Title Screen implementation for your WebAR project.

## Files
- index.html
- css/styles.css
- js/main.js
- js/title-screen.js
- js/three-vrm-loader.js
- assets/ (place your Aorin.vrm, Aorin.usdz, title_bg.png, bubble.png, title_text.png here)

## Usage
1. Place your assets (Aorin.vrm etc.) into the `assets/` folder.
2. Deploy this folder to GitHub Pages (or any static host).
3. Open `index.html`. The title screen preloads the VRM and shows a rotating model.
4. Clicking Start will (in future) navigate to the load screen. Currently it shows an alert.

## Notes
- model-viewer / Quick Look and WebXR support will be implemented in the load and AR screens.
- If you need a ZIP with the ready-to-deploy files, it's included in this archive.

## USDZ MIME note
GitHub Pages does not allow custom response headers. If iOS Chrome fails to open USDZ, host the USDZ on a service that returns `Content-Type: model/vnd.usdz+zip`.
