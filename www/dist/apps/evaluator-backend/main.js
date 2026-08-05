var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __decorateClass = (decorators, target, key, kind) => {
  var result = kind > 1 ? void 0 : kind ? __getOwnPropDesc(target, key) : target;
  for (var i = decorators.length - 1, decorator; i >= 0; i--)
    if (decorator = decorators[i])
      result = (kind ? decorator(target, key, result) : decorator(result)) || result;
  if (kind && result) __defProp(target, key, result);
  return result;
};
var __decorateParam = (index, decorator) => (target, key) => decorator(target, key, index);

// apps/evaluator-backend/src/main.ts
var import_common6 = require("@nestjs/common");
var import_core = require("@nestjs/core");

// apps/evaluator-backend/src/app/app.module.ts
var import_common5 = require("@nestjs/common");

// apps/evaluator-backend/src/functions/functions.controller.ts
var import_common3 = require("@nestjs/common");

// apps/evaluator-backend/src/functions/functions.service.ts
var import_common2 = require("@nestjs/common");

// libs/util/functions/src/lib/util-functions.service.ts
var import_common = require("@nestjs/common");

// libs/util/functions/src/lib/functions-catalog-build.ts
var Crypto = __toESM(require("crypto"));
var import_jsdom = require("jsdom");

// libs/util/functions/src/lib/functions-catalog.ts
var import_fs2 = require("fs");

// libs/util/functions/src/lib/util-functions.token.ts
var import_path = require("path");
var import_fs = require("fs");
function resolveFunctionsPath() {
  const fromEnv = process.env["FUNCTIONS_PATH"]?.trim();
  if (fromEnv) {
    return (0, import_path.resolve)(fromEnv);
  }
  const sqlite = process.env["SQLITE_PATH"]?.trim();
  if (sqlite) {
    return (0, import_path.join)((0, import_path.dirname)((0, import_path.resolve)(sqlite)), "functions.json");
  }
  return (0, import_path.resolve)(process.cwd(), "db", "functions.json");
}
function ensureFunctionsDir(path = resolveFunctionsPath()) {
  (0, import_fs.mkdirSync)((0, import_path.dirname)(path), { recursive: true });
}
var functions_path = resolveFunctionsPath();

// libs/util/functions/src/lib/functions-catalog.ts
var memoryCache = null;
function readFunctionsCatalog(path = resolveFunctionsPath()) {
  if (memoryCache) {
    return memoryCache;
  }
  if (!(0, import_fs2.existsSync)(path)) {
    return null;
  }
  try {
    memoryCache = JSON.parse((0, import_fs2.readFileSync)(path, "utf8"));
    return memoryCache;
  } catch (err) {
    console.error("functions catalog parse failed", path, err);
    return null;
  }
}
function setFunctionsCatalogCache(entries) {
  memoryCache = entries;
}
function persistFunctionsCatalog(entries, path = resolveFunctionsPath()) {
  try {
    ensureFunctionsDir(path);
    (0, import_fs2.writeFileSync)(path, JSON.stringify(entries));
    memoryCache = entries;
  } catch (err) {
    console.error("functions catalog write failed", path, err);
  }
}

// libs/util/functions/src/lib/functions-catalog-build.ts
function getFunctionsCatalog(path = resolveFunctionsPath()) {
  const existing = readFunctionsCatalog(path);
  if (existing) {
    return existing;
  }
  const built = buildFunctionsCatalog();
  persistFunctionsCatalog(built, path);
  setFunctionsCatalogCache(built);
  return built;
}
function buildFunctionsCatalog() {
  const windowJSDOM = new import_jsdom.JSDOM(
    "<!DOCTYPE html><html><body></body></html>",
    { url: "http://localhost" }
  ).window;
  const document = windowJSDOM?.document;
  const filterFunc = (property, obj, key) => {
    return typeof obj === "function" && !property.startsWith("_") && !property.toLowerCase().includes(key);
  };
  const createHash2 = (property, salt) => {
    const sha256 = Crypto.createHash("sha256").update([salt, property].join("_")).digest("hex");
    return { sha256, property, default: property === "eval" };
  };
  const string_proto = "String.prototype";
  const str = "String";
  const variablesNames = /* @__PURE__ */ new Map();
  variablesNames.set("window", windowJSDOM);
  variablesNames.set("document", document);
  variablesNames.set(string_proto, String.prototype);
  variablesNames.set(str, String);
  variablesNames.set("JSON", JSON);
  variablesNames.set("console", console);
  const variables = /* @__PURE__ */ new Map();
  variablesNames.forEach((object, key) => {
    const obj = key === "document" ? Object.getPrototypeOf(object) : object;
    variables.set(
      key,
      Object.getOwnPropertyNames(obj).filter((property) => {
        return filterFunc(
          property,
          object[property],
          key
        );
      }).sort(Intl.Collator().compare).map((property) => {
        const fn = createHash2(property, key);
        fn.prototype = key === string_proto;
        return fn;
      })
    );
  });
  const vars_proto = variables.get(string_proto);
  variables.get(str)?.forEach((func) => {
    vars_proto && vars_proto.push(func);
  });
  if (vars_proto) {
    vars_proto.sort((a, b) => Intl.Collator().compare(a.property, b.property));
    variables.set(str, vars_proto);
    variables.delete(string_proto);
  }
  return Object.fromEntries(variables);
}

// libs/util/functions/src/lib/util-functions.service.ts
var UtilFunctionsService = class {
  constructor(path) {
    this.path = path;
  }
  path;
  onModuleInit() {
    this.getFunctions();
  }
  getFunctions() {
    return getFunctionsCatalog(this.path);
  }
};
UtilFunctionsService = __decorateClass([
  (0, import_common.Injectable)(),
  __decorateParam(0, (0, import_common.Inject)("FUNCTIONS_PATH"))
], UtilFunctionsService);

// apps/evaluator-backend/src/functions/functions.service.ts
var FunctionsService = class {
  constructor(utilFunctionsService) {
    this.utilFunctionsService = utilFunctionsService;
  }
  utilFunctionsService;
  findAll() {
    return this.utilFunctionsService.getFunctions();
  }
};
FunctionsService = __decorateClass([
  (0, import_common2.Injectable)(),
  __decorateParam(0, (0, import_common2.Inject)(UtilFunctionsService))
], FunctionsService);

// apps/evaluator-backend/src/functions/functions.controller.ts
var FunctionsController = class {
  constructor(functionsService) {
    this.functionsService = functionsService;
  }
  functionsService;
  findAll() {
    return this.functionsService.findAll();
  }
};
__decorateClass([
  (0, import_common3.Get)()
], FunctionsController.prototype, "findAll", 1);
FunctionsController = __decorateClass([
  (0, import_common3.Controller)("functions"),
  __decorateParam(0, (0, import_common3.Inject)(FunctionsService))
], FunctionsController);

// apps/evaluator-backend/src/app/app.controller.ts
var import_common4 = require("@nestjs/common");
var AppController = class {
};
AppController = __decorateClass([
  (0, import_common4.Controller)()
], AppController);

// apps/evaluator-backend/src/app/app.module.ts
var AppModule = class {
};
AppModule = __decorateClass([
  (0, import_common5.Module)({
    imports: [],
    controllers: [AppController, FunctionsController],
    providers: [
      FunctionsService,
      UtilFunctionsService,
      {
        provide: "FUNCTIONS_PATH",
        useFactory: () => resolveFunctionsPath()
      }
    ]
  })
], AppModule);

// apps/evaluator-backend/src/main.ts
async function bootstrap() {
  const app = await import_core.NestFactory.create(AppModule);
  const globalPrefix = "api";
  app.setGlobalPrefix(globalPrefix);
  const port = 3333;
  await app.listen(port, "0.0.0.0");
  import_common6.Logger.log(
    `\u{1F680} Application is running on: http://localhost:${port}/${globalPrefix}`
  );
}
bootstrap();
