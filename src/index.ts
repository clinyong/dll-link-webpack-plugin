import * as path from "path";
import * as _ from "lodash";
import * as md5 from "md5";
import * as fs from "fs-extra";
import * as webpack from "webpack";
import * as chalk from "chalk";
import { CacheController } from "./CacheController";
import { BundleController } from "./BundleController";

const cacheDir = path.resolve(".dll-link-plugin");
const MANIFEST_FILE = "manifest.json";
const pluginName = "DllLinkWebpackPlugin";

export interface Output {
    jsNames: string[];
    jsPath: string;
    jsonNames: string[];
    jsonPath: string;
}

export interface DllLinkWebpackPluginOptions {
    config: webpack.Configuration;
    HtmlWebpackPlugin?: any;
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
    const ext = tmp.splice(-1);
    if (ext[0] === "js") {
        return `${tmp.join(".")}.${version}.js`;
    } else {
        return name;
    }
}

/**
 * Takes a string in train case and transforms it to camel case
 *
 * Example: 'hello-my-world' to 'helloMyWorld'
 *
 * @param {string} word
 */
function trainCaseToCamelCase(word: string) {
    return word.replace(/-([\w])/g, function(match, p1) {
        return p1.toUpperCase();
    });
}

// str1 may be a http url, so we can not use path.join here.
function joinString(str1: string, str2: string) {
    if (str1 === "") {
        return str2;
    }

    let newStr1 = str1.endsWith("/") ? str1.slice(0, str1.length - 1) : str1;
    let newStr2 = str2.startsWith("/") ? str2.slice(1) : str2;

    return `${newStr1}/${newStr2}`;
}

export class DllLinkWebpackPlugin {
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
        this.cacheJSPath = path.join(cacheDir, configIndex, "js");
        this.cacheJSONPath = path.join(cacheDir, configIndex, "json");

        this.cacheController = new CacheController({
            configIndex,
            entry,
            manifestFile: path.join(cacheDir, MANIFEST_FILE)
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
        const hookFunction = (htmlPluginData, cb) => {
            const { publicPath = "" } = this.options.config.output;
            const jsFiles = [],
                cssFiles = [];

            this.cacheController.getCacheJSNames().forEach(item => {
                const ext = item.split(".").reverse()[0];
                if (ext === "js") {
                    jsFiles.push(joinString(publicPath, item));
                } else if (ext === "css") {
                    cssFiles.push(joinString(publicPath, item));
                }
            });

            const assets = htmlPluginData.assets;
            assets.js = jsFiles.concat(assets.js);
            assets.css = cssFiles.concat(assets.css);

            cb(null, htmlPluginData);
        };
        if (compilation.hooks) {
            if (compilation.hooks.htmlWebpackPluginBeforeHtmlGeneration) {
                compilation.hooks.htmlWebpackPluginBeforeHtmlGeneration.tapAsync(
                    pluginName,
                    hookFunction
                );
            } else if (this.options.HtmlWebpackPlugin) {
                // HtmlWebPackPlugin 4.x
                const hooks = this.options.HtmlWebpackPlugin.getHooks(
                    compilation
                );
                hooks.beforeAssetTagGeneration.tapAsync(
                    pluginName,
                    hookFunction
                );
            }
        } else {
            compilation.plugin(
                "html-webpack-plugin-before-html-generation",
                hookFunction
            );
        }
    }

    addAssets(compilation, cb) {
        this.cacheController.getCacheJSNames().map(name => {
            const source = fs
                .readFileSync(`${this.cacheJSPath}/${name}`)
                .toString();
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
                console.log();
                console.log(chalk.cyan("[dll-link-plugin]: Rebuilding dll."));
                console.log();

                let assets = [];
                try {
                    assets = await this.bundleController.webpackBuild();
                } catch (err) {
                    return cb(err);
                }
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
            if (
                (typeof chunk.isInitial === "function" && chunk.isInitial()) ||
                chunk.isInitial === true
            ) {
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

    attachCompiler(compiler, eventName: string, isAsync: boolean, func) {
        if ("hooks" in compiler) {
            // webpack 4
            eventName = trainCaseToCamelCase(eventName);
            if (compiler.hooks[eventName]) {
                compiler.hooks[eventName][isAsync ? "tapAsync" : "tap"](
                    pluginName,
                    func
                );
            }
        } else {
            // webpack 2/3
            compiler.plugin(eventName, func);
        }
    }

    apply(compiler) {
        const { htmlMode, assetsMode, appendVersion } = this.options;
        this.attachCompiler(compiler, "before-compile", true, this.check);
        if (htmlMode) {
            // Hook into the html-webpack-plugin processing
            this.attachCompiler(
                compiler,
                "compilation",
                false,
                this.hookIntoHTML
            );
        }

        if (appendVersion) {
            this.attachCompiler(compiler, "emit", true, this.updateNames);
        }

        if (htmlMode || assetsMode) {
            this.attachCompiler(compiler, "emit", true, this.addAssets);
        }

        this.bundleController.applyDllReferencePlugins(compiler);
    }
}

module.exports = DllLinkWebpackPlugin;
