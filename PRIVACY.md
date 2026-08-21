# Privacy Policy — bilibili 标题党过滤器 (AI)

This extension does not collect, transmit, sell, or share any user data. There is no
analytics, no tracking, and no account system.

## What the extension does

The extension reads video titles already visible on bilibili.com pages you're viewing and
scores them locally, in your browser, using a small on-device machine learning model
(XLM-RoBERTa). Titles that score above a threshold are visually hidden. This scoring happens
entirely inside your browser — no page content, titles, browsing history, or any other data
about your activity on bilibili.com is ever sent anywhere.

## What is stored

Your settings (which filters are enabled, thresholds, custom keyword lists, etc.) are stored
locally in your browser via the standard `chrome.storage.local` API. This data never leaves
your device and is not accessible to the extension's developer or any third party.

## Network requests

The extension makes exactly one kind of outbound network request: on first use, it downloads
the machine learning model (~1.1GB, one time) from Hugging Face
(`https://huggingface.co/Penn1357/bilibili-clickbait-xlmr`), a public model-hosting service.
This is a plain file download — no personal data, browsing activity, or identifying
information is sent as part of it. The browser caches the model afterward, so this download
happens once per browser profile, not on every page load.

No other network requests are made by the extension. It does not communicate with any server
operated by the extension's developer, because no such server exists.

## Third-party services

The only third party involved is Hugging Face, solely as a static file host for the model
weights described above. See [Hugging Face's own privacy policy](https://huggingface.co/privacy)
for how they handle requests to their infrastructure.

## Source code

This extension is open source. The full source, including exactly what data each part of the
code touches, is available at
[github.com/HappyWalkers/bilibili-cleaner](https://github.com/HappyWalkers/bilibili-cleaner).

## Changes to this policy

If this policy changes, the updated version will be posted at this same URL and reflected in
the extension's Chrome Web Store listing.

## Contact

Questions or concerns can be filed as an issue on the
[GitHub repository](https://github.com/HappyWalkers/bilibili-cleaner/issues).
