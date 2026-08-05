export const START = '##START##';
const test = `\`${START}\${ stringify_back(expr, (key, val) => typeof val === 'function' ? val.toString().replace(/\\s+/gm, ' ') : val) }\``;
const template = `
const stringify_back = JSON.stringify;
const console_log_back = console.log;
const eval_back = window.eval;
window.eval = function (...expr) {
  console_log_back(${test});
  return eval_back.call(this, ...expr);
};
`;

export default template;
