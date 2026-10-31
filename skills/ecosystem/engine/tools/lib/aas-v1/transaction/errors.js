"use strict";

// .local/upstream-skill-review/.core-build/6e4106fb38458d2bb2bf50b53db74031daabc208/tools/lib/aas-v1/transaction/errors.js
function transactionError(code, category, details = {}, cause) {
  const error = new Error(code, cause ? { cause } : void 0);
  error.code = code;
  error.category = category;
  error.details = details;
  return error;
}
module.exports = { transactionError };
