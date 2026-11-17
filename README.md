# SF Doc Studio

AI-powered Salesforce documentation and impact analyzer Chrome extension.

## Features
- Object browser with Custom/Package/Standard filters
- Deep AI analysis of Apex classes, Flows, validation rules, and triggers
- Save Sequence visualizer
- Impact analyzer with risk scoring
- Export to PDF
- Query Editor: SOQL with results table and CSV export
- Plain-English queries drafted by AI
- UPDATE, DELETE, INSERT, UPSERT with preview and confirmation (extra confirmation in production)
- OmniStudio support
- No sign-in setup: uses the Salesforce login already open in your browser (production and sandbox)

## Requirements
- A Salesforce user with the "API Enabled" permission, logged in to the org in Chrome
- Nothing else: AI explanations are free. They run on Chrome's built-in on-device AI (Chrome 138+ desktop) or, with one click, in your own Claude account. An Anthropic API key is optional

## Build from source
1. `git clone https://github.com/saikumar-cloud/sf-doc-studio.git && cd sf-doc-studio`
2. `npm install`
3. `npm run build`
4. Open `chrome://extensions`, enable Developer mode, click **Load unpacked**, and select the `dist` folder

## Publish
`npm run package` builds the extension and creates `sf-doc-studio-<version>.zip` with `manifest.json` at the zip root, ready to upload. Listing text and permission justifications are in [STORE_LISTING.md](STORE_LISTING.md).

## Privacy
See [PRIVACY.md](PRIVACY.md). The extension has no backend. It changes data only when you run and confirm a data change in the Query Editor.

## License
MIT - Built by Sai Kumar Pallerla

Not affiliated with or endorsed by Salesforce, Inc. or Anthropic.
