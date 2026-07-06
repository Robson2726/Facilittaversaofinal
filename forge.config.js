const { FusesPlugin } = require('@electron-forge/plugin-fuses');
const { FuseV1Options, FuseVersion } = require('@electron/fuses');

module.exports = {
  packagerConfig: {
    name: 'FacilittaPortaria',
    executableName: 'FacilittaPortaria',
    icon: 'src/assets/icone-app.ico',
    asar: true,
    out: 'out',
    ignore: [
      /^\/\.git/,
      /^\/\.vscode/,
      /^\/node_modules\/.*\/test/,
      /^\/dist/,
      /^\/out/,
      /^\/scripts/,
      /BUILD\.md$/
    ],
    extraResources: [
      '.env'
    ]
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-zip',
      platforms: ['win32'],
      config: {
        name: 'FacilittaPortaria-Portable'
      }
    }
  ],
  plugins: [
    {
      name: '@electron-forge/plugin-auto-unpack-natives',
      config: {}
    },
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};
