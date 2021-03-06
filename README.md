## Dll Link Plugin

A webpack plugin that simplifies creation of webpack DLL file. It is based on [DllReferencePlugin](https://webpack.js.org/plugins/dll-plugin/#dllreferenceplugin). And you can see the difference [here](https://github.com/clinyong/dll-link-webpack-plugin/blob/master/why-use-dll-link.md).

[中文 README](https://github.com/clinyong/dll-link-webpack-plugin/blob/master/README-zh_CN.md)

### Install

```
$ yarn add dll-link-webpack-plugin -D
```

### Basic Usage

Replace `DllReferencePlugin` with `DllLinkPlugin` in your `webpack.config.js`

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

And directly run

```
$ webpack --config webpack.config.js
```

This will automatically generate the DLL file. For more usage, see [examples](https://github.com/clinyong/dll-link-webpack-plugin/tree/master/examples).

### Configuration

*   `htmlMode`: `true` | `false` This is useful when you are using [html-webpack-plugin](https://github.com/jantimon/html-webpack-plugin). The DLL file will be included in the output html file. (default is `false`)
*   `assetsMode`: `true` | `false` Emit the DLL file as webpack assets file. (default is `false`)
*   `appendVersion`: `true` | `false` Append a DLL hash version to your webpack entry filenames. (default is `false`)

Example for above options:

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
