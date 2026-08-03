import * as Crypto from 'crypto';
import { DOMWindow, JSDOM } from 'jsdom';
import { Fn, Functions } from '@evaluator/shared-types';
import {
  persistFunctionsCatalog,
  readFunctionsCatalog,
  setFunctionsCatalogCache,
} from './functions-catalog';
import { resolveFunctionsPath } from './util-functions.token';

/** Nest-only: load or generate via JSDOM, persist under FUNCTIONS_PATH. */
export function getFunctionsCatalog(
  path: string = resolveFunctionsPath()
): Functions {
  const existing = readFunctionsCatalog(path);
  if (existing) {
    return existing;
  }
  const built = buildFunctionsCatalog();
  persistFunctionsCatalog(built, path);
  setFunctionsCatalogCache(built);
  return built;
}

function buildFunctionsCatalog(): Functions {
  const windowJSDOM: DOMWindow = new JSDOM(
    '<!DOCTYPE html><html><body></body></html>',
    { url: 'http://localhost' }
  ).window;
  const document: Document = windowJSDOM?.document;

  const filterFunc = (property: string, obj: object, key: string) => {
    return (
      typeof obj === 'function' &&
      !property.startsWith('_') &&
      !property.toLowerCase().includes(key)
    );
  };
  const createHash = (property: string, salt: string): Fn => {
    const sha256 = Crypto.createHash('sha256')
      .update([salt, property].join('_'))
      .digest('hex');
    return { sha256, property, default: property === 'eval' };
  };

  const string_proto = 'String.prototype';
  const str = 'String';
  const variablesNames = new Map<string, unknown>();
  variablesNames.set('window', windowJSDOM);
  variablesNames.set('document', document);
  variablesNames.set(string_proto, String.prototype);
  variablesNames.set(str, String);
  variablesNames.set('JSON', JSON);
  variablesNames.set('console', console);

  const variables = new Map<string, Fn[]>();
  variablesNames.forEach((object, key) => {
    const obj: object =
      key === 'document' ? Object.getPrototypeOf(object) : (object as object);
    variables.set(
      key,
      Object.getOwnPropertyNames(obj)
        .filter((property: string) => {
          return filterFunc(
            property,
            (object as Record<string, unknown>)[property] as object,
            key
          );
        })
        .sort(Intl.Collator().compare)
        .map((property) => {
          const fn = createHash(property, key);
          fn.prototype = key === string_proto;
          return fn;
        })
    );
  });
  const vars_proto = variables.get(string_proto);
  variables.get(str)?.forEach((func: Fn) => {
    vars_proto && vars_proto.push(func);
  });
  if (vars_proto) {
    vars_proto.sort((a, b) => Intl.Collator().compare(a.property, b.property));
    variables.set(str, vars_proto);
    variables.delete(string_proto);
  }
  return Object.fromEntries(variables) as Functions;
}
