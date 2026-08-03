import type { Message } from '@evaluator/shared-types';
import { resolveFunctionExpression } from '@evaluator-backend/util-functions';
import template from './eval.template';

const regeXss = /[\w]+\.[\w]+(\.[\w]+)?/;

export function buildEvalTemplate(message: Message): string {
  let tpl = template;
  let fn = '';
  if (message.fn && !message.clearFn) {
    fn = resolveFunctionExpression(message.fn || '');
  } else if (message.clearFn && message.fn && regeXss.test(message.fn)) {
    fn = message.fn;
  }
  if (fn) {
    tpl = template.replace(/window.eval/gm, fn);
  }
  return tpl;
}
