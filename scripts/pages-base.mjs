import { pathToFileURL } from 'node:url';

export function pagesBasePath(repository) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository ?? '')) {
    throw new Error('GITHUB_REPOSITORY must be owner/repository.');
  }
  const [owner, name] = repository.split('/');
  return name.toLowerCase() === `${owner.toLowerCase()}.github.io` ? '/' : `/${name}/`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(`VITE_BASE_PATH=${pagesBasePath(process.env.GITHUB_REPOSITORY)}`);
}
