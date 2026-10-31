"use strict";

// .local/upstream-skill-review/.core-build/6e4106fb38458d2bb2bf50b53db74031daabc208/tools/lib/aas-v1/adapters/errors.js
var HostConfigError = class extends Error {
  constructor(code, category = "invalidInput", details = {}) {
    super(code);
    this.name = "HostConfigError";
    this.code = code;
    this.category = category;
    this.details = details;
  }
};
function hostConfigError(code, category, details) {
  return new HostConfigError(code, category, details);
}
module.exports = { HostConfigError, hostConfigError };
