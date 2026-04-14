// Ambient types for side-effect CSS imports. tsgo is stricter than tsc and
// requires an explicit declaration for `import "x.css"` statements. This
// package imports stylesheets transitively via `@grmkris/bull-viewer-ui`.
declare module "*.css";
