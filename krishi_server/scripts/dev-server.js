// Reserve the common 5000 port for other local tools by default.
// Set KB_PORT before starting this script when a different free port is needed.
process.env.PORT = process.env.KB_PORT || process.env.PORT || "5001";

await import("../src/server.js");
