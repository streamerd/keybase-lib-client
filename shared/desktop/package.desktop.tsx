import rimraf from 'rimraf'
import fs from 'fs-extra'
import klawSync from 'klaw-sync'
import minimist from 'minimist'
import os from 'os'
import packager, {type Options} from 'electron-packager'
import path from 'path'
import webpack from 'webpack'
import rootConfig from './webpack.config.babel'

const TEMP_SKIP_BUILD: boolean = false

// absolute path relative to this script
const desktopPath = (...args: Array<string>) => path.join(__dirname, ...args)

// recursively copy a folder over and allow only files with the extensions passed as onlyExts
const copySyncFolder = (src: string, target: string, onlyExts: Array<string>) => {
  const srcRoot = desktopPath(src)
  const dstRoot = desktopPath(target)
  const files: Array<{path: string}> = klawSync(srcRoot, {
    filter: (item: {path: string}) => {
      const ext = path.extname(item.path)
      return !ext || onlyExts.includes(ext)
    },
  })
  const relSrcs = files.map(f => f.path.substring(srcRoot.length))
  const dsts = relSrcs.map(f => path.join(dstRoot, f))

  relSrcs.forEach((s, idx) => fs.copySync(path.join(srcRoot, s), dsts[idx]))
}

const copySync = (src: string, target: string, options?: object) => {
  fs.copySync(desktopPath(src), desktopPath(target), {...options, dereference: true})
}

const argv = minimist(process.argv.slice(2), {string: ['appVersion']}) as {[key: string]: string | undefined}

const appName = 'Keybase'
const shouldUseAsar = false
const arch: string = typeof argv.arch === 'string' ? argv.arch.toString() : os.arch()
const platform: string = typeof argv.platform === 'string' ? argv.platform.toString() : os.platform()
const appVersion: string = (typeof argv.appVersion === 'string' && argv.appVersion) || '0.0.0'
const comment: string = (typeof argv.comment === 'string' && argv.comment) || ''
const outDir: string = (typeof argv.outDir === 'string' && argv.outDir) || ''
const appCopyright = 'Copyright (c) 2022, Keybase'
const companyName = 'Keybase, Inc.'

const packagerOpts: Options = {
  appBundleId: 'keybase.Electron',
  appCopyright: appCopyright,
  appVersion: appVersion,
  asar: shouldUseAsar,
  buildVersion: String(appVersion) + String(comment),
  darwinDarkModeSupport: true,
  dir: desktopPath('./build'),
  download: {
    checksums: {
      'electron-v20.2.0-darwin-arm64.zip': '0d4ea1a4f530b9bee78bd0a78430778a7e8982f78cf1d5ba8daac334a1312ce1',
      'electron-v20.2.0-darwin-x64.zip': '8cc8ec2823f561493e3ab22b9f73ea01af2f8eea4904af25d74ee91ee4cbfe2f',
      'electron-v20.2.0-linux-arm64.zip': '1d2dd05f060786eae5ce687794aa071df8a5f5733b7b2efa1481de8db75d7738',
      'electron-v20.2.0-linux-x64.zip': 'c0e3522de34819b838f4a35ddf30c6283c61be1bb8dff02089cda3f641938aad',
      'electron-v20.2.0-win32-x64.zip': '6387e61760d0a3dd986df259950b3df2fe16b924ea0bd640d019373b674df492',
      'hunspell_dictionaries.zip': 'df976a613c05c433fa5db6342a8a8ffd1f7fd192ef6af7d90989bd671c43b938',
    },
  },
  electronVersion: undefined,
  // macOS file association to saltpack files
  extendInfo: {
    CFBundleDocumentTypes: [
      {
        CFBundleTypeExtensions: ['saltpack'],
        CFBundleTypeIconFile: 'saltpack.icns',
        CFBundleTypeName: 'io.keybase.saltpack',
        CFBundleTypeRole: 'Editor',
        LSHandlerRank: 'Owner',
        LSItemContentTypes: ['io.keybase.saltpack'],
      },
    ],
    UTExportedTypeDeclarations: [
      {
        UTTypeConformsTo: ['public.data'],
        UTTypeDescription: 'Saltpack file format',
        UTTypeIconFile: 'saltpack.icns',
        UTTypeIdentifier: 'io.keybase.saltpack',
        UTTypeReferenceURL: 'https://saltpack.org',
        UTTypeTagSpecification: {
          'public.filename-extension': ['saltpack'],
        },
      },
    ],
  },
  // Any paths placed here will be moved to the final bundle
  extraResource: [] as Array<string>,
  helperBundleId: 'keybase.ElectronHelper',
  icon: undefined,
  ignore: [/\.map/, /\/test($|\/)/, /\/tools($|\/)/, /\/release($|\/)/, /\/node_modules($|\/)/],
  name: appName,
  protocols: [
    {
      name: 'Keybase',
      schemes: ['keybase', 'web+stellar'],
    },
  ],
}

async function main() {
  if (TEMP_SKIP_BUILD) {
    for (let i = 0; i < 10; ++i) {
      console.log('TEMP_SKIP_BUILD true@!!')
    }
  } else {
    rimraf.sync(desktopPath('dist'))
    rimraf.sync(desktopPath('build'))
  }

  copySync('Icon.png', 'build/desktop/Icon.png')
  copySync('Icon@2x.png', 'build/desktop/Icon@2x.png')
  copySyncFolder('../images', 'build/images', ['.gif', '.png'])
  if (TEMP_SKIP_BUILD) {
  } else {
    fs.removeSync(desktopPath('build/images/folders'))
    fs.removeSync(desktopPath('build/images/iconfont'))
    fs.removeSync(desktopPath('build/images/mock'))
    fs.removeSync(desktopPath('build/desktop/renderer/fonts'))
  }

  fs.writeJsonSync(desktopPath('build/package.json'), {
    main: 'desktop/dist/node.bundle.js',
    name: appName,
    version: appVersion,
  })

  const icon: string = argv.icon ?? ''
  const saltpackIcon: string = argv.saltpackIcon ?? ''

  if (icon) {
    packagerOpts.icon = icon
  }

  if (saltpackIcon) {
    packagerOpts.extraResource = [saltpackIcon]
  } else {
    console.warn(
      `Missing 'saltpack.icns' from yarn package arguments. Need an icon to associate ".saltpack" files with Electron on macOS, Windows, and Linux.`
    )
  }

  // use the same version as the currently-installed electron
  console.log('Finding electron version')
  try {
    packagerOpts.electronVersion = require('../package.json').devDependencies.electron
    console.log('Found electron version:', packagerOpts.electronVersion)
  } catch (err) {
    console.log("Couldn't parse yarn list to find electron:", err)
    process.exit(1)
  }

  try {
    await startPack()
  } catch (err) {
    console.log('Error startPack: ', err)
    process.exit(1)
  }
}

async function startPack() {
  console.log('Starting webpack build\nInjecting __VERSION__: ', appVersion)
  process.env.APP_VERSION = appVersion
  const webpackConfig = rootConfig(null, {mode: 'production'})
  try {
    if (TEMP_SKIP_BUILD) {
    } else {
      const stats = await new Promise<webpack.Stats | undefined>((resolve, reject) => {
        webpack(webpackConfig, (err, stats: webpack.Stats | undefined) => {
          if (err) {
            reject(err)
          } else {
            resolve(stats)
          }
        })
      })

      if (stats?.hasErrors()) {
        console.error(stats.toJson('errors-only').errors)
        process.exit(1)
      }
    }

    copySyncFolder('./dist', 'build/desktop/sourcemaps', ['.map'])
    copySyncFolder('./dist', 'build/desktop/dist', ['.js', '.ttf', '.png', '.html'])
    fs.removeSync(desktopPath('build/desktop/dist/fonts'))

    rimraf.sync(desktopPath('release'))

    let aps = [[platform, arch]]
    if (platform === 'darwin') {
      aps = [
        ['x64', 'darwin'],
        ['arm64', 'darwin'],
      ]
    }
    await Promise.all(
      aps.map(async ([arch, plat]) => {
        try {
          const appPaths = await pack(plat, arch)
          postPack(appPaths, plat, arch)
        } catch (err) {
          console.error(err)
          process.exit(1)
        }
      })
    )
  } catch (err) {
    console.error(err)
    process.exit(1)
  }
}

async function pack(plat: string, arch: string) {
  // there is no darwin ia32 electron
  if (plat === 'darwin' && arch === 'ia32') return []

  let packageOutDir = outDir
  if (packageOutDir === '') packageOutDir = desktopPath(`release/${plat}-${arch}`)
  console.log('Packaging to', packageOutDir)

  let opts = {
    ...packagerOpts,
    arch,
    out: packageOutDir,
    platform: plat,
    prune: true,
  }

  if (plat === 'win32') {
    opts = {
      ...opts,
      // @ts-ignore does exist on win32
      'version-string': {
        CompanyName: companyName,
        FileDescription: appName,
        OriginalFilename: appName + '.exe',
        ProductName: appName,
      },
    }
  }

  return packager(opts)
}

function postPack(appPaths: Array<string> | null, plat: string, arch: string) {
  if (!appPaths || appPaths.length === 0) {
    console.log(`${plat}-${arch} finished with no app bundles`)
    return
  }
  const subdir = plat === 'darwin' ? 'Keybase.app/Contents/Resources' : 'resources'
  const dir = path.join(appPaths[0], subdir, 'app/desktop/dist')
  const modules = ['node', 'main', 'tracker2', 'menubar', 'unlock-folders', 'pinentry']
  const files = [
    ...modules.map(p => p + '.bundle.js'),
    ...modules.filter(p => p !== 'node').map(p => p + '.html'),
  ]
  files.forEach(file => {
    try {
      const stats = fs.statSync(path.join(dir, file))
      if (!stats.isFile() && stats.size > 0) {
        console.error(`Detected a problem with packaging ${file}: ${stats.isFile()} ${stats.size}`)
        process.exit(1)
      }
    } catch (err) {
      console.error(`${path.join(dir, file)} doesn't exist`)
      console.error(err)
      process.exit(1)
    }
  })
  console.log(`${plat}-${arch} finished!`)
}

main()
  .then(() => {})
  .catch(() => {})
