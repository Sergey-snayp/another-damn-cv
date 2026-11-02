import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { test } from 'node:test';
import ts from 'typescript';

const sourceRoot = resolve(__dirname, '../../src');
const modulesRoot = resolve(sourceRoot, 'modules');
const sharedRoot = resolve(sourceRoot, 'shared');

function filesBelow(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? filesBelow(path) : path.endsWith('.ts') ? [path] : [];
  });
}

/** The compiler AST includes type imports, re-exports, require and import(). */
function importsIn(path: string): string[] {
  const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true);
  const values: string[] = [];
  function visit(node: ts.Node): void {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    )
      values.push(node.moduleSpecifier.text);
    if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      node.moduleReference.expression &&
      ts.isStringLiteral(node.moduleReference.expression)
    )
      values.push(node.moduleReference.expression.text);
    if (
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument) &&
      ts.isStringLiteral(node.argument.literal)
    )
      values.push(node.argument.literal.text);
    if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === 'require'))
    ) {
      const value = node.arguments[0];
      if (value && ts.isStringLiteral(value)) values.push(value.text);
      else values.push('<dynamic module path>');
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return values;
}

function localParts(path: string): string[] {
  return relative(modulesRoot, path).split(sep);
}
function layer(path: string): string | undefined {
  return localParts(path)[1];
}
function target(file: string, specifier: string): string | undefined {
  return specifier.startsWith('.') ? resolve(dirname(file), specifier).replace(/\.ts$/, '') : undefined;
}
function label(path: string): string {
  return relative(sourceRoot, path).split(sep).join('/');
}
function inside(path: string, directory: string): boolean {
  const part = relative(directory, path);
  return part !== '..' && !part.startsWith(`..${sep}`) && !part.startsWith(sep);
}
function publicEntry(path: string): boolean {
  const parts = localParts(path);
  return (
    parts.length === 2 &&
    (parts[1] === 'contracts' || parts[1] === 'http' || /\.(module|tokens)$/.test(parts[1]))
  );
}

test('domain/application imports stay inside their feature and exclude technical layers, including types', () => {
  const files = filesBelow(modulesRoot).filter((path) =>
    ['domain', 'application'].includes(layer(path) ?? ''),
  );
  assert.ok(files.length > 0, 'The architecture check must discover business files.');
  const violations: string[] = [];
  for (const file of files)
    for (const specifier of importsIn(file)) {
      const resolved = target(file, specifier);
      if (!resolved || !inside(resolved, resolve(modulesRoot, localParts(file)[0]))) {
        violations.push(`${label(file)} imports external/technical code: ${specifier}`);
        continue;
      }
      const dependencyLayer = layer(resolved);
      const ownContract = localParts(resolved).length === 2 && localParts(resolved)[1] === 'contracts';
      const allowed =
        layer(file) === 'domain'
          ? dependencyLayer === 'domain'
          : dependencyLayer === 'domain' || dependencyLayer === 'application' || ownContract;
      if (!allowed) violations.push(`${label(file)} imports an outer layer: ${specifier}`);
    }
  assert.deepEqual(violations, []);
});

test('cross-feature imports use public contracts or explicit HTTP/composition entry points', () => {
  const violations: string[] = [];
  for (const file of filesBelow(modulesRoot))
    for (const specifier of importsIn(file)) {
      const resolved = target(file, specifier);
      if (!resolved || !inside(resolved, modulesRoot) || localParts(file)[0] === localParts(resolved)[0])
        continue;
      if (!publicEntry(resolved))
        violations.push(`${label(file)} imports private feature code: ${specifier}`);
    }
  assert.deepEqual(violations, []);
});

test('public business contracts remain independent of HTTP, wiring and external libraries', () => {
  const violations: string[] = [];
  for (const file of filesBelow(modulesRoot).filter(
    (path) => localParts(path).length === 2 && path.endsWith(`${sep}contracts.ts`),
  ))
    for (const specifier of importsIn(file)) {
      const resolved = target(file, specifier);
      if (
        !resolved ||
        !inside(resolved, resolve(modulesRoot, localParts(file)[0])) ||
        !['domain', 'application'].includes(layer(resolved) ?? '')
      )
        violations.push(`${label(file)} imports non-business code: ${specifier}`);
    }
  assert.deepEqual(violations, []);
});

test('shared technical code has no feature imports', () => {
  const violations: string[] = [];
  for (const file of filesBelow(sharedRoot))
    for (const specifier of importsIn(file)) {
      const resolved = target(file, specifier);
      if (resolved && inside(resolved, modulesRoot))
        violations.push(`${label(file)} imports feature code: ${specifier}`);
    }
  assert.deepEqual(violations, []);
});

test('feature adapters and modules use shared infrastructure rather than old source folders', () => {
  const violations: string[] = [];
  for (const file of filesBelow(modulesRoot))
    for (const specifier of importsIn(file)) {
      const resolved = target(file, specifier);
      if (
        resolved &&
        inside(resolved, sourceRoot) &&
        !inside(resolved, modulesRoot) &&
        !inside(resolved, sharedRoot)
      )
        violations.push(`${label(file)} imports code outside modules/shared: ${specifier}`);
    }
  assert.deepEqual(violations, []);
});
