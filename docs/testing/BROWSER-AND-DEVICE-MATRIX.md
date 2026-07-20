# CareCareer Browser and Device Matrix

## Configured Playwright Projects

### Current (GP-03.3)

| Project  | Browser  | Viewport | CI Tier | Status     |
| -------- | -------- | -------- | ------- | ---------- |
| chromium | Chromium | 1440×900 | PR      | Configured |

### Planned

| Project             | Browser       | Viewport | CI Tier | Status  |
| ------------------- | ------------- | -------- | ------- | ------- |
| chromium-pr         | Chromium      | 1440×900 | PR      | Planned |
| chromium-regression | Chromium      | 1440×900 | Main    | Planned |
| firefox-nightly     | Firefox       | 1440×900 | Nightly | Planned |
| webkit-nightly      | WebKit        | 1440×900 | Nightly | Planned |
| chrome-release      | Chrome        | 1440×900 | Release | Planned |
| edge-release        | Edge          | 1440×900 | Release | Planned |
| mobile-chrome-web   | Chrome Mobile | 375×812  | Nightly | Planned |
| mobile-safari-web   | Safari Mobile | 390×844  | Nightly | Planned |
| tablet-landscape    | Chromium      | 1024×768 | Nightly | Planned |

## Responsive Viewports

| Viewport         | Width × Height | Use Case               |
| ---------------- | -------------- | ---------------------- |
| Desktop          | 1440 × 900     | Primary development    |
| Small laptop     | 1280 × 720     | Common laptop          |
| Tablet landscape | 1024 × 768     | iPad landscape         |
| Tablet portrait  | 768 × 1024     | iPad portrait          |
| Mobile web       | 375 × 812      | iPhone, Android mobile |

## Native Mobile (Future — Appium)

| Platform | Automation | When                      | Status   |
| -------- | ---------- | ------------------------- | -------- |
| iOS      | Appium     | React Native app deployed | Deferred |
| Android  | Appium     | React Native app deployed | Deferred |

Playwright mobile emulation is for responsive web testing only.
It does not replace native device automation for:

- Push notifications
- Biometric authentication
- Background/foreground transitions
- Camera/document upload
- Geofencing
- Offline mode
- Native navigation
