const path = require('path');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = {
    mode: "development",

    // Site le web. Pour nodejs : "node"
    // Pour web + node, voir : https://webpack.js.org/concepts/targets/#multiple-targets
    //
    target: "web",

    // Génére des source map dans le js directement.
    devtool: "inline-source-map",

    // Débute l'analyse ici.
    //
    entry: [
        "./src/app.tsx",
    ],

    // Où générer la sortie.
    //
    output: {
        path: __dirname + '/www',
        filename: 'bundle.js',
    },

    // Indique au serveur de développement la base.
    //
    devServer: {
        contentBase: './www'
    },

    // Lorsqu'un module node est référencé
    // détermine quelles extensions rechercher dedans
    // et dans quel ordre de priorité.
    //
    resolve: {
        extensions: [".js", ".jsx", ".ts", ".tsx"]
    },

    module: {
        rules: [
            // Compile les fichiers .ts et .tsx
            { test: /\.tsx?$/, loader: "ts-loader" },

            // Charge les fichiers SCSS.
            //
            {
                test: /\.scss$/,
                use: [{ loader: 'style-loader' }, { loader: 'css-loader' }, { loader: 'sass-loader' }]
            },

            // Charge les fichiers CSS.
            //
            {
                test: /\.css$/,
                use: [{ loader: 'style-loader' }, { loader: 'css-loader'}]
            },

            // Charge les polices de caractère.
            //
            {
                test: /\.(woff|woff2|ttf|otf|eot)$/,
                loader: 'file-loader',
            },

            // Charge les images.
            //
            {
                test: /\.(png|jpe?g|gif|svg)$/,
                loader: 'file-loader',
            }
        ]
    },

    plugins: [
        // Copie les fichiers de src/www dans la sortie.
        new CopyWebpackPlugin([{ from: './src/www/*', flatten: true }]),
    ]
};