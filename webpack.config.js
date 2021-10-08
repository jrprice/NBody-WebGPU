const path = require('path');

module.exports = {
  entry: './src/nbody.js',
  mode: 'development',
  output: {
    filename: 'nbody.js',
    path: path.resolve(__dirname, 'dist'),
  },
  module: {
    rules: [
      {
        test: /\.wgsl$/i,
        use: 'raw-loader',
      },
    ],
  },
};
