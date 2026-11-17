# Privacy Policy - SF Doc Studio

Last updated: November 17, 2026 (version 1.2.0)

SF Doc Studio is a Chrome extension that documents and analyzes the configuration (metadata) of a Salesforce org you connect it to. This policy explains what the extension handles and where it goes.

## Summary

- The developer of SF Doc Studio does not collect, receive, store, or sell any of your data. There is no SF Doc Studio server, no analytics, and no tracking.
- The extension talks to your **Salesforce org**. AI explanations run on **Chrome's built-in on-device AI** by default, so your metadata stays on your computer. Only if you choose to, they go to **Claude** (by pasting a prompt into your own Claude account) or to the **Anthropic API** (if you add your own API key).
- The extension only changes Salesforce data when you run an UPDATE, DELETE, INSERT or UPSERT statement in the Query Editor **and** confirm it after seeing a preview. Everything else is read-only.

## How sign-in works

SF Doc Studio does not ask for your Salesforce password. When you click **Connect**, it reads the Salesforce session cookie (`sid`) that your browser already holds for the org you are logged in to, and uses it to call that org's API as you, with your existing permissions. The session value is used only for requests to your own Salesforce org. It is kept in memory while the panel is open, is not saved to disk by the extension, and is never sent to Anthropic, the developer, or anyone else.

## What the extension accesses

**From your Salesforce org (via the Salesforce REST and Tooling APIs):**
- Object and field definitions (names, labels, types)
- Automation metadata: Apex class and trigger source code, Flow definitions, validation rule formulas, workflow rule names, page layout, report and email template names
- OmniStudio component names and settings, if present

The documentation and impact features read metadata (how your org is configured), not your business records.

**Query Editor (only when you use it):**
- Runs the SOQL queries you write or approve, and shows the matching records (for example accounts or contacts) in the panel. Results stay on your computer; a CSV export is saved only to your own device.
- Runs data changes (UPDATE, DELETE, INSERT, UPSERT) against your org only after you preview the affected records and confirm. In production orgs you must also type the number of records.
- Insert, Update, Delete and Upsert forms: the values and CSV you enter are sent only to your own Salesforce org, after you preview and confirm.
- Reads the org name and type, to warn you when you are working in production.

## Plain-English queries

When you ask for a query in plain English, the AI receives your request text plus the names, labels and picklist values of the fields on the objects you mention. It never receives record data. The AI only drafts a statement into the editor; nothing runs until you click Run, and data changes still need your confirmation.

## Where AI explanations are processed

SF Doc Studio picks one of three ways to answer an AI action (explanations and plain-English queries):

1. **On-device (default, free).** If your Chrome supports its built-in AI (Gemini Nano), the explanation is generated on your own computer. The metadata is not sent anywhere.
2. **Open in Claude (free, only when you click it).** If on-device AI is not available, or an item is too long for it, the extension offers a "Copy prompt & open Claude" button. Clicking it copies the prompt to your clipboard and opens claude.ai in a new tab. Nothing is sent unless you paste the prompt into Claude yourself; after that it is handled under your own Claude account and Anthropic's terms.
3. **Your Anthropic API key (optional).** If you add your own key in Settings, the extension sends the prompt directly to the Anthropic API, as described below.

## What is sent to Anthropic (only options 2 and 3)

When you click an AI action (for example "Explain with AI", "explain" on a component, "Generate Save Sequence", or "Export"), the extension sends the metadata needed for that request to the Anthropic API (`api.anthropic.com`) so the model can write the explanation. Depending on the action this can include:

- Object, field, and component names and counts
- The full source code of the Apex class or trigger you selected
- The structure of the Flow you selected
- The formula and error message of the validation rule you selected

Nothing is sent to Anthropic unless you paste a prompt into Claude yourself, or have added an API key and trigger an AI action. API requests are made with **your own Anthropic API key** and are governed by Anthropic's terms and privacy policy (https://www.anthropic.com/legal/privacy). If your organization restricts sharing source code or configuration with third-party AI services, check that policy before using the AI features.

## What is stored on your device

Stored in Chrome's local extension storage (`chrome.storage.local`) on your computer only:

- The URL of the Salesforce org you last connected to
- Your Anthropic API key, if you add one
- Your optional model preference and whether the quick access button is shown
- The most recent report you exported, so the report tab can display it

This data is not synced and is never transmitted to the developer. To delete it, open **Settings > Disconnect & Clear All Data**, or uninstall the extension.

## Permissions

- `cookies` - to read the Salesforce session cookie for the org you are already logged in to, so you do not have to sign in again
- `sidePanel` - to show the extension in Chrome's side panel so it stays open while you switch tabs
- `storage` - to keep the items listed above on your device
- Access to `*.salesforce.com` - to read that session cookie and to read metadata from your org
- Access to `api.anthropic.com` - to request AI explanations
- A small script on Salesforce pages (`*.lightning.force.com`, `*.my.salesforce.com`, `*.my.salesforce-setup.com`) - only to draw the quick access button that opens the side panel. It does not read or change page content, and the button can be turned off in Settings

## Limited Use

The use of information received from Salesforce and Chrome APIs adheres to the Chrome Web Store User Data Policy, including the Limited Use requirements. Data is used only to provide the extension's user-facing features, is not sold, is not used for advertising, and is not read by humans other than you.

## Changes

Updates to this policy will be published at this URL with a new "Last updated" date.

## Contact

saikumar.psk48@gmail.com

SF Doc Studio is an independent project and is not affiliated with or endorsed by Salesforce, Inc. or Anthropic.
