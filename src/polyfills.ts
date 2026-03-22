// Polyfills for Chrome 86 (GMod CEF)
// Loaded as entry point before app code to ensure prototypes are patched
// before Monaco or any other module runs.
// Babel's useBuiltIns:"usage" handles most cases, but some dynamic/indirect
// usages in Monaco aren't statically detectable — these explicit imports
// guarantee coverage.

import "core-js/actual/array/at";
import "core-js/actual/array/find-last";
import "core-js/actual/array/find-last-index";
import "core-js/actual/array/to-sorted";
import "core-js/actual/array/to-reversed";
import "core-js/actual/array/to-spliced";
import "core-js/actual/array/with";
import "core-js/actual/string/at";
import "core-js/actual/object/has-own";
import "core-js/actual/structured-clone";
