# Chrome Web Store submission kit

Copy-paste text for each field in the Chrome Web Store Developer Dashboard.

## Store listing tab

**Name:** SF Doc Studio

**Summary (132 characters max):**
AI-powered impact analyzer and documentation tool for Salesforce orgs. Bring your own Anthropic API key.

**Category:** Developer Tools

**Language:** English

**Description:**

SF Doc Studio helps Salesforce admins and developers understand an org quickly. Connect to your org, pick an object, and see what depends on it, then let AI explain it in plain English.

WHAT IT DOES
• Lives in Chrome's side panel, so it stays open next to Salesforce while you work
• Quick access tab on the edge of Salesforce pages opens it in one click (can be turned off)
• Object browser: search every object, filtered by Custom, Package, or Standard
• Impact analyzer: pick any field and see the Flows, Apex classes, triggers, validation rules, layouts, and reports that reference it, with a risk score
• AI explanations: one click to document an Apex class, trigger, Flow, or validation rule
• Save sequence: see what runs, and in what order, when a record is saved
• Export: generate a printable documentation report for an object (save as PDF)
• OmniStudio: list and explain OmniScripts, DataRaptors, Integration Procedures, and FlexCards
• Query Editor: run SOQL, see results in a table, export to CSV
• Plain-English queries: type "show open cases older than a year" and AI drafts the query for you
• Data changes: UPDATE, DELETE, INSERT and UPSERT with a preview of every affected record before anything changes, and an extra confirmation in production orgs

HOW IT WORKS
1. Log in to Salesforce in Chrome as usual, then click the extension and press Connect. No extra sign-in, no connected app, no admin setup. Works with production orgs and sandboxes
2. AI explanations are free with no API key: they run on Chrome's built-in on-device AI, or one click opens Claude with the prompt ready. You can optionally add your own Anthropic API key in Settings
3. Browse objects and click "explain" on anything

PRIVACY
• Safe by design: data only changes after you preview the affected records and confirm. Production orgs need an extra typed confirmation
• AI only sees your request and field names, never record data
• No servers, no analytics, no tracking. By default AI runs on your own computer; your data goes to Anthropic only if you paste a prompt into Claude or add your own API key
• Uses the Salesforce login already open in your browser; your session is never stored or sent anywhere except your own org
• An optional API key stays in your browser and can be cleared any time in Settings

REQUIREMENTS
• A Salesforce user with the "API Enabled" permission, logged in to the org in Chrome
• For free on-device AI: Chrome 138+ on Windows, macOS or Linux with about 22 GB free disk space. Otherwise use the free "Open in Claude" option or your own Anthropic API key

SF Doc Studio is an independent project and is not affiliated with or endorsed by Salesforce, Inc. or Anthropic.

**Graphics you need to create:**
- Store icon: 128x128 PNG (public/icons/icon128.png works)
- At least 1 screenshot, 1280x800 or 640x400 (up to 5). Suggested: object browser, impact analysis with risk score, an AI explanation, the exported report
- Small promo tile: 440x280 PNG

## Privacy practices tab

**Single purpose:**
SF Doc Studio helps Salesforce admins and developers understand and work with the org they connect to: it documents objects, fields and automations, shows what depends on a field, explains metadata with AI, and provides a query editor to read and, after explicit confirmation, change records.

**Permission justifications:**

- `cookies`: Used only to read the Salesforce session cookie ("sid") on the user's own *.my.salesforce.com domain when they click Connect, so the extension can call the Salesforce API as the already-logged-in user. No other cookies are read, and the value is sent only to that Salesforce org.
- `sidePanel`: The extension's interface is shown in Chrome's side panel so it stays open next to Salesforce while the user switches tabs. It is opened only when the user clicks the toolbar icon.
- `storage`: Stores the connected org's URL, the user's optional Anthropic API key, and model preference, and the most recently exported report locally so they do not have to re-enter them each time the popup opens.
- Host permission `https://*.salesforce.com/*`: Required to read the session cookie described above and to call the Salesforce REST and Tooling APIs on the user's own org domain (for example acme.my.salesforce.com): to read object, field and automation metadata, to run the user's own queries, and to apply data changes the user previews and confirms in the Query Editor. The subdomain differs for every customer, so a wildcard is needed.
- Content script on `https://*.lightning.force.com/*`, `https://*.my.salesforce.com/*`, `https://*.my.salesforce-setup.com/*`: Adds a small button on the edge of Salesforce pages that opens the extension's side panel when clicked. The script does not read or modify page content, and the button can be disabled in Settings.
- Host permission `https://api.anthropic.com/*`: Used only when the user adds their own Anthropic API key, to send the metadata they choose to analyze to the Anthropic API. By default explanations run on Chrome's built-in on-device AI instead.

**Remote code:** No, I am not using remote code. (All JavaScript is bundled in the package.)

**Data usage - check these boxes:**
- Authentication information (the Salesforce session cookie is read and used in memory; the Anthropic API key is stored locally)
- Website content (Salesforce metadata and, in the Query Editor, records the user queries; metadata may be sent to Anthropic at the user's request)
- Personally identifiable information (only if the user's own queries return records containing it, such as contact names; shown locally and never sent to the developer or to AI)

**Certify all three disclosures:**
- I do not sell or transfer user data to third parties, outside of the approved use cases
- I do not use or transfer user data for purposes unrelated to my item's single purpose
- I do not use or transfer user data to determine creditworthiness or for lending purposes

**Privacy policy URL:**
https://github.com/saikumar-cloud/sf-doc-studio/blob/main/PRIVACY.md

## Distribution tab

- Visibility: Public (or Unlisted for a soft launch: anyone with the link can install)
- Regions: All regions

## Test instructions tab (for the reviewer)

Reviewers cannot sign in without a Salesforce org. Create a free Developer Edition org at developer.salesforce.com/signup, make a dedicated test user, and provide:

- Username / password of the test user
- A note: "Log in at https://login.salesforce.com with the credentials above in a normal Chrome tab. Then click the extension icon (it opens in the side panel) and click Connect to Salesforce. AI features work without an API key: on supported devices they use Chrome's built-in AI, otherwise each explanation offers a "Copy prompt & open Claude" button."
