## Dll Link Plugin

用于简化生成 webpack DLL 的插件。基于 [DllReferencePlugin](https://webpack.js.org/plugins/dll-plugin/#dllreferenceplugin)。可以看下这篇[博客](http://www.jianshu.com/p/a5b3c2284bb6)的介绍。

### 安装

```
$ yarn add dll-link-webpack-plugin -D
```

### 基础用法

在 `webpack.config.js` 这个配置文件里面，用 `DllLinkPlugin` 替换掉 `DllReferencePlugin`。

```js
var DllLinkPlugin = require("dll-link-webpack-plugin");

module.exports = {
    // ...
    plugins: [
        new DllLinkPlugin({
            config: require("webpack.dll.config.js")
        })
    ]
};
```

然后运行

```
$ webpack --config webpack.config.js
```

这个命令会自动生成 DLL 文件。关于插件的更多用法，可以查看项目自带的[例子](https://github.com/clinyong/dll-link-webpack-plugin/tree/master/examples)。

### 配置

*   `htmlMode`: `true` | `false` 如果你用了 [html-webpack-plugin](https://github.com/jantimon/html-webpack-plugin)，生成出来的 DLL 文件会被自动引入 html 文件中。（默认值为 `false`）
*   `assetsMode`: `true` | `false` 把 DLL 文件输出为 webpack 的 assets 文件。（默认值为 `false`）
*   `appendVersion`: `true` | `false` 给每个 webpack 生成出的 entry 文件打上一个版本号。（默认值为 `false`）

上面配置项的例子：

```js
module.exports = {
    // ...
    plugins: [
        new DllLinkPlugin({
            config: require("webpack.dll.config.js"),
            appendVersion: true,
            assetsMode: true,
            htmlMode: true
        })
    ]
};
```
