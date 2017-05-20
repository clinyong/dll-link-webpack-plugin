import * as path from "path";
import * as fs from "fs-extra";
import * as _ from "lodash";
import * as md5 from "md5";
import * as chalk from "chalk";
import * as webpack from "webpack";
import * as fs2 from "fs";
import { CacheController } from "./CacheController";
import { BundleController } from "./BundleController";

const cacheDir = path.resolve(".dll-link-plugin");
const cacheOutputDir = `${cacheDir}/output`;
const MANIFEST_FILE = "manifest.json";
let hasCompile = false;

const status = {
    ERROR: "ERROR"
};

const FS_ACCURACY = 10000;

function print(msg, level) {
    let color = null;
    switch (level) {
        case status.ERROR:
            color = chalk.red;
            break;
        default:
            color = chalk.white;
    }

    console.log(color(`[dll-link-webpack-plugin]: ${msg}`));
}

interface DllConfigFile {
    entry: string | string[] | webpack.Entry;
    outputJSNames: string[];
}

interface ManifestCache {
    configFiles: { [index: string]: DllConfigFile; };
    currentConfig: string;
    yarnLock: string;
}

export interface Output {
    jsNames: string[];
    jsPath: string;
    jsonNames: string[];
    jsonPath: string;
}

export interface DllLinkWebpackPluginOptions {
    config: webpack.Configuration;
    manifestNames?: string[];
}

function md5Slice(msg) {
    return md5(msg).slice(0, 10);
}

class DllLinkWebpackPlugin {
    cacheController: CacheController;
    bundleController: BundleController;
    hasCompile: boolean;

    constructor(options: DllLinkWebpackPluginOptions) {
        this.check = this.check.bind(this);

        const { config, manifestNames } = options;
        if (manifestNames && !_.isArray(manifestNames)) {
            throw new Error("manifest names must be an array.");
        }

        const { output, entry, plugins } = config;

        const configIndex = md5Slice(JSON.stringify(config));
        const cacheJSPath = `${cacheDir}/${configIndex}/js`;
        const cacheJSONPath = `${cacheDir}/${configIndex}/json`;

        this.cacheController = new CacheController({
            configIndex,
            entry,
            manifestFile: `${cacheDir}/${MANIFEST_FILE}`,
            cacheDir: {
                js: cacheJSPath,
                json: cacheJSONPath
            }
        });
        this.bundleController = new BundleController({
            webpackConfig: config,
            cacheConfig: {
                cacheJSNames: this.cacheController.getCacheJSNames(),
                cacheJSPath,
                cacheJSONPath
            },
            manifestNames
        });
        this.hasCompile = false;
    }

    async check(compilation, cb) {
        if (!this.hasCompile) {
            this.hasCompile = true;
            if (this.cacheController.shouldUpdate) {
                const assets = await this.bundleController.webpackBuild();
                this.cacheController.updateJSNamesCache(assets);
                this.cacheController.writeCache();
            }
            this.bundleController.copyAllFiles();
        }
        return cb();
    }

    apply(compiler) {
        compiler.plugin("before-compile", this.check);
        this.bundleController.applyDllReferencePlugins(compiler);
    }
}

module.exports = DllLinkWebpackPlugin;