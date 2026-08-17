import * as core from "@actions/core";
import { State } from "./state";

export interface IStateProvider {
  setState(key: State, value: string): void;
  setFallbackMatchedKey(value: string): void;
  getState(key: State): string;
}

export class StateProvider implements IStateProvider {
  setState(key: State, value: string): void {
    core.saveState(key, value);
  }

  setFallbackMatchedKey(_value: string): void {
    // Keep fallback matches out of action state so the combined action
    // can backfill cloud storage during its post-save phase.
  }

  getState(key: State): string {
    return core.getState(key);
  }
}

export class NullStateProvider implements IStateProvider {
  private readonly stateToOutput = new Map<State, string>([
    [State.PrimaryKey, "cache-primary-key"],
    [State.MatchedKey, "cache-matched-key"],
  ]);

  setState(key: State, value: string): void {
    const output = this.stateToOutput.get(key);
    if (output) {
      core.setOutput(output, value);
    }
  }

  setFallbackMatchedKey(value: string): void {
    core.setOutput("cache-matched-key", value);
  }

  getState(_key: State): string {
    return "";
  }
}
