import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const repoRoot = process.cwd()
const packageJsonPath = path.join(repoRoot, 'package.json')
const packageLockPath = path.join(repoRoot, 'package-lock.json')

const MIN_VERSION = '1.0.0'

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

function compareVersions(left, right) {
  const [lMajor, lMinor, lPatch] = left.split('.').map(Number)
  const [rMajor, rMinor, rPatch] = right.split('.').map(Number)
  if (lMajor !== rMajor) return lMajor - rMajor
  if (lMinor !== rMinor) return lMinor - rMinor
  return lPatch - rPatch
}

function normalizeCurrentVersion(version) {
  return compareVersions(version, MIN_VERSION) < 0 ? MIN_VERSION : version
}

function bumpVersion(version, bumpType) {
  const [major, minor, patch] = version.split('.').map(Number)
  switch (bumpType) {
    case 'major':
      return `${major + 1}.0.0`
    case 'minor':
      return `${major}.${minor + 1}.0`
    case 'patch':
      return `${major}.${minor}.${patch + 1}`
    default:
      return version
  }
}

function runGit(command) {
  return execSync(command, {
    cwd: repoRoot,
    stdio: ['ignore', 'pipe', 'ignore'],
    encoding: 'utf8',
  }).trim()
}

function getLatestReleaseTag() {
  try {
    return runGit('git describe --tags --match "v[0-9]*" --abbrev=0')
  } catch {
    return null
  }
}

function getCommitMessagesSince(tag) {
  const range = tag ? `${tag}..HEAD` : 'HEAD'
  const output = runGit(`git log ${range} --format=%s%n%b%n---commit---`)
  return output
    .split('---commit---')
    .map((entry) => entry.trim())
    .filter(Boolean)
}

function classifyCommit(message) {
  const normalized = message.trim()
  if (!normalized) return 'patch'

  if (
    /BREAKING CHANGE/i.test(normalized) ||
    /BREAKING:/i.test(normalized) ||
    /^[a-z]+(\(.+\))?!:/i.test(normalized) ||
    /\bmajor\b/i.test(normalized)
  ) {
    return 'major'
  }

  if (
    /^(feat|feature|add|introduce|implement)(\(.+\))?:/i.test(normalized) ||
    /^(feat|feature|add|introduce|implement)\b/i.test(normalized)
  ) {
    return 'minor'
  }

  return 'patch'
}

function determineBump(messages) {
  let bump = 'none'
  for (const message of messages) {
    const current = classifyCommit(message)
    if (current === 'major') return 'major'
    if (current === 'minor') bump = bump === 'none' || bump === 'patch' ? 'minor' : bump
    if (current === 'patch' && bump === 'none') bump = 'patch'
  }
  return bump
}

function applyVersion(version) {
  const packageJson = readJson(packageJsonPath)
  packageJson.version = version
  writeJson(packageJsonPath, packageJson)

  if (fs.existsSync(packageLockPath)) {
    const packageLock = readJson(packageLockPath)
    packageLock.version = version
    if (packageLock.packages?.['']) {
      packageLock.packages[''].version = version
    }
    writeJson(packageLockPath, packageLock)
  }
}

function verifyTagMatchesPackage(expectedTagInput) {
  const packageJson = readJson(packageJsonPath)
  const version = normalizeCurrentVersion(packageJson.version)
  const expectedTag = `v${version}`
  const rawInput = expectedTagInput || process.env.GITHUB_REF_NAME || ''
  const actualTag = rawInput.startsWith('refs/tags/') ? rawInput.replace('refs/tags/', '') : rawInput

  if (!actualTag) {
    throw new Error(`No tag value provided. Expected ${expectedTag}.`)
  }
  if (actualTag !== expectedTag) {
    throw new Error(`Release tag ${actualTag} does not match package version ${version}. Expected ${expectedTag}.`)
  }
  console.log(expectedTag)
}

function main() {
  const args = process.argv.slice(2)
  const shouldApply = args.includes('--apply')
  const shouldVerifyTag = args.includes('--verify-tag')

  if (shouldVerifyTag) {
    const valueIndex = args.indexOf('--verify-tag')
    const explicitTag = valueIndex >= 0 ? args[valueIndex + 1] : undefined
    verifyTagMatchesPackage(explicitTag)
    return
  }

  const packageJson = readJson(packageJsonPath)
  const currentVersion = normalizeCurrentVersion(packageJson.version)
  const latestTag = getLatestReleaseTag()
  const commitMessages = latestTag ? getCommitMessagesSince(latestTag) : []
  const bumpType = currentVersion === MIN_VERSION && packageJson.version !== MIN_VERSION
    ? 'none'
    : determineBump(commitMessages)
  const nextVersion = bumpType === 'none' ? currentVersion : bumpVersion(currentVersion, bumpType)

  if (shouldApply) {
    applyVersion(nextVersion)
  }

  console.log(JSON.stringify({
    currentVersion,
    latestTag,
    commitsConsidered: commitMessages.length,
    bumpType,
    nextVersion,
  }, null, 2))
}

main()
