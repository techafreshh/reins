import { defineEventHandler, setResponseHeader } from "h3";

const SKELETON_VERSION = "0.1.0";

const PLACEHOLDER_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Reins skeleton</title>
</head>
<body>
<main>
<h1>Reins skeleton live</h1>
<p>Placeholder jobs page. skeleton v${SKELETON_VERSION}</p>
<nav><a href="/home">Home</a> <a href="/chat">Chat</a></nav>
</main>
</body>
</html>
`;

// The framework SSR shell never renders route markup (impersonal cached
// skeleton), so the probe-visible placeholder is served statically here.
export default defineEventHandler((event) => {
  setResponseHeader(event, "content-type", "text/html; charset=utf-8");
  return PLACEHOLDER_HTML;
});
