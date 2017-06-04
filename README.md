## Dll Link Plugin

This is a webpack plugin that help you to improve webpack build time performance. It is based on [DllReferencePlugin](https://webpack.js.org/plugins/dll-plugin/#dllreferenceplugin). And you can see the difference [here](https://github.com/clinyong/dll-link-webpack-plugin/blob/master/why-use-dll-link.md).


### Install

```
$ yarn add dll-link-webpack-plugin -D
```
By now, this plugin uses `yarn.lock` to track dependency. So make sure you are using [yarn](https://yarnpkg.com/en/).

### Basic Usage

Replace `DllReferencePlugin` with `DllLinkPlugin` in your `webpack.config.js`

```js
var DllLinkPlugin = require('dll-link-webpack-plugin');

module.exports = {
    // ...
    plugins: [
        new DllLinkPlugin({
            config: require('webpack.dll.config.js')
        })
    ]
}
```

And directly run

```
$ webpack --config webpack.config.js
```

This will automatically generate the DLL file. For more usage, see [examples](https://github.com/clinyong/dll-link-webpack-plugin/tree/master/examples).