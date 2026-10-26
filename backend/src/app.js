/** Express app factory — routes + middleware (folder-structure contract). */
const express = require("express");
const cors = require("cors");
const buildRoutes = require("./api/routes");
const errorHandler = require("./middleware/errorHandler");
const apiKeyGate = require("./middleware/auth");

function createApp(io, origin) {
  const app = express();
  app.use(cors({ origin }));
  app.use(express.json());
  app.use("/api", apiKeyGate, buildRoutes(io));
  return { app, finalize: () => app.use(errorHandler) };
}
module.exports = { createApp };
