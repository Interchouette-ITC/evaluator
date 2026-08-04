'use strict';

/**
 * Page hook: wrap window.eval and log JSON payloads prefixed with START.
 * Mirrors libs/util/puppeteer/src/lib/eval.template.ts
 */
const START = '##START##';
const payload = `\`${START}\${ stringify_back(expr, (key, val) => typeof val === 'function' ? val.toString().replace(/\\s+/gm, ' ') : val) }\``;
const template = `
const stringify_back = JSON.stringify;
const console_log_back = console.log;
const eval_back = window.eval;
window.eval = function (...expr) {
  console_log_back(${payload});
  return eval_back.call(this, ...expr);
};
`;

module.exports = { START, template };
