// The whole UI is dimos-react (github.com/jeff-hykin/dimos-react): Desktop's theme followed live, cards, buttons,
// inputs, tables, toasts. Vendored into ./vendor/dimos-react as its library build (`deno task vendor-dimos-react <tag>`; the
// tag is in its VERSION file), so the build needs no network, like ./dim-app.
// deno-lint-ignore no-sloppy-imports -- the .js is the module; its .d.ts beside it is only its types
export * from "./vendor/dimos-react/index.js";
