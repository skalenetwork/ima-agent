import typescript from '@rollup/plugin-typescript'

export default {
    input: 'index.ts',
    output: {
        dir: 'build',
        format: 'es',
        preserveModules: true
    },
    plugins: [typescript()]
}
