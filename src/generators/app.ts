// tslint:disable no-floating-promises
// tslint:disable no-console

import {execSync} from 'child_process'
import * as fs from 'fs'
import * as _ from 'lodash'
import * as path from 'path'
import * as Generator from 'yeoman-generator'
import yosay = require('yosay')

const nps = require('nps-utils')
const sortPjson = require('sort-pjson')
const fixpack = require('fixpack')
const debug = require('debug')('generator-oclif')
const {version} = require('../../package.json')

let hasYarn = false
try {
  execSync('yarn -v')
  hasYarn = true
} catch {}
// function stringToArray(s: string) {
//   const keywords: string[] = []

//   s.split(',').forEach((keyword: string) => {
//     if (!keyword.length) {
//       return false
//     }

//     return keywords.push(keyword.trim())
//   })

//   return keywords
// }

class App extends Generator {
  options: {
    defaults?: boolean
    mocha: boolean
    'semantic-release': boolean
    typescript: boolean
    tslint: boolean
    yarn: boolean
  }
  args!: {[k: string]: string}
  type: 'single' | 'multi' | 'plugin' | 'base'
  path: string
  pjson: any
  githubUser: string | undefined
  answers!: {
    name: string
    bin: string
    description: string
    version: string
    engines: {node: string}
    github: {repo: string, user: string}
    author: string
    files: string
    license: string
    options: {
      mocha: boolean
      typescript: boolean
      tslint: boolean
      yarn: boolean
      'semantic-release': boolean
    }
  }
  mocha!: boolean
  semantic_release!: boolean
  ts!: boolean
  tslint!: boolean
  yarn!: boolean
  get _ext() { return this.ts ? 'ts' : 'js' }
  get _bin() {
    let bin = this.pjson.oclif && (this.pjson.oclif.bin || this.pjson.oclif.dirname) || this.pjson.name
    if (bin.includes('/')) bin = bin.split('/').pop()
    return bin
  }
  repository?: string

  constructor(args: any, opts: any) {
    super(args, opts)

    this.type = opts.type
    this.path = opts.path
    this.options = {
      defaults: opts.defaults,
      mocha: opts.options.includes('mocha'),
      'semantic-release': opts.options.includes('semantic-release'),
      typescript: opts.options.includes('typescript'),
      tslint: opts.options.includes('tslint'),
      yarn: opts.options.includes('yarn'),
    }
  }

  async prompting() {
    let msg
    switch (this.type) {
      case 'single':
        msg = 'Time to build a single-command CLI with oclif!'
        break
      case 'multi':
        msg = 'Time to build a multi-command CLI with oclif!'
        break
      default:
        msg = `Time to build a oclif ${this.type}!`
    }
    this.log(yosay(`${msg} Version: ${version}`))

    if (this.path) {
      this.destinationRoot(path.resolve(this.path))
      process.chdir(this.destinationRoot())
    }
    this.githubUser = await this.user.github.username().catch(debug)
    this.pjson = {
      scripts: {},
      engines: {},
      devDependencies: {},
      dependencies: {},
      oclif: {},
      ...this.fs.readJSON('package.json', {}),
    }
    let repository = this.destinationRoot().split(path.sep).slice(-2).join('/')
    if (this.githubUser) repository = `${this.githubUser}/${repository.split('/')[1]}`
    const defaults = {
      name: this.determineAppname().replace(/ /g, '-'),
      version: '0.0.0',
      license: 'MIT',
      author: this.githubUser ? `${this.user.git.name()} @${this.githubUser}` : this.user.git.name(),
      dependencies: {},
      repository,
      ...this.pjson,
      engines: {
        node: '>=8.0.0',
        ...this.pjson.engines,
      },
      options: this.options,
    }
    this.repository = defaults.repository
    if (this.repository && (this.repository as any).url) {
      this.repository = (this.repository as any).url
    }
    try {
      let yml = this.fs.read('.circleci/config.yml')
      this.options['semantic-release'] = yml.includes('semantic-release')
    } catch { }
    if (this.options.defaults) {
      this.answers = defaults
    } else {
      this.answers = await this.prompt([
        {
          type: 'input',
          name: 'name',
          message: 'npm package name',
          default: defaults.name,
          when: !this.pjson.name,
        },
        {
          type: 'input',
          name: 'bin',
          message: 'command bin name the CLI will export',
          default: (answers: any) => (answers.name || this._bin).split('/').pop(),
          when: ['single', 'multi'].includes(this.type) && !this.pjson.oclif.bin,
        },
        {
          type: 'input',
          name: 'description',
          message: 'description',
          default: defaults.description,
          when: !this.pjson.description,
        },
        {
          type: 'input',
          name: 'author',
          message: 'author',
          default: defaults.author,
          when: !this.pjson.author,
        },
        {
          type: 'input',
          name: 'version',
          message: 'version',
          default: defaults.version,
          when: !this.pjson.version,
        },
        {
          type: 'input',
          name: 'license',
          message: 'license',
          default: defaults.license,
          when: !this.pjson.license,
        },
        {
          type: 'input',
          name: 'engines.node',
          message: 'node version supported',
          default: defaults.engines.node,
          when: !this.pjson.engines.node,
        },
        {
          type: 'input',
          name: 'github.user',
          message: 'github owner of repository (https://github.com/OWNER/repo)',
          default: repository.split('/').slice(0, -1).pop(),
          when: !this.pjson.repository,
        },
        {
          type: 'input',
          name: 'github.repo',
          message: 'github name of repository (https://github.com/owner/REPO)',
          default: (answers: any) => (this.pjson.repository || answers.name || this.pjson.name).split('/').pop(),
          when: !this.pjson.repository,
        },
        {
          type: 'checkbox',
          name: 'options',
          message: 'optional components to include',
          choices: [
            {name: 'yarn (npm alternative)', value: 'yarn', checked: this.options.yarn || hasYarn},
            {name: 'mocha (testing framework)', value: 'mocha', checked: true},
            {name: 'typescript (static typing for javascript)', value: 'typescript', checked: true},
            {name: 'tslint (static analysis tool for typescript)', value: 'tslint', checked: true},
            {name: 'semantic-release (automated version management)', value: 'semantic-release', checked: this.options['semantic-release']}
          ],
          filter: ((arr: string[]) => _.keyBy(arr)) as any,
        },
        // {
        //   type: 'string',
        //   name: 'files',
        //   message: 'npm files to pack',
        //   default: (answers: any) => answers.options.typescript ? '/lib' : '/src',
        //   filter: stringToArray as any,
        // },
      ]) as any
    }
    debug(this.answers)
    this.options = this.answers.options
    this.ts = this.options.typescript
    this.tslint = this.options.tslint
    this.yarn = this.options.yarn
    this.mocha = this.options.mocha
    this.semantic_release = this.options['semantic-release']

    this.pjson.name = this.answers.name || defaults.name
    this.pjson.description = this.answers.description || defaults.description
    this.pjson.version = this.answers.version || defaults.version
    this.pjson.engines.node = this.answers.engines ? this.answers.engines.node : defaults.engines.node
    this.pjson.author = this.answers.author || defaults.author
    this.pjson.files = this.answers.files || defaults.files || [(this.ts ? '/lib' : '/src')]
    this.pjson.license = this.answers.license || defaults.license
    this.repository = this.pjson.repository = this.answers.github ? `${this.answers.github.user}/${this.answers.github.repo}` : defaults.repository
    if (this.ts) {
      const tsProject = this.mocha ? 'test' : '.'
      this.pjson.scripts.posttest = `tsc -p ${tsProject} --noEmit`
      if (this.tslint) this.pjson.scripts.posttest += ` && tslint -p ${tsProject} -t stylish`
    } else {
      this.pjson.scripts.posttest = 'eslint .'
    }
    if (this.mocha) {
      this.pjson.scripts.test = `nyc mocha --forbid-only "test/**/*.test.${this._ext}"`
    } else {
      this.pjson.scripts.test = 'echo NO TESTS'
    }
    if (this.ts) {
      this.pjson.scripts.prepack = 'rm -rf lib && tsc'
    }
    if (['plugin', 'multi'].includes(this.type)) {
      this.pjson.scripts.prepack = nps.series(this.pjson.scripts.prepack, 'oclif-dev manifest', 'oclif-dev readme')
      this.pjson.scripts.postpack = nps.series(this.pjson.scripts.postpack, 'rm -f oclif.manifest.json')
      this.pjson.scripts.version = nps.series('oclif-dev readme', 'git add README.md')
      this.pjson.files.push('/oclif.manifest.json')
    }
    if (this.type === 'plugin' && hasYarn) {
      // for plugins, add yarn.lock file to package so we can lock plugin dependencies
      this.pjson.files.push('/yarn.lock')
    }
    this.pjson.keywords = defaults.keywords || [this.type === 'plugin' ? 'oclif-plugin' : 'oclif']
    this.pjson.homepage = defaults.homepage || `https://github.com/${this.pjson.repository}`
    this.pjson.bugs = defaults.bugs || `https://github.com/${this.pjson.repository}/issues`

    if (['single', 'multi'].includes(this.type)) {
      this.pjson.oclif.bin = this.answers.bin || this._bin
      this.pjson.bin = this.pjson.bin || {}
      this.pjson.bin[this.pjson.oclif.bin] = './bin/run'
      this.pjson.files.push('/bin')
    } else if (this.type === 'plugin') {
      this.pjson.oclif.bin = 'oclif-example'
    }
    if (this.type !== 'plugin') {
      this.pjson.main = defaults.main || (this.ts ? 'lib/index.js' : 'src/index.js')
      if (this.ts) {
        this.pjson.types = defaults.types || 'lib/index.d.ts'
      }
    }
  }

  writing() {
    this.sourceRoot(path.join(__dirname, '../../templates'))

    switch (this.type) {
      case 'multi':
      case 'plugin':
        this.pjson.oclif = {
          commands: `./${this.ts ? 'lib' : 'src'}/commands`,
          // hooks: {init: `./${this.ts ? 'lib' : 'src'}/hooks/init`},
          ...this.pjson.oclif,
        }
        break
        default:
    }
    if (this.type === 'plugin' && !this.pjson.oclif.devPlugins) {
      this.pjson.oclif.devPlugins = [
        '@oclif/plugin-help',
      ]
    }
    if (this.type === 'multi' && !this.pjson.oclif.plugins) {
      this.pjson.oclif.plugins = [
        '@oclif/plugin-help',
      ]
    }

    if (this.pjson.oclif && Array.isArray(this.pjson.oclif.plugins)) {
      this.pjson.oclif.plugins.sort()
    }

    if (this.ts) {
      if (this.tslint) {
        this.fs.copyTpl(this.templatePath('tslint.json'), this.destinationPath('tslint.json'), this)
      }
      this.fs.copyTpl(this.templatePath('tsconfig.json'), this.destinationPath('tsconfig.json'), this)
      if (this.mocha) {
        this.fs.copyTpl(this.templatePath('test/tsconfig.json'), this.destinationPath('test/tsconfig.json'), this)
        this.fs.copyTpl(this.templatePath('nycrc'), this.destinationPath('.nycrc'), this)
      }
    } else {
      this.fs.copyTpl(this.templatePath('eslintrc'), this.destinationPath('.eslintrc'), this)
      const eslintignore = this._eslintignore()
      if (eslintignore.trim()) this.fs.write(this.destinationPath('.eslintignore'), this._eslintignore())
    }
    if (this.mocha) {
      this.fs.copyTpl(this.templatePath('test/helpers/init.js'), this.destinationPath('test/helpers/init.js'), this)
      this.fs.copyTpl(this.templatePath('test/mocha.opts'), this.destinationPath('test/mocha.opts'), this)
    }
    if (this.fs.exists(this.destinationPath('./package.json'))) {
      fixpack(this.destinationPath('./package.json'), require('fixpack/config.json'))
    }
    if (_.isEmpty(this.pjson.oclif)) delete this.pjson.oclif
    this.pjson.files = _.uniq((this.pjson.files || []).sort())
    this.fs.writeJSON(this.destinationPath('./package.json'), sortPjson(this.pjson))
    this.fs.copyTpl(this.templatePath('editorconfig'), this.destinationPath('.editorconfig'), this)
    this.fs.copyTpl(this.templatePath('scripts/greenkeeper'), this.destinationPath('.circleci/greenkeeper'), this)
    // if (this.semantic_release) {
    //   this.fs.copyTpl(this.templatePath('scripts/release'), this.destinationPath('.circleci/release'), this)
    // }
    // this.fs.copyTpl(this.templatePath('scripts/setup_git'), this.destinationPath('.circleci/setup_git'), this)
    this.fs.copyTpl(this.templatePath('README.md.ejs'), this.destinationPath('README.md'), this)
    this.fs.copyTpl(this.templatePath('circle.yml.ejs'), this.destinationPath('.circleci/config.yml'), this)
    this.fs.copyTpl(this.templatePath('appveyor.yml.ejs'), this.destinationPath('appveyor.yml'), this)
    if (this.pjson.license === 'MIT' && (this.pjson.repository.startsWith('oclif') || this.pjson.repository.startsWith('heroku'))) {
      this.fs.copyTpl(this.templatePath('LICENSE.mit'), this.destinationPath('LICENSE'), this)
    }

    // git
    // if (this.fromScratch) this.spawnCommandSync('git', ['init'])
    this.fs.copyTpl(this.templatePath('gitattributes'), this.destinationPath('.gitattributes'), this)

    this.fs.write(this.destinationPath('.gitignore'), this._gitignore())

    switch (this.type) {
      case 'single':
        this._writeSingle()
        break
      case 'plugin':
        this._writePlugin()
        break
      case 'multi':
        this._writeMulti()
        break
      default:
        this._writeBase()
    }
  }

  install() {
    const dependencies: string[] = []
    const devDependencies: string[] = []
    switch (this.type) {
      case 'base': break
      case 'single':
        dependencies.push(
          '@oclif/config@^1',
          '@oclif/command@^1',
          '@oclif/plugin-help@^1',
        )
        break
      case 'plugin':
        dependencies.push(
          '@oclif/command@^1',
          '@oclif/config@^1',
        )
        devDependencies.push(
          '@oclif/dev-cli@^1',
          '@oclif/plugin-help@^1',
          'globby@^8',
        )
        break
      case 'multi':
        dependencies.push(
          '@oclif/config@^1',
          '@oclif/command@^1',
          '@oclif/plugin-help@^1',
        )
        devDependencies.push(
          '@oclif/dev-cli@^1',
          'globby@^8',
        )
    }
    if (this.mocha) {
      devDependencies.push(
        'mocha@^5',
        'nyc@^11',
        'chai@^4',
      )
      if (this.type !== 'base') devDependencies.push(
        '@oclif/test@^1',
      )
    }
    if (this.ts) {
      dependencies.push(
        'tslib@^1',
      )
      devDependencies.push(
        '@types/chai@^4',
        '@types/mocha@^5',
        '@types/node@^10',
        'typescript@^2.8',
        'ts-node@^6',
      )
      if (this.tslint) {
        devDependencies.push(
          '@oclif/tslint@^1',
          'tslint@^5',
        )
      }
    } else {
      devDependencies.push(
        'eslint@^4',
        'eslint-config-oclif@^1',
      )
    }
    let yarnOpts = {} as any
    if (process.env.YARN_MUTEX) yarnOpts.mutex = process.env.YARN_MUTEX
    const install = (deps: string[], opts: object) => this.yarn ? this.yarnInstall(deps, opts) : this.npmInstall(deps, opts)
    const dev = this.yarn ? {dev: true} : {'save-dev': true}
    Promise.all([
      install(devDependencies, {...yarnOpts, ...dev, ignoreScripts: true}),
      install(dependencies, yarnOpts),
    ]).then(() => {
      if (['plugin', 'multi'].includes(this.type)) {
        this.spawnCommandSync(path.join('.', 'node_modules/.bin/oclif-dev'), ['readme'])
      }
      console.log(`\nCreated ${this.pjson.name} in ${this.destinationRoot()}`)
    })
  }

  private _gitignore(): string {
    const existing = this.fs.exists(this.destinationPath('.gitignore')) ? this.fs.read(this.destinationPath('.gitignore')).split('\n') : []
    return _([
      '*-debug.log',
      '*-error.log',
      'node_modules',
      '/tmp',
      '/dist',
      '/.nyc_output',
      this.yarn ? '/package-lock.json' : '/yarn.lock',
      this.ts && '/lib',
    ])
      .concat(existing)
      .compact()
      .uniq()
      .sort()
      .join('\n') + '\n'
  }

  private _eslintignore(): string {
    const existing = this.fs.exists(this.destinationPath('.eslintignore')) ? this.fs.read(this.destinationPath('.eslintignore')).split('\n') : []
    return _([
      this.ts && '/lib',
    ])
      .concat(existing)
      .compact()
      .uniq()
      .sort()
      .join('\n') + '\n'
  }

  private _writeBase() {
    if (!fs.existsSync('src')) {
      this.fs.copyTpl(this.templatePath(`base/src/index.${this._ext}`), this.destinationPath(`src/index.${this._ext}`), this)
    }
    if (this.mocha && !fs.existsSync('test')) {
      this.fs.copyTpl(this.templatePath(`base/test/index.test.${this._ext}`), this.destinationPath(`test/index.test.${this._ext}`), this)
    }
  }

  private _writePlugin() {
    const bin = this._bin
    const cmd = `${bin} hello`
    const opts = {...this as any, _, bin, cmd}
    this.fs.copyTpl(this.templatePath('plugin/bin/run'), this.destinationPath('bin/run'), opts)
    this.fs.copyTpl(this.templatePath('bin/run.cmd'), this.destinationPath('bin/run.cmd'), opts)
    const commandPath = this.destinationPath(`src/commands/hello.${this._ext}`)
    if (!fs.existsSync('src/commands')) {
      this.fs.copyTpl(this.templatePath(`src/command.${this._ext}.ejs`), commandPath, {...opts, name: 'hello', path: commandPath.replace(process.cwd(), '.')})
    }
    if (this.ts && this.type !== 'multi') {
      this.fs.copyTpl(this.templatePath('plugin/src/index.ts'), this.destinationPath('src/index.ts'), opts)
    }
    if (this.mocha && !fs.existsSync('test')) {
      this.fs.copyTpl(this.templatePath(`test/command.test.${this._ext}.ejs`), this.destinationPath(`test/commands/hello.test.${this._ext}`), {...opts, name: 'hello'})
    }
  }

  private _writeSingle() {
    const bin = this._bin
    const opts = {...this as any, _, bin, cmd: bin, name: this.pjson.name}
    this.fs.copyTpl(this.templatePath(`single/bin/run.${this._ext}`), this.destinationPath('bin/run'), opts)
    this.fs.copyTpl(this.templatePath('bin/run.cmd'), this.destinationPath('bin/run.cmd'), opts)
    const commandPath = this.destinationPath(`src/index.${this._ext}`)
    if (!this.fs.exists(`src/index.${this._ext}`)) {
      this.fs.copyTpl(this.templatePath(`src/command.${this._ext}.ejs`), this.destinationPath(`src/index.${this._ext}`), {...opts, path: commandPath.replace(process.cwd(), '.')})
    }
    if (this.mocha && !this.fs.exists(`test/index.test.${this._ext}`)) {
      this.fs.copyTpl(this.templatePath(`test/command.test.${this._ext}.ejs`), this.destinationPath(`test/index.test.${this._ext}`), opts)
    }
  }

  private _writeMulti() {
    this._writePlugin()
    this.fs.copyTpl(this.templatePath('bin/run'), this.destinationPath('bin/run'), this)
    this.fs.copyTpl(this.templatePath('bin/run.cmd'), this.destinationPath('bin/run.cmd'), this)
    if (!this.fs.exists(`src/index.${this._ext}`)) {
      this.fs.copyTpl(this.templatePath(`multi/src/index.${this._ext}`), this.destinationPath(`src/index.${this._ext}`), this)
    }
  }
}

export = App
