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
import { applicationFolder, assertSolidVersion, installedVersion } from "./compile";
import { solidPlugin } from "./plugin";

// (before any file of the application runs: one with no JSX, which the plugin does not compile, may
// start it and import Solid later. Both the solid-js that the renderer of the package imports and
// the one of the application's entry, which may be another copy)
assertSolidVersion({ solid: installedVersion("solid-js") });
const application = applicationFolder(Bun.main, process.cwd());
assertSolidVersion({ solid: installedVersion("solid-js", (name) => Bun.resolveSync(name, application)) });
plugin(solidPlugin());
