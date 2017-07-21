var DllLinkPlugin = require('../../');
var path = require('path');
var HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = {
    entry: {
        app: [
            path.resolve(__dirname, './app.js')
        ],
    },
    output: {
        filename: 'app.bundle.js',
        path: path.resolve(__dirname, '../build')
    },
    plugins: [
        new DllLinkPlugin({
            config: require('./webpack.dll.config'),
            htmlMode: true
        }),
        new HtmlWebpackPlugin()
    ]
};