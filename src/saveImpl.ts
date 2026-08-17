import * as cache from "@actions/cache";
import * as core from "@actions/core";
import * as fs from "fs";
import { finished, pipeline } from "node:stream/promises";
import * as path from "path";
import { Operator } from "opendal";
import {
  createTar,
  createTempDirectory,
  getCacheFileName,
  getCompressionMethod,
  listTar,
  resolvePaths,
} from "./cache-utils";
import { State } from "./state";
import { IStateProvider } from "./stateProvider";
import {
  getInputAsArray,
  getInputAsBoolean,
  isGhes,
} from "./utils";

export async function saveImpl(stateProvider: IStateProvider): Promise<void> {
  try {
    const key =
      stateProvider.getState(State.PrimaryKey) ||
      core.getInput("key", { required: true });
    const matchedKey = stateProvider.getState(State.MatchedKey);

    if (matchedKey === key) {
      core.info("Cache was exact key match, not saving");
      return;
    }

    const provider = core.getInput("provider", { required: true });
    const endpoint = core.getInput("endpoint");
    const bucket = core.getInput("bucket", { required: true });
    const root = core.getInput("root");
    const useFallback = getInputAsBoolean("use-fallback");
    const paths = getInputAsArray("path");

    try {
      const op = new Operator(provider, { endpoint, bucket, root });

      const compressionMethod = await getCompressionMethod();
      const cachePaths = await resolvePaths(paths);
      core.debug("Cache Paths:");
      core.debug(`${JSON.stringify(cachePaths)}`);

      const archiveFolder = await createTempDirectory();
      const cacheFileName = getCacheFileName(compressionMethod);
      const archivePath = path.join(archiveFolder, cacheFileName);

      core.debug(`Archive Path: ${archivePath}`);

      await createTar(archiveFolder, cachePaths, compressionMethod);
      if (core.isDebug()) {
        await listTar(archivePath, compressionMethod);
      }

      const object = path.posix.join(key, cacheFileName);

      core.info(
        `Uploading tar to ${provider}. Bucket: ${bucket}, root: ${root}, Object: ${object}`
      );
      const rs = fs.createReadStream(archivePath);
      const w = await op.writer(object);
      const ws = w.createWriteStream();
      await pipeline(rs, ws);
      await finished(rs);
      core.info(`Cache saved to ${provider} successfully`);
    } catch (e) {
      core.info(`Save ${provider} cache failed: ${e}`);
      if (useFallback) {
        if (isGhes()) {
          core.warning("Cache fallback is not supported on Github Enterpise.");
        } else {
          core.info("Saving cache using fallback");
          await cache.saveCache(paths, key);
          core.info("Save cache using fallback successfully");
        }
      } else {
        core.debug("skipped fallback cache");
      }
    }
  } catch (e) {
    core.info("warning: " + e);
  }
}
