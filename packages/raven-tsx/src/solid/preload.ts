/**
 * Registers the plugin of `@decky.fx/raven-tsx/solid/plugin` for what Bun runs and tests:
 *
 *     # bunfig.toml
 *     preload = ["@decky.fx/raven-tsx/solid/preload"]
 *
 *     [test]
 *     preload = ["@decky.fx/raven-tsx/solid/preload"]
 */

import { plugin } from "bun";
import { assertSolidVersion, installedVersion } from "./compile";
import { solidPlugin } from "./plugin";

// (before any file of the application runs: one with no JSX, which the plugin does not compile, may
// start it and import Solid later; this is the solid-js that the renderer of the package imports)
assertSolidVersion({ solid: installedVersion("solid-js") });
plugin(solidPlugin());
