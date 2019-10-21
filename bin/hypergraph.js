#!/usr/bin/env node
'use strict'

process.title = 'hypergraph'

require('fs.promises')

const P2PCommons = require('@p2pcommons/sdk-js')
const minimist = require('minimist')
const prompt = require('../lib/prompt')
const UserError = require('../lib/user-error')
const { version } = require('../package.json')
const { resolve } = require('path')

const help = `
  Usage
    $ hypergraph <action> <input>

  Actions
    create <type>              Create a module
    read   <hash> [key]        Read a module's metadata
    update <hash> [key value]  Update a module's metadata
    list   <type>              List writable modules

  Options
    --env, -e                  Dotfiles path (default ~/.p2pcommons)
    --help, -h                 Display help text
    --version, -v              Display version
  
  Module types
    - content                  A content module
    - profile                  A user profile module

  Examples
    $ hypergraph               [interactive mode]
`

const argv = minimist(process.argv.slice(2), {
  alias: {
    env: 'e',
    help: 'h',
    version: 'v'
  }
})

if (argv.help) {
  console.log(help)
  process.exit(1)
}

if (argv.version) {
  console.log(version)
  process.exit(0)
}

const actions = {}

actions.create = {
  title: 'Create a module',
  input: [{ name: 'type', resolve: askType }],
  handler: async (p2p, { type }) => {
    const title = await prompt({
      type: 'text',
      message: 'Title'
    })
    const description = await prompt({
      type: 'text',
      message: 'Description'
    })
    const { url } = await p2p.init({ type, title, description })

    console.log(`dat://${url.toString('hex')}`)
  }
}

actions.read = {
  title: 'Read metadata',
  input: [
    {
      name: 'hash',
      resolve: () =>
        prompt({
          type: 'text',
          message: 'Hash'
        })
    },
    { name: 'key' }
  ],
  handler: async (p2p, { hash, key }) => {
    const meta = await p2p.get(hash)
    if (key) {
      console.log(JSON.stringify(renderKV(key, meta[key])))
    } else {
      console.log(JSON.stringify(meta, renderKV, 2))
    }
  }
}

actions.update = {
  title: 'Update metadata',
  input: [
    {
      name: 'hash',
      resolve: () =>
        prompt({
          type: 'text',
          message: 'Hash'
        })
    },
    { name: 'key' },
    { name: 'value' }
  ],
  handler: async (p2p, { hash, key, value }) => {
    const meta = await p2p.get(hash)

    if (key) {
      if (!allowedKeyUpdates.includes(key)) {
        throw new InvalidKeyError(
          `Only allowed to update keys ${allowedKeyUpdates.join(', ')}`
        )
      }
      meta[key] = value || ''
    } else {
      for (const key of allowedKeyUpdates) {
        meta[key] = await prompt({
          type: 'text',
          message: key,
          initial: meta[key]
        })
      }
    }

    await p2p.set(meta)
  }
}

actions.list = {
  title: 'List writable modules',
  input: [{ name: 'type', resolve: askType }],
  handler: async (p2p, { type }) => {
    const fn = {
      content: 'listContent',
      profile: 'listProfiles'
    }[type]
    const mods = await p2p[fn]()
    for (const mod of mods) {
      console.log(`dat://${mod.url.toString('hex')}`)
    }
  }
}

const allowedKeyUpdates = ['title', 'description', 'main']
class InvalidKeyError extends UserError {}

const renderKV = (key, value) => {
  return key === 'url' ? `dat://${Buffer.from(value).toString('hex')}` : value
}

const main = async () => {
  let [actionName, ...rawInput] = argv._
  if (!actionName) {
    actionName = await prompt({
      type: 'select',
      message: 'Pick an action',
      choices: Object.entries(actions).map(([value, { title }]) => ({
        title,
        value
      }))
    })
  }

  const action = actions[actionName]
  const input = {}
  for (const [idx, { name, resolve }] of Object.entries(action.input)) {
    input[name] = rawInput[idx] || (resolve && (await resolve()))
  }

  const p2p = new P2PCommons({ baseDir: argv.env && resolve(argv.env) })
  await p2p.ready()
  await action.handler(p2p, input)
  await p2p.destroy()
}

main().catch(err => {
  // istanbul ignore else
  if (err instanceof UserError) {
    if (err.message) console.error(err.message)
  } else {
    console.error(err)
  }

  process.exit(1)
})

function askType () {
  return prompt({
    type: 'select',
    message: 'Select type',
    choices: [
      { title: 'Content', value: 'content' },
      { title: 'Profile', value: 'profile' }
    ]
  })
}
