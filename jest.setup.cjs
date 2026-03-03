if (typeof global.jest === "undefined") {
  const { jest } = require("@jest/globals");
  global.jest = jest;
}
