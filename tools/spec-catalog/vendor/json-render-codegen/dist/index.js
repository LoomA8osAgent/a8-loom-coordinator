"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  collectActions: () => collectActions,
  collectStatePaths: () => collectStatePaths,
  collectUsedComponents: () => collectUsedComponents,
  escapeString: () => escapeString,
  serializePropValue: () => serializePropValue,
  serializeProps: () => serializeProps,
  traverseSpec: () => traverseSpec
});
module.exports = __toCommonJS(index_exports);

// src/traverse.ts
function traverseSpec(spec, visitor, startKey) {
  if (!spec || !spec.root) return;
  const rootKey = startKey ?? spec.root;
  const rootElement = spec.elements[rootKey];
  if (!rootElement) return;
  function visit(key, depth, parent) {
    const element = spec.elements[key];
    if (!element) return;
    visitor(element, key, depth, parent);
    if (element.children) {
      for (const childKey of element.children) {
        visit(childKey, depth + 1, element);
      }
    }
    if (element.slots) {
      for (const childKeys of Object.values(element.slots)) {
        for (const childKey of childKeys) {
          visit(childKey, depth + 1, element);
        }
      }
    }
  }
  visit(rootKey, 0, null);
}
function collectUsedComponents(spec) {
  const components = /* @__PURE__ */ new Set();
  traverseSpec(spec, (element, _key) => {
    components.add(element.type);
  });
  return components;
}
function collectStatePaths(spec) {
  const paths = /* @__PURE__ */ new Set();
  traverseSpec(spec, (element, _key) => {
    for (const [propName, propValue] of Object.entries(element.props)) {
      if (typeof propValue === "string") {
        if (propName.endsWith("Path") || propName === "bindPath" || propName === "statePath") {
          paths.add(propValue);
        }
      }
      if (propValue && typeof propValue === "object" && "$state" in propValue && typeof propValue.$state === "string") {
        paths.add(propValue.$state);
      }
    }
    if (element.visible != null && typeof element.visible !== "boolean") {
      collectPathsFromCondition(element.visible, paths);
    }
  });
  return paths;
}
function collectPathFromItem(item, paths) {
  if (typeof item.$state === "string") {
    paths.add(item.$state);
  }
  for (const op of ["eq", "neq", "gt", "gte", "lt", "lte"]) {
    const val = item[op];
    if (val && typeof val === "object" && "$state" in val && typeof val.$state === "string") {
      paths.add(val.$state);
    }
  }
}
function collectPathsFromCondition(condition, paths) {
  if (!condition || typeof condition !== "object") return;
  if (Array.isArray(condition)) {
    for (const item of condition) {
      if (item && typeof item === "object") {
        collectPathFromItem(item, paths);
      }
    }
    return;
  }
  const cond = condition;
  if ("$or" in cond && Array.isArray(cond.$or)) {
    for (const child of cond.$or) {
      collectPathsFromCondition(child, paths);
    }
    return;
  }
  collectPathFromItem(cond, paths);
}
function collectActions(spec) {
  const actions = /* @__PURE__ */ new Set();
  traverseSpec(spec, (element, _key) => {
    for (const propValue of Object.values(element.props)) {
      if (typeof propValue === "string" && propValue.startsWith("action:")) {
        actions.add(propValue.slice(7));
      }
      if (propValue && typeof propValue === "object" && "name" in propValue && typeof propValue.name === "string") {
        actions.add(propValue.name);
      }
    }
    const actionProp = element.props.action;
    if (typeof actionProp === "string") {
      actions.add(actionProp);
    }
    const onBindings = element.on;
    if (onBindings) {
      for (const binding of Object.values(onBindings)) {
        const bindings = Array.isArray(binding) ? binding : [binding];
        for (const b of bindings) {
          if (b && typeof b === "object" && "action" in b && typeof b.action === "string") {
            actions.add(b.action);
          }
        }
      }
    }
  });
  return actions;
}

// src/serialize.ts
var DEFAULT_OPTIONS = {
  quotes: "double",
  indent: 2
};
function escapeString(str, quotes = "double") {
  const quoteChar = quotes === "single" ? "'" : '"';
  const escaped = str.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t");
  if (quotes === "single") {
    return escaped.replace(/'/g, "\\'");
  }
  return escaped.replace(/"/g, '\\"');
}
function serializePropValue(value, options = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const q = opts.quotes === "single" ? "'" : '"';
  if (value === null) {
    return { value: "null", needsBraces: true };
  }
  if (value === void 0) {
    return { value: "undefined", needsBraces: true };
  }
  if (typeof value === "string") {
    return {
      value: `${q}${escapeString(value, opts.quotes)}${q}`,
      needsBraces: false
    };
  }
  if (typeof value === "number") {
    return { value: String(value), needsBraces: true };
  }
  if (typeof value === "boolean") {
    if (value === true) {
      return { value: "true", needsBraces: false };
    }
    return { value: "false", needsBraces: true };
  }
  if (Array.isArray(value)) {
    const items = value.map((v) => serializePropValue(v, opts).value);
    return { value: `[${items.join(", ")}]`, needsBraces: true };
  }
  if (typeof value === "object") {
    if ("$state" in value && typeof value.$state === "string") {
      return {
        value: `{ $state: ${q}${escapeString(value.$state, opts.quotes)}${q} }`,
        needsBraces: true
      };
    }
    const entries = Object.entries(value).filter(([, v]) => v !== void 0).map(([k, v]) => {
      const serialized = serializePropValue(v, opts).value;
      return `${k}: ${serialized}`;
    });
    return { value: `{ ${entries.join(", ")} }`, needsBraces: true };
  }
  return { value: String(value), needsBraces: true };
}
function serializeProps(props, options = {}) {
  const parts = [];
  for (const [key, value] of Object.entries(props)) {
    if (value === void 0 || value === null) continue;
    const serialized = serializePropValue(value, options);
    if (typeof value === "boolean" && value === true) {
      parts.push(key);
    } else if (serialized.needsBraces) {
      parts.push(`${key}={${serialized.value}}`);
    } else {
      parts.push(`${key}=${serialized.value}`);
    }
  }
  return parts.join(" ");
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  collectActions,
  collectStatePaths,
  collectUsedComponents,
  escapeString,
  serializePropValue,
  serializeProps,
  traverseSpec
});
//# sourceMappingURL=index.js.map