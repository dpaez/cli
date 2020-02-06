'use strict'

require('../lib/fs-promises')
const { test } = require('tap')
const match = require('stream-match')
const { promises: fs } = require('fs')
const { encode } = require('dat-encoding')
const { createEnv, onExit } = require('./util')
const P2PCommons = require('@p2pcommons/sdk-js')

test('prompt', async t => {
  const { spawn, exec } = createEnv()
  await exec('create profile -y -n=n -d')
  const ps = spawn('create')
  await match(ps.stdout, 'Profile')
  ps.stdin.write('\n')
  await match(ps.stdout, 'Title')
  ps.stdin.write('title\n')
  await match(ps.stdout, 'Description')
  ps.stdin.write('description\n')
  await match(ps.stdout, 'subtype')
  ps.stdin.write('\n')
  await match(ps.stdout, 'License')
  ps.stdin.write('y')
  const code = await onExit(ps)
  t.equal(code, 0)
})

test('requires title', async t => {
  const { spawn, exec } = createEnv()
  await exec('create profile -y -n=n -d')
  const ps = spawn('create -y')
  await match(ps.stdout, 'Profile')
  ps.stdin.write('\n')
  await match(ps.stdout, 'Title')
  ps.stdin.write('\n')
  await match(ps.stdout, 'Title required')
  ps.stdin.write('title\n')
  await match(ps.stdout, 'Description')
  ps.stdin.write('description\n')
  await match(ps.stdout, 'subtype')
  ps.stdin.write('\n')
  const code = await onExit(ps)
  t.equal(code, 0)
})

test('requires name', async t => {
  const { spawn } = createEnv()
  const ps = spawn('create -y')
  await match(ps.stdout, 'Profile')
  ps.stdin.write(Buffer.from('1b5b42', 'hex')) // down arrow
  ps.stdin.write('\n')
  await match(ps.stdout, 'Name')
  ps.stdin.write('\n')
  await match(ps.stdout, 'Name required')
  ps.stdin.write('name\n')
  await match(ps.stdout, 'Description')
  ps.stdin.write('description\n')
  const code = await onExit(ps)
  t.equal(code, 0)
})

test('requires license confirmation', async t => {
  const { spawn, exec } = createEnv()
  await exec('create profile -y -n=n -d')
  const ps = spawn('create')
  await match(ps.stdout, 'Profile')
  ps.stdin.write('\n')
  await match(ps.stdout, 'Title')
  ps.stdin.write('title\n')
  await match(ps.stdout, 'Description')
  ps.stdin.write('description\n')
  await match(ps.stdout, 'subtype')
  ps.stdin.write('\n')
  await match(ps.stdout, 'License')
  ps.stdin.write('\n')
  const code = await onExit(ps)
  t.equal(code, 1)
})

test('license confirmation can be skipped', async t => {
  const { spawn, exec } = createEnv()
  await exec('create profile -y -n=n -d')
  const ps = spawn('create -y')
  await match(ps.stdout, 'Profile')
  ps.stdin.write('\n')
  await match(ps.stdout, 'Title')
  ps.stdin.write('title\n')
  await match(ps.stdout, 'Description')
  ps.stdin.write('description\n')
  await match(ps.stdout, 'subtype')
  ps.stdin.write('\n')
  const code = await onExit(ps)
  t.equal(code, 0)
})

test('create content', async t => {
  const { spawn, exec, env } = createEnv()
  await exec('create profile -y -n=n -d')
  const ps = spawn('create content -y')
  await match(ps.stdout, 'Title')
  ps.stdin.write('title\n')
  await match(ps.stdout, 'Description')
  ps.stdin.write('description\n')
  await match(ps.stdout, 'subtype')
  ps.stdin.write('\n')
  const url = await match(ps.stdout, /dat:\/\/(.+)/)
  const code = await onExit(ps)
  t.equal(code, 0)

  const dat = require(`${env}/${url}/dat.json`)
  t.equal(dat.p2pcommons.authors.length, 1)
})

test('no content without profile allowed', async t => {
  const { spawn } = createEnv()
  const ps = await spawn('create content -y -t=t -d -s=Q17737')
  await match(ps.stderr, 'create your profile first')
  ps.stdin.write('Julian\n')
  await match(ps.stdout, 'Description')
  ps.stdin.write('\n')
  const code = await onExit(ps)
  t.equal(code, 0)
})

test('create profile', async t => {
  const { spawn } = createEnv()
  const ps = spawn('create profile -y')
  await match(ps.stdout, 'Name')
  ps.stdin.write('name\n')
  await match(ps.stdout, 'Description')
  ps.stdin.write('description\n')
  const code = await onExit(ps)
  t.equal(code, 0)
})

test('only one profile allowed', async t => {
  const { exec } = createEnv()
  await exec('create profile -y -n=n -d')
  let threw = false
  try {
    await exec('create profile -y -n=n -d')
  } catch (err) {
    threw = true
    t.match(err.stderr, /A local profile already exists/)
  }
  t.ok(threw)
})

test('parent content', async t => {
  const { env, spawn } = createEnv()
  const p2p = new P2PCommons({ baseDir: env, disableSwarm: true })
  await p2p.ready()
  const {
    rawJSON: { url: contentKey }
  } = await p2p.init({ type: 'content', title: 'Content' })
  const {
    rawJSON: { url: profileKey }
  } = await p2p.init({ type: 'profile', title: 'Name' })
  await p2p.register(contentKey, profileKey)
  await p2p.destroy()
  const ps = spawn('create content -y -t=t -d -s=Q17737')
  await match(ps.stdout, 'Select parent modules')
  ps.stdin.write(' \n')
  const createdKey = await match(ps.stdout, /dat:\/\/(.+)/)
  const code = await onExit(ps)
  t.equal(code, 0)
  const dat = require(`${env}/${createdKey}/dat.json`)
  t.deepEqual(dat.p2pcommons.parents, [contentKey])
})

test('create <type> --title --description --subtype --parent', async t => {
  await t.test('creates files', async t => {
    const { exec, env } = createEnv()
    const p2p = new P2PCommons({ baseDir: env, disableSwarm: true })
    await p2p.ready()
    const {
      rawJSON: { url }
    } = await p2p.init({ type: 'content', title: 'c' })
    await p2p.destroy()
    await exec('create profile -y -n=n -d')
    const { stdout } = await exec(
      `create content -t=t -d=d -s=Q17737 --parent=${url} -y`
    )
    const hash = encode(stdout.trim())
    await fs.stat(`${env}/${hash}`)
    await fs.stat(`${env}/${hash}/dat.json`)
    await fs.stat(`${env}/.dat`)
  })

  await t.test('requires title', async t => {
    const { spawn, exec } = createEnv()
    await exec('create profile -y -n=n -d')
    const ps = spawn('create content --description=d -s=Q17737 -y')
    await match(ps.stdout, 'Title')
    ps.kill()
  })

  await t.test('requires name', async t => {
    const { spawn } = createEnv()
    const ps = spawn('create profile --description=d -s=Q17737 -y')
    await match(ps.stdout, 'Name')
    ps.kill()
  })

  await t.test('description can be empty', async t => {
    const { exec } = createEnv()
    await exec('create profile -y -n=n -d ')
    await exec('create content -y -t=t -d -s=Q17737')
    await exec('create content -y -t=t -d="" -s=Q17737')
  })

  await t.test('multiple parents', async t => {
    const { exec, env } = createEnv()
    const p2p = new P2PCommons({ baseDir: env, disableSwarm: true })
    await p2p.ready()
    const [
      {
        rawJSON: { url: parent1 }
      },
      {
        rawJSON: { url: parent2 }
      }
    ] = await Promise.all([
      p2p.init({ type: 'content', title: 'c' }),
      p2p.init({ type: 'content', title: 'c' }),
      p2p.init({ type: 'profile', title: 'p' })
    ])
    await p2p.destroy()
    await exec(
      `create content -t=t -d=d -s=Q17737 --parent=${parent1} --parent=${parent2} -y`
    )
  })
})
