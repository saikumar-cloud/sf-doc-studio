# SF Doc Studio

AI-powered Salesforce documentation and impact analyzer Chrome extension.

## Features
- Object browser with Custom/Package/Standard filters
- Deep AI analysis of Apex classes, Flows, validation rules, and triggers
- Save Sequence visualizer
- Impact analyzer with risk scoring
- Export to PDF
- OmniStudio support
- No sign-in setup: uses the Salesforce login already open in your browser (production and sandbox)

## Requirements
- A Salesforce user with the "API Enabled" permission, logged in to the org in Chrome
- An Anthropic API key (console.anthropic.com)

## Build from source
1. `git clone https://github.com/saikumar-cloud/sf-doc-studio.git && cd sf-doc-studio`
2. `npm install`
3. `npm run build`
4. Open `chrome://extensions`, enable Developer mode, click **Load unpacked**, and select the `dist` folder

## Publish
`npm run package` builds the extension and creates `sf-doc-studio-<version>.zip` with `manifest.json` at the zip root, ready to upload. Listing text and permission justifications are in [STORE_LISTING.md](STORE_LISTING.md).

## Privacy
See [PRIVACY.md](PRIVACY.md). The extension is read-only and has no backend.

## License
MIT - Built by Sai Kumar Pallerla

Not affiliated with or endorsed by Salesforce, Inc. or Anthropic.
