const path = require('path');

module.exports = {
  entry: './src/nbody.js',
  output: {
    filename: 'nbody.js',
    path: path.resolve(__dirname, 'dist'),
  },
};
