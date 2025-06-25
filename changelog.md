# Changelog

### 2025-06-24
#### Fixed
 - Improved filename sanitization to remove invisible characters (e.g., zero-width spaces) from titles, which previously caused downloads for certain albums to fail. This affects both "Download Album Covers" and "Download This Album's Cover" features.
#### Changed
 - Filename sanitization now collapses multiple consecutive spaces into a single space.

---
### 2025-06-16
#### Added
 - New option on album/track pages to download only that specific cover, using the same folder structure and filename formatting as the "Download All" feature.
#### Fixed
 - (Hopefully) Corrected a major bug in both "Download This Cover" and "Download Album Covers" that caused downloads to fail.
 - Enhanced filename sanitization to handle titles with problematic leading characters (e.g., ellipses), preventing download failures.

---
### 2025-06-15
#### Added
 - New feature to copy file lists from `archive.org` download pages.
 - Changelog
#### Changed
- Improved the popup menu logic to make global actions always visible while keeping page-specific buttons context-sensitive.
- Updated filename sanitization to replace invalid characters with hyphens and collapse multiple hyphens into one.
- Album cover filenames for titles longer than 50 characters are now automatically truncated to prevent errors.

---
### 2025-06-11
#### Added
- Functionality to assist with Streaming Archive.

---
### 2025-06-08
#### Added
- Feature to find and download all album covers from an artist's main page.

#### Changed
- Enhanced the "Copy Titles and URLs" feature.

---
### 2025-06-07
#### Added
- Ability to copy all release links from an artist's page.

#### Changed
- Improved data copying: The extension now fetches data for all releases in the background without needing to have them open in separate tabs.

---
### 2025-06-01
#### Added
- On-page feedback notifications for actions.
- Support for automatically filling email and zip code fields for required downloads.

#### Fixed
- Addressed and fixed issues related to the image downloading feature.

---
### 2025-05-31
#### Added
- Feature to download the artist photo, custom header, and background image from a Bandcamp page.
- Initial project setup, including the popup UI, content scripts, and background logic.