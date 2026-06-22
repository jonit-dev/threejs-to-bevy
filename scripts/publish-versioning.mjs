export async function resolvePublishVersions(packageVersions, isPublished) {
  if (packageVersions.length === 0) {
    return { bumped: false, targetVersion: undefined, versions: new Map() };
  }

  const highestCurrent = packageVersions
    .map(({ version }) => parseSemver(version))
    .reduce((highest, version) => compareSemver(version, highest) > 0 ? version : highest);
  const highestCurrentText = formatSemver(highestCurrent);

  let requiresBump = false;
  for (const { name, version } of packageVersions) {
    if (version !== highestCurrentText || await isPublished(name, version)) {
      requiresBump = true;
      break;
    }
  }

  if (!requiresBump) {
    return {
      bumped: false,
      targetVersion: highestCurrentText,
      versions: new Map(packageVersions.map(({ name, version }) => [name, version])),
    };
  }

  let candidate = nextPatchVersion(highestCurrentText);
  while (await isAnyPublished(packageVersions, candidate, isPublished)) {
    candidate = nextPatchVersion(candidate);
  }

  return {
    bumped: true,
    targetVersion: candidate,
    versions: new Map(packageVersions.map(({ name }) => [name, candidate])),
  };
}

export function nextPatchVersion(version) {
  const parsed = parseSemver(version);
  return formatSemver({ ...parsed, patch: parsed.patch + 1 });
}

function parseSemver(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (match === null) {
    throw new Error(`Expected semver version x.y.z, got '${version}'.`);
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

function compareSemver(left, right) {
  return left.major - right.major || left.minor - right.minor || left.patch - right.patch;
}

function formatSemver(version) {
  return `${version.major}.${version.minor}.${version.patch}`;
}

async function isAnyPublished(packageVersions, version, isPublished) {
  for (const { name } of packageVersions) {
    if (await isPublished(name, version)) {
      return true;
    }
  }
  return false;
}
