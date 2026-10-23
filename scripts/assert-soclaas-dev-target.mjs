// Temporary Milestone A safeguard: the exported connectivity callable is dev-only.
if (process.env.GCLOUD_PROJECT !== 'helpinus-dev') {
  console.error('Functions deployment blocked: SoCLaaS connectivity is limited to helpinus-dev.')
  process.exitCode = 1
}
