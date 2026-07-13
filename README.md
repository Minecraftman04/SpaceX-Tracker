# SpaceX Launch Tracker

A responsive, no-build SpaceX launch tracker designed for GitHub Pages. It shows the next scheduled launch, upcoming missions, previous launches, countdowns, search and filters, plus a detailed view for every mission.

## Data source

The site uses the free [Launch Library 2 API](https://thespacedevs.com/llapi) from The Space Devs. No API key is required. The free public service allows a limited number of requests, so the app loads upcoming and previous missions in two requests and caches the response in the browser for 15 minutes.

## Run locally

Because the app requests data from an external API, serve the folder through a local web server rather than opening `index.html` directly.

```bash
python -m http.server 8000
```

Then open `http://localhost:8000`.

## Publish with GitHub Pages

1. Open the repository's **Settings**.
2. Select **Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**.
4. Select the `main` branch and `/ (root)` folder.
5. Save and wait for the Pages deployment to complete.

## Features

- Next launch hero with a live countdown
- Upcoming and previous SpaceX launch lists
- Mission, rocket, orbit, pad, status, weather and probability details
- Search, rocket filtering and sorting
- Links to webcasts, mission information and launch-pad maps when available
- Responsive layout and accessible modal dialog
- Browser caching and useful API error/rate-limit messages

## Notes

Launch schedules can change at short notice. This project is not affiliated with SpaceX. Launch data is provided by The Space Devs.
