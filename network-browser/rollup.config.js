import typescript from '@rollup/plugin-typescript';
import commonjs from '@rollup/plugin-commonjs';
import { nodeResolve } from '@rollup/plugin-node-resolve';

export default {
  input: 'index.ts',
  output: {
    file: 'network-browser.js',
    format: 'es'
  },
  plugins: [typescript(), nodeResolve(), commonjs({ transformMixedEsModules: true })]
};