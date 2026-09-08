// Overwritten at container start by entrypoint.sh, which writes every NEXT_PUBLIC_ variable it can
// see. Committed empty on purpose.
//
// `getApiUrl()` reads this before `process.env`, so a value here wins over everything, including
// the NEXT_PUBLIC_API_URL the README and the quickstart tell you to set. It used to hold
// "http://localhost:5006", which meant local development always talked to 5006 and the documented
// environment variable silently did nothing.
window._env_ = {};
