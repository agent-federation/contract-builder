/**
 * Closure declaration for an executable extension (source adapter or renderer).
 *
 * The core cannot discover an extension's files on its own: a consumer supplies the
 * extension object directly, and the module layout is not part of the extension interface.
 * An extension that participates in build identity therefore declares its own file set and
 * its direct package dependencies here.
 *
 * `root` is the absolute directory the relative `files` paths are resolved against. It is a
 * locator, never hashed: only the declared relative paths and the file bytes enter the
 * closure digest. `dependencies` maps a package name to the exact version the extension is
 * built against; the lockfile remains the authority for the resolved tree.
 */
export interface ExtensionClosureDeclaration {
  root?: string;
  files: string[];
  dependencies?: Record<string, string>;
}
