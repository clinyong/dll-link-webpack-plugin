import { CacheController, ManifestCache } from "../src/CacheController";
import { getDependencyFromYarn } from "../src/utils/packageDependency";
import * as path from "path";
import * as fse from "fs-extra";

const manifestPath = path.join(__dirname, "./manifest.json");
const cahceIndex = "index";
const entry = "chalk";

function genCache(): CacheController {
    return new CacheController({
        configIndex: cahceIndex,
        manifestFile: manifestPath,
        entry
    });
}

function createFile(manifest: ManifestCache) {
    return fse.writeJson(manifestPath, manifest).then(genCache);
}

function removeFile() {
    return fse.remove(manifestPath);
}

describe("empty manifest content", () => {
    let cache: CacheController;
    beforeAll(() => createFile({ configFiles: {} }).then(c => (cache = c)));
    afterAll(removeFile);

    test("should update", () => {
        expect(cache.shouldUpdateCache()).toBe(true);
    });

    test("empty cache", () => {
        expect(cache.getCacheJSNames()).toHaveLength(0);
    });

    test("should have cache", () => {
        const cacheJSNames = ["a", "b"];
        cache.updateJSNamesCache(cacheJSNames);
        expect(cache.getCacheJSNames()).toEqual(cacheJSNames);
    });
});

describe("valid cache", () => {
    let cache: CacheController;
    beforeAll(() =>
        createFile({
            configFiles: {
                [cahceIndex]: {
                    outputJSNames: [].concat(entry),
                    entryVersion: getDependencyFromYarn(entry)
                }
            }
        }).then(c => (cache = c)));
    afterAll(removeFile);

    test("no need to update", () => {
        expect(cache.shouldUpdateCache()).toBeFalsy();
    });

    test("should have cache", () => {
        expect(cache.getCacheJSNames()).toEqual([].concat(entry));
    });
});

describe("invalid cache", () => {
    let cache: CacheController;
    beforeAll(() => {
        const entryVersion = getDependencyFromYarn(entry);
        Object.keys(entryVersion).forEach(k => {
            entryVersion[k].version = `0.0.0`;
        });

        return createFile({
            configFiles: {
                [cahceIndex]: {
                    outputJSNames: [].concat(entry),
                    entryVersion
                }
            }
        }).then(c => (cache = c));
    });
    afterAll(removeFile);

    test("need to update", () => {
        expect(cache.shouldUpdateCache()).toBeTruthy();
    });
});
