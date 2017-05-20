import * as path from "path";
import * as _ from "lodash";
import * as md5 from "md5";
import * as webpack from "webpack";
import { CacheController } from "./CacheController";
import { BundleController } from "./BundleController";

const cacheDir = path.resolve(".dll-link-plugin");
const MANIFEST_FILE = "manifest.json";

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

        const { entry } = config;

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
            if (this.cacheController.shouldUpdateCache()) {
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