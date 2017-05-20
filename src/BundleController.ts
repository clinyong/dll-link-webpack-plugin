import * as webpack from "webpack";
import * as fs from "fs-extra";

const FS_ACCURACY = 10000;

interface OutputFiles {
    jsNames: string[];
    jsonNames: string[];
}

interface OutputPathItem {
    src: string;
    dist: string;
}

interface OutputPath {
    js: OutputPathItem;
    json: OutputPathItem;
}

export interface CacheConfig {
    cacheJSPath: string;
    cacheJSONPath: string;
    cacheJSNames: string[];
}

export interface BundleOptions {
    webpackConfig: webpack.Configuration;
    cacheConfig: CacheConfig;
    manifestNames: string[];
}

export class BundleController {
    private webpackConfig: webpack.Configuration;
    private outputFiles: OutputFiles;
    private outputPath: OutputPath;
    private manifestNames: string[];
    private referencePlugins: webpack.DllReferencePlugin[];
    private pluginStartTime: number;

    constructor(options: BundleOptions) {
        const { webpackConfig, manifestNames, cacheConfig } = options;
        this.manifestNames = options.manifestNames || [];

        const { output, entry, plugins } = webpackConfig;
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
        dllPlugin.options.path = `${cacheConfig.cacheJSONPath}/${jsonNameTPL}`;
        webpackConfig.plugins[index] = dllPlugin;

        let outputJsonNames = [];
        Object.keys(entry).forEach(entryName => {
            outputJsonNames.push(jsonNameTPL.replace("[name]", entryName));
        });

        this.outputFiles = {
            jsNames: [],
            jsonNames: outputJsonNames
        };
        this.updateOutputJSNames(cacheConfig.cacheJSNames);
        this.outputPath = {
            js: { dist: output.path, src: cacheConfig.cacheJSPath },
            json: { dist: dllJsonPath, src: cacheConfig.cacheJSONPath }
        };

        this.initDllReferencePlugins(manifestNames, dllOptions);

        webpackConfig.output.path = this.outputPath.js.src;
        this.webpackConfig = webpackConfig;

        this.pluginStartTime = Date.now();
    }

    private initDllReferencePlugins(manifestNames: string[], dllOptions: webpack.DllPlugin.Options) {
        let referenceNames = manifestNames || this.outputFiles.jsonNames;
        let referenceConf: webpack.DllReferencePlugin.Options[] = referenceNames.map(name => ({
            manifest: `${this.outputPath.json.dist}/${name}`
        }) as any);
        if (dllOptions.context) {
            referenceConf = referenceConf.map(conf => ({
                ...conf,
                context: dllOptions.context
            }));
        }
        this.referencePlugins = referenceConf.map(conf => new webpack.DllReferencePlugin(conf));
    }

    private copyFile(name: string, isJS: boolean) {
        let filePath = this.outputPath.json;
        if (isJS) {
            filePath = this.outputPath.js;
        }

        fs.copySync(`${filePath.src}/${name}`, `${filePath.dist}/${name}`, { preserveTimestamps: true });
    }

    private modifyGenerateFileModifyTime() {
        let names = [
            ...this.outputFiles.jsNames.map(name => `${this.outputPath.js.src}/${name}`),
            ...this.outputFiles.jsonNames.map(name => `${this.outputPath.json.src}/${name}`),
        ];
        const time = parseInt((Math.floor((this.pluginStartTime - FS_ACCURACY) / 1000)).toFixed());
        names.forEach(name => {
            fs.utimesSync(name, time, time);
        });
    }

    private updateOutputJSNames(outputNames) {
        const list = this.manifestNames
            .map(name => outputNames.find(cacheName => cacheName.indexOf(name) !== -1))
            .filter(name => !!name);

        this.outputFiles.jsNames = list.length > 0 ? list : outputNames;
    }

    public applyDllReferencePlugins(compiler) {
        this.referencePlugins.forEach(plugin => {
            plugin.apply.call(plugin, compiler);
        });
    }

    public copyAllFiles() {
        this.outputFiles.jsNames.forEach(name => {
            this.copyFile(name, true);
        });
        this.outputFiles.jsonNames.forEach(name => {
            this.copyFile(name, false);
        });
    }

    public webpackBuild() {
        return new Promise<string[]>((resolve, reject) => {
            webpack(this.webpackConfig, (err, stats) => {
                const assets = stats.toJson().assets.map(asset => asset.name);
                this.modifyGenerateFileModifyTime();
                this.updateOutputJSNames(assets);
                return resolve(assets);
            });
        });
    }
}