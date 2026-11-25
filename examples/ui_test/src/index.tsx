/**
 * The sign-in form that `login.test.tsx` tests, as an application: `bun run dev` shows it, and
 * `bun test` drives it headless. The port of `examples/ui_test` of Raven, where the test is a
 * program of C; here it is a test of Bun.
 */

import { runApp } from "@decky.fx/raven-tsx/react";
import { Login } from "./Login";

await runApp(<Login />, { Title: "Sign in", Width: 340, Height: 250 });
