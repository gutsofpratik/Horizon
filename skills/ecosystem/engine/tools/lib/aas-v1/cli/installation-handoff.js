"use strict";
var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};

// node_modules/truncate-utf8-bytes/lib/truncate.js
var require_truncate = __commonJS({
  "node_modules/truncate-utf8-bytes/lib/truncate.js"(exports2, module2) {
    "use strict";
    function isHighSurrogate(codePoint) {
      return codePoint >= 55296 && codePoint <= 56319;
    }
    function isLowSurrogate(codePoint) {
      return codePoint >= 56320 && codePoint <= 57343;
    }
    module2.exports = function truncate(getLength, string, byteLength) {
      if (typeof string !== "string") {
        throw new Error("Input must be string");
      }
      var charLength = string.length;
      var curByteLength = 0;
      var codePoint;
      var segment;
      for (var i = 0; i < charLength; i += 1) {
        codePoint = string.charCodeAt(i);
        segment = string[i];
        if (isHighSurrogate(codePoint) && isLowSurrogate(string.charCodeAt(i + 1))) {
          i += 1;
          segment += string[i];
        }
        curByteLength += getLength(segment);
        if (curByteLength === byteLength) {
          return string.slice(0, i + 1);
        } else if (curByteLength > byteLength) {
          return string.slice(0, i - segment.length + 1);
        }
      }
      return string;
    };
  }
});

// node_modules/truncate-utf8-bytes/index.js
var require_truncate_utf8_bytes = __commonJS({
  "node_modules/truncate-utf8-bytes/index.js"(exports2, module2) {
    "use strict";
    var truncate = require_truncate();
    var getLength = Buffer.byteLength.bind(Buffer);
    module2.exports = truncate.bind(null, getLength);
  }
});

// node_modules/sanitize-filename/index.js
var require_sanitize_filename = __commonJS({
  "node_modules/sanitize-filename/index.js"(exports2, module2) {
    "use strict";
    var truncate = require_truncate_utf8_bytes();
    var illegalRe = /[\/\?<>\\:\*\|"]/g;
    var controlRe = /[\x00-\x1f\x80-\x9f]/g;
    var reservedRe = /^\.+$/;
    var windowsReservedRe = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i;
    function replaceTrailingDotsAndSpaces(str, replacement) {
      var end = str.length;
      while (end > 0 && (str[end - 1] === "." || str[end - 1] === " ")) end--;
      return end < str.length ? str.slice(0, end) + replacement : str;
    }
    function sanitize(input, replacement) {
      if (typeof input !== "string") {
        throw new Error("Input must be string");
      }
      var sanitized = input.replace(illegalRe, replacement).replace(controlRe, replacement).replace(reservedRe, replacement).replace(windowsReservedRe, replacement);
      sanitized = replaceTrailingDotsAndSpaces(sanitized, replacement);
      return truncate(sanitized, 255);
    }
    module2.exports = function(input, options) {
      var replacement = options && options.replacement || "";
      var output = sanitize(input, replacement);
      if (replacement === "") {
        return output;
      }
      return sanitize(output, "");
    };
  }
});

// .local/upstream-skill-review/.core-build/6e4106fb38458d2bb2bf50b53db74031daabc208/tools/lib/aas-v1/cli/installation-handoff.js
var path = require("node:path");
var sanitizeFilename = require_sanitize_filename();
function installationHandoff(manifest, destination, shell = "posix") {
  function invalid(code) {
    const error = new Error(code);
    error.code = code;
    error.category = "invalidInput";
    throw error;
  }
  if (!["posix", "powershell"].includes(shell)) invalid("AAS_CLI_SHELL_INVALID");
  if (typeof destination !== "string" || !destination.trim() || destination.length > 1e3 || /^[~-]/.test(destination) || /[\x00-\x1f\x7f]/.test(destination)) {
    invalid("AAS_CLI_INSTALL_DESTINATION_INVALID");
  }
  if (shell === "powershell" && /["&|<>^%!`$()]/.test(destination)) {
    invalid("AAS_CLI_INSTALL_DESTINATION_INVALID");
  }
  const pathApi = shell === "powershell" ? path.win32 : path;
  const resolved = pathApi.resolve(destination);
  const segments = resolved.slice(pathApi.parse(resolved).root.length).split(pathApi.sep).filter(Boolean);
  if (segments.some((segment) => !sanitizeFilename(segment) || sanitizeFilename(segment) !== segment)) {
    invalid("AAS_CLI_INSTALL_DESTINATION_INVALID");
  }
  const ids = manifest.skills.map((skill) => skill.id);
  if (!ids.length) invalid("AAS_CLI_SELECTION_EMPTY");
  if (ids.some((id) => !/^[a-z0-9][a-z0-9._-]*(?:\/[a-z0-9][a-z0-9._-]*)*$/.test(id) || id.split("/").some((part) => part === "." || part === ".."))) invalid("AAS_CLI_INSTALL_ID_INVALID");
  const quote = (value) => shell === "powershell" ? `'${value.split("'").join("''")}'` : `'${value.split("'").join("'\\''")}'`;
  const version = manifest.catalog.version;
  const executable = shell === "powershell" ? "npm.cmd" : "npm";
  const args = [
    "exec",
    "--yes",
    "--ignore-scripts",
    `--package=agentic-awesome-skills@${version}`,
    "--",
    "agentic-awesome-skills",
    "--release",
    version,
    "--path",
    destination,
    "--skills",
    ids.join(","),
    "--dry-run"
  ];
  return {
    executable,
    args,
    command: `${executable} exec --yes --ignore-scripts --package=agentic-awesome-skills@${version} -- agentic-awesome-skills --release ${version} --path ${quote(destination)} --skills ${quote(ids.join(","))} --dry-run`
  };
}
module.exports = { installationHandoff };
