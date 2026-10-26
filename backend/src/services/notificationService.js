/** Single entry point for outbound notifications (folder-structure contract). */
const alertManager = require("../alerts/alertManager");
module.exports = { notify: (sig) => alertManager.send(sig) };
