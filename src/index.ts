import * as path from "path";
import * as fs from "fs-extra";
import * as _ from "lodash";
import * as md5 from "md5";
import * as chalk from "chalk";
import * as webpack from "webpack";

const cacheDir = path.resolve(".dll.cache");
const cacheJSDir = `${cacheDir}/js`;
const cacheJsonDir = `${cacheDir}/json`;
const manifestFile = `${cacheDir}/manifest.json`;
let hasCompile = false;

const status = {
    ERROR: "ERROR"
};

function initDir() {
    fs.mkdirSync(cacheDir);
    fs.writeFileSync(manifestFile, JSON.stringify({ entry: {} }));
}

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

class DllLinkWebpackPlugin {
    output: Output;
    config: webpack.Configuration;
    referencePlugins: webpack.DllReferencePlugin[];
    updateCache: boolean;

    constructor(options: DllLinkWebpackPluginOptions) {
        if (!fs.existsSync(cacheDir)) {
            initDir();
        }

        const { config, manifestNames } = options;
        if (manifestNames && !_.isArray(manifestNames)) {
            throw new Error("manifest names must be an array.");
        }

        const { output, entry, plugins } = config;

        let index = -1;
        for (let i = 0; i < plugins.length; i++) {
            if (plugins[i] instanceof webpack.DllPlugin) {
                index = i;
                break;
            }
        }

        if (index === -1) {
            throw new Error("Your webpack dll config miss DllPlugin.");
        }

        const dllPlugin: any = plugins[index];
        const dllOptions: webpack.DllPlugin.Options = dllPlugin.options;
        const dllJsonFullPath = dllOptions.path;
        const i = dllJsonFullPath.lastIndexOf("/");
        const dllJsonPath = dllJsonFullPath.slice(0, i);
        const jsonNameTPL = dllJsonFullPath.slice(i + 1);

        let outputJsonNames = [];
        let outputJSNames = [];
        Object.keys(entry).forEach(entryName => {
            outputJsonNames.push(jsonNameTPL.replace("[name]", entryName));
            outputJSNames.push(output.filename.replace("[name]", entryName));
        });

        this.output = {
            jsNames: outputJSNames,
            jsPath: output.path,
            jsonNames: outputJsonNames,
            jsonPath: dllJsonPath
        };

        config.output.path = cacheJSDir;
        dllPlugin.options.path = `${cacheJsonDir}/${jsonNameTPL}`;
        config.plugins[index] = dllPlugin;

        this.config = config;

        let referenceNames = manifestNames || this.output.jsonNames;
        let referenceConf: webpack.DllReferencePlugin.Options[] = referenceNames.map(name => ({
            manifest: `${this.output.jsonPath}/${name}`
        }) as any);
        if (dllOptions.context) {
            referenceConf = referenceConf.map(conf => ({
                ...conf,
                context: dllOptions.context
            }));
        }
        this.referencePlugins = referenceConf.map(conf => new webpack.DllReferencePlugin(conf));

        // check cache

        const manifestCache = JSON.parse(fs.readFileSync(manifestFile));
        const updateEntry = !_.isEqual(manifestCache.entry, entry);
        if (updateEntry) {
            manifestCache.entry = entry;
        }

        const yarnMD5 = md5(fs.readFileSync("yarn.lock").toString());
        const updateYarn = !(manifestCache.yarnLock === yarnMD5);
        if (updateYarn) {
            manifestCache.yarnLock = yarnMD5;
        }

        this.updateCache = updateYarn || updateEntry;
        if (this.updateCache) {
            fs.writeFileSync(manifestFile, JSON.stringify(manifestCache));
        }
    }

    apply(compiler) {
        compiler.plugin("before-compile", (compilation, cb) => {
            if (!hasCompile) {
                hasCompile = true;

                if (this.updateCache) {
                    webpack(this.config, (err, stats) => {
                        process.stdout.write(stats.toString({
                            colors: true,
                            modules: false,
                            children: false,
                            chunks: false,
                            chunkModules: false
                        }) + "\n\n");

                        let count = 0;
                        const len = this.output.jsNames.length + this.output.jsonNames.length;

                        fs.copySync(cacheJSDir, this.output.jsPath);
                        fs.copySync(cacheJsonDir, this.output.jsonPath);
                        return cb();
                    });
                }

                fs.copySync(cacheJSDir, this.output.jsPath);
                fs.copySync(cacheJsonDir, this.output.jsonPath);
                return cb();
            } else {
                return cb();
            }
        });

        this.referencePlugins.forEach(plugin => {
            plugin.apply.call(plugin, compiler);
        });
    }
}

export default DllLinkWebpackPlugin;