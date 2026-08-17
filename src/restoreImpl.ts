import * as cache from "@actions/cache";
import * as core from "@actions/core";
import * as fs from "fs";
import { finished, pipeline } from "node:stream/promises";
import * as path from "path";
import { Operator } from "opendal";
import {
  createTempDirectory,
  extractTar,
  getCacheFileName,
  getCompressionMethod,
  listTar,
} from "./cache-utils";
import { State } from "./state";
import { IStateProvider } from "./stateProvider";
import {
  findObject,
  formatSize,
  getInputAsArray,
  getInputAsBoolean,
  isGhes,
  setCacheHitOutput,
} from "./utils";

export async function restoreImpl(stateProvider: IStateProvider): Promise<void> {
  try {
    const provider = core.getInput("provider", { required: true });
    const endpoint = core.getInput("endpoint");
    const bucket = core.getInput("bucket", { required: true });
    const root = core.getInput("root");
    const key = core.getInput("key", { required: true });
    const useFallback = getInputAsBoolean("use-fallback");
    const paths = getInputAsArray("path");
    const restoreKeys = getInputAsArray("restore-keys");

    stateProvider.setState(State.PrimaryKey, key);

    try {
      const op = new Operator(provider, { endpoint, bucket, root });

      const compressionMethod = await getCompressionMethod();
      const cacheFileName = getCacheFileName(compressionMethod);
      const archivePath = path.join(
        await createTempDirectory(),
        cacheFileName
      );

      const {
        item: obj,
        metadata,
        matchingKey,
      } = await findObject(op, key, restoreKeys, compressionMethod);
      core.debug("found cache object");
      stateProvider.setState(State.MatchedKey, matchingKey);
      core.info(
        `Downloading cache from ${provider} to ${archivePath}. bucket: ${bucket}, root: ${root}, object: ${obj}`
      );
      const r = await op.reader(obj);
      const rs = r.createReadStream();
      const ws = fs.createWriteStream(archivePath);
      await pipeline(rs, ws);
      await finished(rs);
      if (core.isDebug()) {
        await listTar(archivePath, compressionMethod);
      }
      let size = 0;
      if (metadata?.contentLength) {
        size = Number(metadata.contentLength);
      }
      core.info(`Cache Size: ${formatSize(size)} (${size} bytes)`);

      await extractTar(archivePath, compressionMethod);
      setCacheHitOutput(matchingKey === key);
      core.info(`Cache restored from ${provider} successfully`);
    } catch (e) {
      core.info(`Restore ${provider} cache failed: ${e}`);
      setCacheHitOutput(false);
      if (useFallback) {
        if (isGhes()) {
          core.warning("Cache fallback is not supported on Github Enterpise.");
        } else {
          core.info("Restore cache using fallback cache");
          const fallbackMatchingKey = await cache.restoreCache(
            paths,
            key,
            restoreKeys
          );
          if (fallbackMatchingKey) {
            stateProvider.setFallbackMatchedKey(fallbackMatchingKey);
            setCacheHitOutput(fallbackMatchingKey === key);
            core.info("Fallback cache restored successfully");
          } else {
            core.info("Fallback cache restore failed");
          }
        }
      }
    }
  } catch (e) {
    core.setFailed(`${e}`);
  }
}
