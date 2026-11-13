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

HOW IT WORKS
1. Log in to Salesforce in Chrome as usual, then click the extension and press Connect. No extra sign-in, no connected app, no admin setup. Works with production orgs and sandboxes
2. Add your own Anthropic API key in Settings (get one at console.anthropic.com)
3. Browse objects and click "explain" on anything

PRIVACY
• Read-only: the extension never changes anything in your org
• No servers, no analytics, no tracking. Your data goes only to your Salesforce org and, when you click an AI action, to Anthropic using your own API key
• Uses the Salesforce login already open in your browser; your session is never stored or sent anywhere except your own org
• Your API key stays in your browser and can be cleared any time in Settings

REQUIREMENTS
• A Salesforce user with the "API Enabled" permission, logged in to the org in Chrome
• An Anthropic API key (usage is billed by Anthropic to your account)

SF Doc Studio is an independent project and is not affiliated with or endorsed by Salesforce, Inc. or Anthropic.

**Graphics you need to create:**
- Store icon: 128x128 PNG (public/icons/icon128.png works)
- At least 1 screenshot, 1280x800 or 640x400 (up to 5). Suggested: object browser, impact analysis with risk score, an AI explanation, the exported report
- Small promo tile: 440x280 PNG

## Privacy practices tab

**Single purpose:**
SF Doc Studio documents and analyzes the metadata of a Salesforce org the user connects to: it lists objects, fields, and automations, shows what depends on a field, and generates AI explanations of that metadata.

**Permission justifications:**

- `cookies`: Used only to read the Salesforce session cookie ("sid") on the user's own *.my.salesforce.com domain when they click Connect, so the extension can call the Salesforce API as the already-logged-in user. No other cookies are read, and the value is sent only to that Salesforce org.
- `sidePanel`: The extension's interface is shown in Chrome's side panel so it stays open next to Salesforce while the user switches tabs. It is opened only when the user clicks the toolbar icon.
- `storage`: Stores the connected org's URL, the user's Anthropic API key, and model preference, and the most recently exported report locally so they do not have to re-enter them each time the popup opens.
- Host permission `https://*.salesforce.com/*`: Required to read the session cookie described above and to call the Salesforce REST and Tooling APIs on the user's own org domain (for example acme.my.salesforce.com) to read object, field, and automation metadata. The subdomain differs for every customer, so a wildcard is needed.
- Content script on `https://*.lightning.force.com/*`, `https://*.my.salesforce.com/*`, `https://*.my.salesforce-setup.com/*`: Adds a small button on the edge of Salesforce pages that opens the extension's side panel when clicked. The script does not read or modify page content, and the button can be disabled in Settings.
- Host permission `https://api.anthropic.com/*`: Required to send the metadata the user chooses to analyze to the Anthropic API, using the user's own API key, to generate explanations.

**Remote code:** No, I am not using remote code. (All JavaScript is bundled in the package.)

**Data usage - check these boxes:**
- Authentication information (the Salesforce session cookie is read and used in memory; the Anthropic API key is stored locally)
- Website content (Salesforce metadata, including Apex source code, is read and sent to Anthropic at the user's request)

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
- A note: "Log in at https://login.salesforce.com with the credentials above in a normal Chrome tab. Then click the extension icon (it opens in the side panel) and click Connect to Salesforce. AI features need an Anthropic API key entered in Settings; browsing objects and impact analysis work without one."
