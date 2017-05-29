import * as path from "path";
import * as _ from "lodash";
import * as md5 from "md5";
import * as fs from "fs-extra";
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
    assetsMode?: boolean;
    htmlMode?: boolean;
    appendVersion?: boolean;
}

function md5Slice(msg) {
    return md5(msg).slice(0, 10);
}

function changeName(name: string, version: string) {
    const tmp = name.split(".");
    const ext = tmp.splice(-1, 1, version);
    return tmp.concat(ext).join(".");
}

export default class DllLinkWebpackPlugin {
    cacheController: CacheController;
    bundleController: BundleController;
    hasCompile: boolean;
    cacheJSPath: string;
    cacheJSONPath: string;
    options: DllLinkWebpackPluginOptions;

    constructor(options: DllLinkWebpackPluginOptions) {
        this.check = this.check.bind(this);
        this.addAssets = this.addAssets.bind(this);
        this.hookIntoHTML = this.hookIntoHTML.bind(this);
        this.updateNames = this.updateNames.bind(this);

        this.options = options;

        const { config, manifestNames } = this.options;
        if (manifestNames && !_.isArray(manifestNames)) {
            throw new Error("manifest names must be an array.");
        }

        const { entry } = config;

        const configIndex = md5Slice(JSON.stringify(config));
        this.cacheJSPath = `${cacheDir}/${configIndex}/js`;
        this.cacheJSONPath = `${cacheDir}/${configIndex}/json`;

        this.cacheController = new CacheController({
            configIndex,
            entry,
            manifestFile: `${cacheDir}/${MANIFEST_FILE}`,
            cacheDir: {
                js: this.cacheJSPath,
                json: this.cacheJSONPath
            }
        });
        this.bundleController = new BundleController({
            webpackConfig: config,
            cacheConfig: {
                cacheJSNames: this.cacheController.getCacheJSNames(),
                cacheJSPath: this.cacheJSPath,
                cacheJSONPath: this.cacheJSONPath
            },
            manifestNames
        });
        this.hasCompile = false;
    }

    hookIntoHTML(compilation) {
        compilation.plugin("html-webpack-plugin-before-html-generation", (htmlPluginData, cb) => {
            const jsNames = this.cacheController.getCacheJSNames();
            const assets = htmlPluginData.assets as { js: string[] };
            assets.js = jsNames.concat(assets.js);
            cb(null, htmlPluginData);
        });
    }

    addAssets(compilation, cb) {
        this.cacheController.getCacheJSNames().map(name => {
            const source = fs.readFileSync(`${this.cacheJSPath}/${name}`).toString();
            compilation.assets[name] = {
                source: () => source,
                size: () => source.length
            };
        });

        return cb();
    }

    async check(compilation, cb) {
        if (!this.hasCompile) {
            this.hasCompile = true;
            if (this.cacheController.shouldUpdateCache()) {
                const assets = await this.bundleController.webpackBuild();
                this.cacheController.updateJSNamesCache(assets);
            }

            const { htmlMode, assetsMode } = this.options;
            if (!htmlMode && !assetsMode) {
                this.bundleController.copyAllFiles();
            }

            this.cacheController.writeCache();
        }
        return cb();
    }

    updateNames(compilation, cb) {
        const ver = this.cacheController.getCacheVersion();

        let entryChunks = {};

        // change related chunks name
        const chunks = compilation.chunks as any[];
        for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];
            if (chunk.isInitial()) {
                chunk.files = chunk.files.map(file => {
                    entryChunks[file] = true;
                    return changeName(file, ver);
                });
            }
        }

        // change assets name
        const newAssets = {};
        Object.keys(compilation.assets).forEach(k => {
            let newKey = k;
            if (entryChunks[k]) {
                newKey = changeName(k, ver);
            }
            newAssets[newKey] = compilation.assets[k];
        });
        compilation.assets = newAssets;

        return cb();
    }

    apply(compiler) {
        const { htmlMode, assetsMode, appendVersion } = this.options;
        compiler.plugin("before-compile", this.check);
        if (htmlMode) {
            // Hook into the html-webpack-plugin processing
            compiler.plugin("compilation", this.hookIntoHTML);
        }

        if (appendVersion) {
            compiler.plugin("emit", this.updateNames);
        }

        if (htmlMode || assetsMode) {
            compiler.plugin("emit", this.addAssets);
        }

        this.bundleController.applyDllReferencePlugins(compiler);
    }
}

module.exports = DllLinkWebpackPlugin;