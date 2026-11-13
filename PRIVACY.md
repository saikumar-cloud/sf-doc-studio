# Privacy Policy - SF Doc Studio

Last updated: November 13, 2026

SF Doc Studio is a Chrome extension that documents and analyzes the configuration (metadata) of a Salesforce org you connect it to. This policy explains what the extension handles and where it goes.

## Summary

- The developer of SF Doc Studio does not collect, receive, store, or sell any of your data. There is no SF Doc Studio server, no analytics, and no tracking.
- The extension talks to only two services: **your Salesforce org** and the **Anthropic API** (using an API key you provide).
- The extension is read-only. It never creates, changes, or deletes anything in Salesforce.

## How sign-in works

SF Doc Studio does not ask for your Salesforce password. When you click **Connect**, it reads the Salesforce session cookie (`sid`) that your browser already holds for the org you are logged in to, and uses it to call that org's API as you, with your existing permissions. The session value is used only for requests to your own Salesforce org. It is kept in memory while the panel is open, is not saved to disk by the extension, and is never sent to Anthropic, the developer, or anyone else.

## What the extension accesses

**From your Salesforce org (read-only, via the Salesforce REST and Tooling APIs):**
- Object and field definitions (names, labels, types)
- Automation metadata: Apex class and trigger source code, Flow definitions, validation rule formulas, workflow rule names, page layout, report and email template names
- OmniStudio component names and settings, if present

The extension reads metadata (how your org is configured). It does not read your business records such as accounts, contacts, or opportunities.

## What is sent to Anthropic

When you click an AI action (for example "Explain with AI", "explain" on a component, "Generate Save Sequence", or "Export"), the extension sends the metadata needed for that request to the Anthropic API (`api.anthropic.com`) so the model can write the explanation. Depending on the action this can include:

- Object, field, and component names and counts
- The full source code of the Apex class or trigger you selected
- The structure of the Flow you selected
- The formula and error message of the validation rule you selected

Nothing is sent to Anthropic until you trigger an AI action. Requests are made with **your own Anthropic API key** and are governed by Anthropic's terms and privacy policy (https://www.anthropic.com/legal/privacy). If your organization restricts sharing source code or configuration with third-party AI services, check that policy before using the AI features.

## What is stored on your device

Stored in Chrome's local extension storage (`chrome.storage.local`) on your computer only:

- The URL of the Salesforce org you last connected to
- Your Anthropic API key
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
