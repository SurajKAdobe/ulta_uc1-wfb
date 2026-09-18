const path = require('path')
const webpack = require('webpack')
const HtmlWebpackPlugin = require('html-webpack-plugin')

// Figma loads `ui` as a single self-contained HTML file, so the compiled UI
// script has to be inlined rather than referenced via <script src>.
class InlineChunkHtmlPlugin {
  constructor (htmlPlugin, patterns) {
    this.htmlPlugin = htmlPlugin
    this.patterns = patterns
  }

  getInlinedTag (publicPath, assets, tag) {
    if (tag.tagName !== 'script' || !tag.attributes || !tag.attributes.src) return tag
    const scriptName = tag.attributes.src.replace(publicPath, '')
    if (!this.patterns.some((pattern) => scriptName.match(pattern))) return tag
    const asset = assets[scriptName]
    if (!asset) return tag
    return { tagName: 'script', innerHTML: asset.source(), closeTag: true }
  }

  apply (compiler) {
    let publicPath = compiler.options.output.publicPath || ''
    if (publicPath && !publicPath.endsWith('/')) publicPath += '/'

    compiler.hooks.compilation.tap('InlineChunkHtmlPlugin', (compilation) => {
      const tagFunction = (tag) => this.getInlinedTag(publicPath, compilation.assets, tag)

      this.htmlPlugin.getHooks(compilation).alterAssetTagGroups.tap('InlineChunkHtmlPlugin', (assets) => {
        assets.headTags = assets.headTags.map(tagFunction)
        assets.bodyTags = assets.bodyTags.map(tagFunction)
      })
    })
  }
}

module.exports = (env, argv) => ({
  mode: argv.mode === 'production' ? 'production' : 'development',
  devtool: argv.mode === 'production' ? false : 'inline-source-map',
  entry: {
    ui: path.resolve(__dirname, 'src/ui/index.js'),
    code: path.resolve(__dirname, 'src/plugin/controller.js')
  },
  module: {
    rules: [
      {
        test: /\.jsx?$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: [
              ['@babel/preset-env', { targets: { esmodules: true } }],
              ['@babel/preset-react', { runtime: 'automatic', development: false }]
            ]
          }
        }
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader']
      }
    ]
  },
  resolve: {
    extensions: ['.js', '.jsx']
  },
  output: {
    filename: '[name].js',
    path: path.resolve(__dirname, 'dist')
  },
  plugins: [
    // Figma's UI iframe has no global `process` object. react-draggable
    // (via react-rnd) reads process.env.DRAGGABLE_DEBUG for a debug flag,
    // which throws a ReferenceError at script load and silently blanks the
    // whole panel. Stub just that one property rather than all of
    // process.env — React/react-dom/the jsx runtime branch internally on
    // process.env.NODE_ENV (which webpack's `mode` already defines), and
    // blanking the whole object broke that, causing jsxDEV lookups to fail.
    new webpack.DefinePlugin({
      'process.env.DRAGGABLE_DEBUG': JSON.stringify(false)
    }),
    new HtmlWebpackPlugin({
      template: path.resolve(__dirname, 'src/ui/index.html'),
      filename: 'ui.html',
      chunks: ['ui'],
      inject: 'body'
    }),
    new InlineChunkHtmlPlugin(HtmlWebpackPlugin, ['ui.js'])
  ]
})
