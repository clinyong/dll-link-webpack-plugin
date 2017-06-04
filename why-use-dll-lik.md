When using `DllReferencePlugin`，you will have to indicate the manifest file or context.

```js
var webpack = require('webpack');

module.exports = {
    // ...
    plugins: [
        new webpack.DllReferencePlugin({
            context: '.',
            manifest: require('xxxx-manifest.json'),
        })
    ]
};
```

And then compile manually.

```
$ webpack --config webpack.dll.config.js
$ webpack --config webpack.config.js
```

When vendors change, compile manually again...

```
$ webpack --config webpack.dll.config.js
$ webpack --config webpack.config.js
```

Let's see how things are different with `DllLinkPlugin`.

The config file changes to

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

No `DllReferencePlugin` any more, then compile.

```js
$ webpack --config webpack.config.js
```

That's it! What you have to do is require the normal dll config file. Every time you run the above command, it will help you to detect the change and rebuild the vendors file automatically.