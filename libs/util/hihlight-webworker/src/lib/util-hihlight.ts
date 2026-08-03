import { MessageResult } from '@evaluator/shared-types';
import hljs from 'highlight.js';
import { js as js_beautify } from 'js-beautify';

export const highlight = (message: MessageResult) => {
  if (!message) {
    return message;
  }
  const result = message['result'].slice();
  message['result'] = result.map(element => {
    const elementAsString = typeof element === 'object' ? JSON.stringify(element) : element.toString();
    return hljs.highlightAuto(elementAsString, ['javascript', 'json', 'text']).value;
  });

  message['result_unpack'] = result.map(element => {
    const elementAsString = typeof element === 'object' ? JSON.stringify(element) : element.toString();
    return hljs.highlightAuto(js_beautify(elementAsString), ['javascript', 'json', 'text']).value;
  });
  message['stacktrace_as_string'] = message['stacktrace'] && hljs.highlight(JSON.stringify(message['stacktrace'], null, 2), { language: 'json' }).value;
  return message;
};