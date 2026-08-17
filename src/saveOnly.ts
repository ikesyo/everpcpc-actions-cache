import * as core from "@actions/core";
import { saveImpl } from "./saveImpl";
import { NullStateProvider } from "./stateProvider";

process.on("uncaughtException", (e) => core.info("warning: " + e.message));

saveImpl(new NullStateProvider());
