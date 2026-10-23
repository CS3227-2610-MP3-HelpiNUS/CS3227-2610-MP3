const supportedProjects = new Set(['helpinus-dev', 'helpinus-prod'])

if (!supportedProjects.has(process.env.GCLOUD_PROJECT ?? '')) {
  console.error('Functions deployment blocked: expected helpinus-dev or helpinus-prod.')
  process.exitCode = 1
}
