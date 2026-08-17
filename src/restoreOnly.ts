import * as core from "@actions/core";
import { restoreImpl } from "./restoreImpl";
import { NullStateProvider } from "./stateProvider";

process.on("uncaughtException", (e) => core.info("warning: " + e.message));

restoreImpl(new NullStateProvider());
