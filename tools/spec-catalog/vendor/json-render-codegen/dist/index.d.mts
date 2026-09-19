import { Spec, UIElement } from '@json-render/core';

/**
 * Visitor function for spec traversal
 */
interface TreeVisitor {
    (element: UIElement, key: string, depth: number, parent: UIElement | null): void;
}
/**
 * Traverse a UI spec depth-first
 */
declare function traverseSpec(spec: Spec, visitor: TreeVisitor, startKey?: string): void;
/**
 * Collect all unique component types used in a spec
 */
declare function collectUsedComponents(spec: Spec): Set<string>;
/**
 * Collect all state paths referenced in a spec
 */
declare function collectStatePaths(spec: Spec): Set<string>;
/**
 * Collect all action names used in a spec
 */
declare function collectActions(spec: Spec): Set<string>;

/**
 * Options for serialization
 */
interface SerializeOptions {
    /** Quote style for strings */
    quotes?: "single" | "double";
    /** Indent for objects/arrays */
    indent?: number;
}
/**
 * Escape a string for use in code
 */
declare function escapeString(str: string, quotes?: "single" | "double"): string;
/**
 * Serialize a single prop value to a code string
 *
 * @returns Object with `value` (the serialized string) and `needsBraces` (whether JSX needs {})
 */
declare function serializePropValue(value: unknown, options?: SerializeOptions): {
    value: string;
    needsBraces: boolean;
};
/**
 * Serialize props object to JSX attributes string
 */
declare function serializeProps(props: Record<string, unknown>, options?: SerializeOptions): string;

/**
 * Represents a generated file
 */
interface GeneratedFile {
    /** File path relative to project root */
    path: string;
    /** File contents */
    content: string;
}
/**
 * Interface for code generators
 */
interface CodeGenerator {
    /** Generate files from a UI spec */
    generate(spec: Spec): GeneratedFile[];
}

export { type CodeGenerator, type GeneratedFile, type SerializeOptions, type TreeVisitor, collectActions, collectStatePaths, collectUsedComponents, escapeString, serializePropValue, serializeProps, traverseSpec };
