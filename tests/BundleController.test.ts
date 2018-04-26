import { BundleController } from "../src/BundleController";
import * as fse from "fs-extra";
import * as path from "path";
import * as webpack from "webpack";

const join = path.join;

const libraryName = "vendor_lib";

const outputFileName = "dll.bundle.js";
const manifestJSONName = "vendor-manifest.json";

const entryFilePath = path.resolve(__dirname, `dll.js`);
const bundleOutputPath = join(__dirname, "bundle-output");
const cacheJSPath = join(bundleOutputPath, "cache/js");
const cacheJSONPath = join(bundleOutputPath, "cache/json");

const webpackConfig: webpack.Configuration = {
    entry: [entryFilePath],
    output: {
        filename: outputFileName,
        path: bundleOutputPath,
        library: libraryName
    },
    plugins: [
        new webpack.DllPlugin({
            name: libraryName,
            path: path.join(bundleOutputPath, manifestJSONName)
        })
    ]
};

const bundle = new BundleController({
    webpackConfig,
    cacheConfig: {
        cacheJSNames: [outputFileName],
        cacheJSPath,
        cacheJSONPath
    }
});

beforeAll(() =>
    fse.writeFile(entryFilePath, "console.log('lib.js');", {
        encoding: "utf8"
    }));

afterAll(async () => {
    await fse.remove(entryFilePath);
    await fse.remove(bundleOutputPath);
});

describe("test build", () => {
    const cacheFileExits = async () =>
        (await fse.exists(join(cacheJSPath, outputFileName))) &&
        (await fse.exists(join(cacheJSONPath, manifestJSONName)));
    const outputFileExits = async () =>
        fse.exists(join(bundleOutputPath, outputFileName));

    test("empty files", async () => {
        expect(await cacheFileExits()).toBeFalsy();
        expect(await outputFileExits()).toBeFalsy();
    });

    test("build without error", () => bundle.webpackBuild());

    test("cache file exits", async () => {
        expect(cacheFileExits()).toBeTruthy();
    });

    test("build file exits", async () => {
        bundle.copyAllFiles();
        expect(await outputFileExits()).toBeTruthy();
    });
});
